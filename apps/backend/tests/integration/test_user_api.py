"""
Integration tests for user API endpoints.
Tests complete flows with real database interactions.
"""
import pytest
from sqlalchemy import delete, select
from datetime import datetime, timezone, timedelta

from app.core.security import create_access_token, verify_password
from app.models.audit_log import AuditLog
from app.models.department import Department
from app.models.notification_preference import NotificationPreference, NoteType
from app.models.user import Role, Sex, User
from ..utils.utils import random_email, random_employee_id, random_lower_string, random_date


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _make_token(user: User) -> str:
    return create_access_token(
        {
            "user_id": user.id,
            "role": user.role.name,
            "employee_id": user.employee_id,
            "name": user.name,
        }
    )


async def _seed_user_data(test_db_session):
    department = Department(name="IT")
    test_db_session.add(department)
    await test_db_session.flush()

    admin = User(
        id=1,
        employee_id="A00000001",
        password="testpassword",
        name="Admin User",
        sex=Sex.MALE,
        department_id=department.id,
        role=Role.ADMIN,
        email="admin@example.com",
        must_change_password=False,
        last_password_changed_at=None,
        created_at=random_date(),
    )
    employee = User(
        id=2,
        employee_id="E00000002",
        password="oldpassword",
        name="Employee User",
        sex=Sex.FEMALE,
        department_id=department.id,
        role=Role.EMPLOYEE,
        email="employee@example.com",
        must_change_password=True,
        last_password_changed_at=None,
        created_at=random_date(),
    )
    test_db_session.add_all([admin, employee])
    await test_db_session.flush()

    admin_pref = NotificationPreference(
        id=1,
        user_id=admin.id,
        type=NoteType.EMAIL,
        value=admin.email,
    )
    test_db_session.add(admin_pref)
    await test_db_session.commit()

    return {
        "department": department,
        "admin": admin,
        "employee": employee,
        "admin_pref": admin_pref,
    }


@pytest.fixture(autouse=True)
async def clean_user_tables(test_db_session):
    await test_db_session.rollback()
    for model in (AuditLog, NotificationPreference, User, Department):
        await test_db_session.execute(delete(model))
    await test_db_session.commit()

    yield

    await test_db_session.rollback()
    for model in (AuditLog, NotificationPreference, User, Department):
        await test_db_session.execute(delete(model))
    await test_db_session.commit()


@pytest.fixture
async def seeded_user_data(test_db_session):
    return await _seed_user_data(test_db_session)


@pytest.fixture
def admin_token(seeded_user_data):
    return _make_token(seeded_user_data["admin"])


@pytest.fixture
def employee_token(seeded_user_data):
    return _make_token(seeded_user_data["employee"])


async def test_when_receive_get_my_profile_then_should_return_200_with_user_info(
    client, seeded_user_data, admin_token
):
    response = await client.get("/api/users/me", headers=_auth_header(admin_token))

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == seeded_user_data["admin"].id
    assert data["employee_id"] == "A00000001"
    assert data["name"] == "Admin User"


async def test_when_receive_get_my_profile_without_token_then_should_return_403(client):
    response = await client.get("/api/users/me")

    assert response.status_code == 401

async def test_when_receive_get_my_profile_with_non_existent_user_then_should_return_404(client):
    # Create a token with non-existent user ID
    token = create_access_token({"user_id": 99999, "role": "EMPLOYEE", "employee_id": "E99999"})
    response = await client.get("/api/users/me", headers=_auth_header(token))

    assert response.status_code == 404


async def test_when_receive_valid_password_change_then_should_return_200(
    client,
    employee_token,
    seeded_user_data,
    test_db_session,
):
    response = await client.put(
        "/api/users/me/password",
        json={"current_password": "oldpassword", "new_password": "newpassword"},
        headers=_auth_header(employee_token),
    )

    assert response.status_code == 200
    assert response.json()["message"] == "password updated"

    employee = seeded_user_data["employee"]
    result = await test_db_session.execute(select(User).where(User.id == employee.id))
    row = result.scalar_one_or_none()
    assert row is not None
    assert verify_password("newpassword", row.password)
    assert row.must_change_password is False
    assert row.last_password_changed_at is not None


async def test_when_receive_invalid_current_password_then_should_return_401(client, employee_token):
    response = await client.put(
        "/api/users/me/password",
        json={"current_password": "wrongpassword", "new_password": "newpassword"},
        headers=_auth_header(employee_token),
    )

    assert response.status_code == 401


async def test_when_receive_same_current_and_new_password_then_should_return_422(client, employee_token):
    response = await client.put(
        "/api/users/me/password",
        json={"current_password": "oldpassword", "new_password": "oldpassword"},
        headers=_auth_header(employee_token),
    )

    assert response.status_code == 422


