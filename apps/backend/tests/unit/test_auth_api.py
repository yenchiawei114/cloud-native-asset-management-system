from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from jose import jwt

from app.core.config import settings
from app.core.security import create_access_token
from .conftest import FakeResult


class FakeSession:
    def __init__(self) -> None:
        self.user = SimpleNamespace(
            id=1,
            employee_id="A00000001",
            password="testpassword",
            name="Admin User",
            must_change_password=False,
            is_active=True,
            role=SimpleNamespace(name="ADMIN"),
        )

    async def execute(self, stmt):
        return FakeResult(self.user)

    async def get(self, model, key):
        if key == self.user.id:
            return self.user
        return None


@pytest.fixture
def fake_db_session():
    return FakeSession()


# @pytest.fixture(autouse=True)
# def seed_user():
#     yield


def test_when_receive_valid_login_request_then_should_issue_jwt(client):
    # arrange: fake db already contains user A00000001 with password testpassword
    credentials = {"employee_id": "A00000001", "password": "testpassword"}
    
    # act: send login request with valid credentials
    response = client.post("/api/login", json=credentials)
    
    # assert: response should contain a valid JWT token
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    # assert data["must_change_password"] is False


def test_when_receive_non_existent_employee_id_then_should_return_401(client):
    # arrange: employee ID does not exist in the database
    invalid_credentials = {"employee_id": "fakeid", "password": "fakepassword"}
    
    # act: send login request with invalid credentials
    response = client.post("/api/login", json=invalid_credentials)
    
    # assert: response should reject with 401 to prevent user enumeration
    assert response.status_code == 401


def test_when_receive_wrong_password_then_should_return_401(client):
    # arrange: valid Employee ID but with the wrong password
    invalid_credentials = {"employee_id": "A00000001", "password": "wrongpassword"}
    
    # act: send login request with invalid credentials
    response = client.post("/api/login", json=invalid_credentials)
    
    # assert: response should reject with 401
    assert response.status_code == 401


def test_when_receive_get_me_with_valid_token_then_should_return_user_info(client):
    # arrange: create a valid JWT token for an admin user
    user_payload = {"user_id": 1, "role": "ADMIN", "employee_id": "A00000001"}
    token = create_access_token(user_payload)
    
    # act: request the /api/me endpoint with the valid token
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/me", headers=headers)
    
    # assert: response should contain the user information from the token
    print(response.json())
    print(user_payload)
    print(type(response.json()["user_id"]))
    print(type(user_payload["user_id"]))
    assert response.status_code == 200
    assert response.json() == user_payload


def test_when_receive_get_me_without_token_then_should_return_403_or_401(client):
    # arrange: no headers provided
    headers = None

    # act: request the /api/me endpoint with no headers
    response = client.get("/api/me", headers=headers)
    
    # assert: response should reject with 401 or 403
    assert response.status_code in (401, 403)


def test_when_receive_get_me_with_invalid_token_then_should_return_401(client):
    # arrange: create malformed token
    headers = {"Authorization": "Bearer not-a-valid-token"}

    # act: request the /api/me endpoint with invalid token
    response = client.get("/api/me", headers=headers)

    # assert: token verification should fail
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired token"


def test_when_receive_get_me_with_expired_token_then_should_return_401(client):
    # arrange: create an already expired JWT
    payload = {
        "user_id": 1,
        "role": "ADMIN",
        "employee_id": "A00000001",
        "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
    }
    expired_token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)

    # act: request the /api/me endpoint with expired token
    headers = {"Authorization": f"Bearer {expired_token}"}
    response = client.get("/api/me", headers=headers)

    # assert: expired token should be rejected
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired token"


def test_when_receive_logout_with_valid_token_then_should_return_success_message(client):
    # arrange: create a valid JWT token for authenticated user
    user_payload = {"user_id": 1, "role": "ADMIN", "employee_id": "A00000001"}
    token = create_access_token(user_payload)
    
    # act: send logout request with the valid token
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/api/logout", headers=headers)
    
    # assert: logout endpoint should confirm success
    assert response.status_code == 200
    assert response.json() == {"message": "logout success"}


def test_when_receive_logout_without_token_then_should_return_403_or_401(client):
    # arrange: no headers provided
    headers = None

    # act: send logout request without token
    response = client.post("/api/logout", headers=headers)

    # assert: request should be rejected as unauthenticated
    assert response.status_code in (401, 403)


def test_when_receive_logout_with_invalid_token_then_should_return_401(client):
    # arrange: create malformed token
    headers = {"Authorization": "Bearer not-a-valid-token"}

    # act: send logout request
    response = client.post("/api/logout", headers=headers)

    # assert: token verification should fail
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired token"


def test_when_receive_logout_with_expired_token_then_should_return_401(client):
    # arrange: create an already expired JWT
    payload = {
        "user_id": 1,
        "role": "ADMIN",
        "employee_id": "A00000001",
        "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
    }
    expired_token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)

    # act: send logout request with expired token
    headers = {"Authorization": f"Bearer {expired_token}"}
    response = client.post("/api/logout", headers=headers)

    # assert: expired token should be rejected
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired token"