async def test_when_receive_list_notification_preferences_then_should_return_200_with_list(
    client,
    admin_token,
    seeded_user_data,
):
    response = await client.get("/api/users/me/notification-preferences", headers=_auth_header(admin_token))

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == seeded_user_data["admin_pref"].id
    assert data[0]["type"] == "EMAIL"
    assert data[0]["value"] == "admin@example.com"


async def test_when_receive_upsert_notification_preference_then_should_return_200_with_updated_pref(
    client,
    admin_token,
    seeded_user_data,
    test_db_session,
):
    new_value = random_email()
    response = await client.put(
        "/api/users/me/notification-preferences",
        json={"type": "EMAIL", "value": new_value},
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == seeded_user_data["admin_pref"].id
    assert data["type"] == "EMAIL"
    assert data["value"] == new_value

    result = await test_db_session.execute(
        select(NotificationPreference).where(NotificationPreference.id == seeded_user_data["admin_pref"].id)
    )
    row = result.scalar_one_or_none()
    assert row is not None
    assert row.value == new_value


async def test_when_admin_creates_user_then_should_return_201_with_user_info(client, admin_token, seeded_user_data):
    now = datetime.now(timezone.utc)
    payload = {
        "employee_id": random_employee_id(),
        "password": random_lower_string(12),
        "name": random_lower_string(10),
        "sex": "MALE",
        "department_id": seeded_user_data["department"].id,
        "location": "Headquarters",
        "email": random_email(),
        "role": "EMPLOYEE",
        "hire_date": (now - timedelta(days=365)).date().isoformat(),
    }
    response = await client.post("/api/users", json=payload, headers=_auth_header(admin_token))

    assert response.status_code == 201, response.json()
    data = response.json()
    assert data["employee_id"] == payload["employee_id"]
    assert data["name"] == payload["name"]
    assert data["role"] == "EMPLOYEE"


async def test_when_non_admin_creates_user_then_should_return_403(client, employee_token, seeded_user_data):
    payload = {
        "employee_id": random_employee_id(),
        "password": random_lower_string(12),
        "name": random_lower_string(10),
        "sex": "FEMALE",
        "department_id": seeded_user_data["department"].id,
        "email": random_email(),
        "role": "EMPLOYEE",
    }
    response = await client.post("/api/users", json=payload, headers=_auth_header(employee_token))

    assert response.status_code == 403


async def test_when_admin_lists_users_then_should_return_200_with_user_list(client, admin_token):
    response = await client.get("/api/users", headers=_auth_header(admin_token))

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["employee_id"] == "E00000002"
    assert data[1]["employee_id"] == "A00000001"


async def test_when_admin_gets_specific_user_then_should_return_200_with_user_info(
    client,
    admin_token,
    seeded_user_data,
):
    employee = seeded_user_data["employee"]
    response = await client.get(f"/api/users/{employee.employee_id}", headers=_auth_header(admin_token))

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == employee.id
    assert data["employee_id"] == employee.employee_id


async def test_when_admin_gets_nonexistent_user_then_should_return_404(client, admin_token):
    response = await client.get("/api/users/99999", headers=_auth_header(admin_token))

    assert response.status_code == 404


async def test_when_admin_updates_user_then_should_return_200_with_updated_user(
    client,
    admin_token,
    seeded_user_data,
):
    employee = seeded_user_data["employee"]
    payload = {
        "name": random_lower_string(10),
        "email": random_email(),
        "sex": "FEMALE",
    }
    response = await client.put(f"/api/users/{employee.employee_id}", json=payload, headers=_auth_header(admin_token))

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == employee.id
    assert data["name"] == payload["name"]
    assert data["email"] == payload["email"]


async def test_when_admin_deletes_user_then_should_return_204(client, admin_token, seeded_user_data, test_db_session):
    employee = seeded_user_data["employee"]
    response = await client.delete(f"/api/users/{employee.employee_id}", headers=_auth_header(admin_token))

    assert response.status_code == 204

    result = await test_db_session.execute(select(User).where(User.id == employee.id))
    assert result.scalar_one_or_none() is None


async def test_when_admin_creates_duplicate_employee_id_then_should_return_409(
    client,
    admin_token,
    seeded_user_data,
):
    """Test that creating user with duplicate employee_id returns 409."""
    payload = {
        "employee_id": "A00000001",  # Already exists
        "password": random_lower_string(12),
        "name": random_lower_string(10),
        "sex": "MALE",
        "department_id": seeded_user_data["department"].id,
        "email": random_email(),
        "role": "EMPLOYEE",
    }
    response = await client.post("/api/users", json=payload, headers=_auth_header(admin_token))

    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


async def test_when_get_my_profile_but_user_deleted_then_should_return_404(
    client,
    admin_token,
    seeded_user_data,
    test_db_session,
):
    """Test that getting profile of deleted user returns 404."""
    admin = seeded_user_data["admin"]
    # Delete notification preferences first (FK constraint)
    await test_db_session.execute(
        delete(NotificationPreference).where(NotificationPreference.user_id == admin.id)
    )
    await test_db_session.flush()
    # Then delete the admin user
    await test_db_session.delete(admin)
    await test_db_session.commit()

    response = await client.get("/api/users/me", headers=_auth_header(admin_token))

    assert response.status_code == 404


async def test_when_change_password_but_user_deleted_then_should_return_404(
    client,
    employee_token,
    seeded_user_data,
    test_db_session,
):
    """Test that changing password of deleted user returns 404."""
    employee = seeded_user_data["employee"]
    # Delete the employee
    await test_db_session.delete(employee)
    await test_db_session.commit()

    response = await client.put(
        "/api/users/me/password",
        json={"current_password": "oldpassword", "new_password": "newpassword"},
        headers=_auth_header(employee_token),
    )

    assert response.status_code == 404


async def test_when_admin_lists_users_with_keyword_then_should_return_filtered_list(
    client,
    admin_token,
    seeded_user_data,
):
    """Test that listing users with keyword filter works correctly."""
    # Search by employee_id
    response = await client.get("/api/users?keyword=A00000001", headers=_auth_header(admin_token))

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["employee_id"] == "A00000001"

    # Search by name
    response = await client.get("/api/users?keyword=Admin", headers=_auth_header(admin_token))

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Admin User"

    # Search by email
    response = await client.get("/api/users?keyword=employee@example.com", headers=_auth_header(admin_token))

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["email"] == "employee@example.com"


async def test_when_admin_updates_nonexistent_user_then_should_return_404(
    client,
    admin_token,
):
    """Test that updating nonexistent user returns 404."""
    payload = {"name": random_lower_string(10)}
    response = await client.put(
        "/api/users/99999",
        json=payload,
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 404


async def test_when_admin_deletes_nonexistent_user_then_should_return_404(
    client,
    admin_token,
):
    """Test that deleting nonexistent user returns 404."""
    response = await client.delete("/api/users/99999", headers=_auth_header(admin_token))

    assert response.status_code == 404


async def test_when_user_has_no_notification_preferences_then_should_return_empty_list(
    client,
    employee_token,
    seeded_user_data,
    test_db_session,
):
    """Test that listing notification preferences returns empty list when none exist."""
    employee = seeded_user_data["employee"]
    # Remove the default preference if any
    await test_db_session.execute(
        delete(NotificationPreference).where(NotificationPreference.user_id == employee.id)
    )
    await test_db_session.commit()

    response = await client.get(
        "/api/users/me/notification-preferences",
        headers=_auth_header(employee_token),
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 0


async def test_when_update_existing_notification_preference_then_should_return_updated_pref(
    client,
    admin_token,
    seeded_user_data,
    test_db_session,
):
    """Test that updating existing notification preference returns the updated value."""
    admin = seeded_user_data["admin"]
    original_pref = seeded_user_data["admin_pref"]
    new_value = random_email()

    # First upsert to create/update
    response = await client.put(
        "/api/users/me/notification-preferences",
        json={"type": "EMAIL", "value": new_value},
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == original_pref.id  # Same preference ID (updated, not created)
    assert data["value"] == new_value

    # Verify DB has only one EMAIL preference
    result = await test_db_session.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_id == admin.id,
            NotificationPreference.type == NoteType.EMAIL,
        )
    )
    prefs = result.scalars().all()
    assert len(prefs) == 1
    assert prefs[0].value == new_value


async def test_when_create_new_notification_preference_type_then_should_return_created_pref(
    client,
    admin_token,
    seeded_user_data,
    test_db_session,
):
    """Test that creating notification preference with new type returns it."""
    admin = seeded_user_data["admin"]
    slack_email = random_email()

    response = await client.put(
        "/api/users/me/notification-preferences",
        json={"type": "SLACK", "value": slack_email},
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "SLACK"
    assert data["value"] == slack_email

    # Verify DB has both EMAIL and SLACK preferences
    result = await test_db_session.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == admin.id)
    )
    prefs = result.scalars().all()
    assert len(prefs) == 2
    assert {p.type.name for p in prefs} == {"EMAIL", "SLACK"}
