from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import ticket as ticket_api
from app.core.db import get_db
from app.core.security import create_access_token
from app.main import app
from app.models.asset import Asset, AssetStatus, AssetType
from app.models.ticket import RepairRequest
from .conftest import FakeResult, FakeScalarResult


class FakeRedis:
    def __init__(self) -> None:
        self.values = {}

    async def get(self, key: str):
        return self.values.get(key)

    async def setex(self, key: str, ttl: int, value: str):
        self.values[key] = value

    async def delete(self, key: str):
        self.values.pop(key, None)


class FakeSession:
    def __init__(self) -> None:
        self.users: dict[int, SimpleNamespace] = {
            1: SimpleNamespace(
                id=1,
                employee_id="A00000001",
                password="testpassword",
                name="Admin User",
                must_change_password=False,
                is_active=True,
                role=SimpleNamespace(name="ADMIN"),
            )
        }
        self.assets: dict[int, Asset] = {}
        self.tickets: dict[int, RepairRequest] = {}
        self.pending_asset: Asset | None = None
        self.pending_ticket: RepairRequest | None = None
        self.next_asset_id = 1
        self.next_ticket_id = 1

    async def execute(self, stmt):
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        if "FROM users" in compiled:
            if "A00000001" in compiled:
                return FakeResult(self.users[1])
            return FakeResult(None)
        return FakeResult(None)

    async def scalars(self, stmt):
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        if "FROM repair_requests" in compiled:
            rows = sorted(self.tickets.values(), key=lambda row: row.id, reverse=True)
            return FakeScalarResult(rows)
        return FakeScalarResult([])

    async def get(self, model, key):
        if model is RepairRequest:
            return self.tickets.get(key)
        if model is Asset:
            return self.assets.get(key)
        return None

    def add(self, obj):
        if isinstance(obj, Asset):
            self.pending_asset = obj
        elif isinstance(obj, RepairRequest):
            self.pending_ticket = obj

    async def flush(self):
        if self.pending_asset is not None:
            await self.refresh(self.pending_asset)
        if self.pending_ticket is not None:
            await self.refresh(self.pending_ticket)

    async def commit(self):
        return None

    async def refresh(self, obj):
        now = datetime(2026, 4, 28, tzinfo=timezone.utc)
        if isinstance(obj, Asset):
            if obj.id is None:
                obj.id = self.next_asset_id
                self.next_asset_id += 1
            if getattr(obj, "created_at", None) is None:
                obj.created_at = now
            if getattr(obj, "version", None) is None:
                obj.version = 1
            self.assets[obj.id] = obj
            self.pending_asset = None
        elif isinstance(obj, RepairRequest):
            if obj.id is None:
                obj.id = self.next_ticket_id
                self.next_ticket_id += 1
            if getattr(obj, "created_at", None) is None:
                obj.created_at = now
            if getattr(obj, "version", None) is None:
                obj.version = 1
            if getattr(obj, "status", None) is None:
                obj.status = "OPEN"
            if getattr(obj, "loaner_return_borrower_confirmed", None) is None:
                obj.loaner_return_borrower_confirmed = False
            if getattr(obj, "loaner_return_lender_confirmed", None) is None:
                obj.loaner_return_lender_confirmed = False
            self.tickets[obj.id] = obj
            self.pending_ticket = None

    async def delete(self, obj):
        if isinstance(obj, RepairRequest):
            self.tickets.pop(obj.id, None)

    async def rollback(self):
        return None


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _make_token(user_id: int, role: str) -> str:
    return create_access_token(
        {
            "user_id": user_id,
            "role": role,
            "employee_id": f"E{user_id:08d}",
            "name": f"User {user_id}",
        }
    )


def _create_asset(client, admin_token: str, owner_id: int | None = None) -> int:
    payload = {
        "asset_code": f"A{uuid4().hex[:9].upper()}",
        "name": "Ticket Test Asset",
        "type": "laptop",
        "model": "ThinkPad X1",
        "specification": "16GB RAM / 512GB SSD",
        "vendor": "Lenovo",
        "purchase_date": "2025-01-01",
        "purchase_price": 1500,
        "storage_location": "HQ",
        "owner_id": owner_id,
        "activation_date": "2025-01-02",
        "warranty_expiry": "2028-01-01",
        "status": "available",
    }

    response = client.post("/api/assets", json=payload, headers=_auth_header(admin_token))
    assert response.status_code == 201
    return response.json()["id"]


def _create_ticket(client, asset_id: int, requester_id: int, description: str = "Keyboard broken", token: str | None = None) -> dict:
    payload = {
        "asset_id": asset_id,
        "requester_id": requester_id,
        "description": description,
        "need_backup": False,
    }
    headers = _auth_header(token) if token else {}
    response = client.post("/api/tickets", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()


# @pytest.fixture(autouse=True)
# def seed_user():
#     yield


@pytest.fixture
def fake_db_session():
    return FakeSession()


@pytest.fixture(autouse=True)
def patch_ticket_dependencies(monkeypatch, fake_db_session):
    fake_redis = FakeRedis()

    async def override_get_db():
        yield fake_db_session

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(ticket_api, "redis", fake_redis)

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
def client(patch_ticket_dependencies):
    return patch_ticket_dependencies


def _login_admin(client) -> tuple[str, int]:
    login = client.post("/api/login", json={"employee_id": "A00000001", "password": "testpassword"})
    assert login.status_code == 200

    token = login.json()["access_token"]
    me = client.get("/api/me", headers=_auth_header(token))
    assert me.status_code == 200
    return token, me.json()["user_id"]


def test_when_admin_lists_tickets_then_should_return_200_with_list(client):
    # arrange: admin login, create asset and ticket
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    # act: call GET /api/tickets with admin token
    response = client.get("/api/tickets", headers=_auth_header(admin_token))

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_when_non_admin_lists_tickets_then_should_return_403(client):
    # arrange: create employee token
    employee_token = _make_token(user_id=10001, role="EMPLOYEE")

    # act: call GET /api/tickets with employee token
    response = client.get("/api/tickets", headers=_auth_header(employee_token))

    assert response.status_code == 403


def test_when_receive_valid_ticket_creation_request_then_should_return_201_with_fields(client):
    # arrange: admin login, create asset, prepare ticket payload
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)

    payload = {
        "asset_id": asset_id,
        "requester_id": admin_user_id,
        "description": "Fan noise",
        "need_backup": True,
        "backup_spec": "Backup user profile",
    }
    # act: call POST /api/tickets with valid payload
    response = client.post("/api/tickets", json=payload, headers=_auth_header(admin_token))

    assert response.status_code == 201
    data = response.json()
    assert data["asset_id"] == asset_id
    assert data["requester_id"] == admin_user_id
    assert data["description"] == "Fan noise"
    assert data["status"] == "OPEN"
    assert data["version"] == 1


def test_when_receive_ticket_request_missing_required_field_then_should_return_422(client):
    # arrange: admin login, create asset, prepare incomplete ticket payload
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)

    payload = {
        "asset_id": asset_id,
        "requester_id": admin_user_id,
        "need_backup": False,
    }
    # act: call POST /api/tickets with missing description field
    response = client.post("/api/tickets", json=payload, headers=_auth_header(admin_token))

    assert response.status_code == 422


def test_when_owner_gets_ticket_then_should_return_200(client):
    # arrange: admin creates ticket, owner generates token
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    created = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    owner_token = _make_token(user_id=admin_user_id, role="EMPLOYEE")
    # act: call GET /api/tickets/{id} with owner token
    response = client.get(f"/api/tickets/{created['id']}", headers=_auth_header(owner_token))

    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_when_non_owner_gets_ticket_then_should_return_403(client):
    # arrange: admin creates ticket, non-owner generates token with different user_id
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    created = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    non_owner_token = _make_token(user_id=admin_user_id + 1, role="EMPLOYEE")
    # act: call GET /api/tickets/{id} with non-owner token
    response = client.get(f"/api/tickets/{created['id']}", headers=_auth_header(non_owner_token))

    assert response.status_code == 403


def test_when_get_nonexistent_ticket_then_should_return_404(client):
    # arrange: create admin token, prepare nonexistent ticket ID
    admin_token = _make_token(user_id=10001, role="ADMIN")

    # act: call GET /api/tickets/99999999 with admin token
    response = client.get("/api/tickets/99999999", headers=_auth_header(admin_token))

    assert response.status_code == 404


def test_when_owner_updates_ticket_then_should_return_200_and_increment_version(client):
    # arrange: admin creates ticket, owner prepares update payload
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    created = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    owner_token = _make_token(user_id=admin_user_id, role="EMPLOYEE")
    payload = {
        "asset_id": asset_id,
        "requester_id": admin_user_id,
        "description": "Updated description",
        "need_backup": True,
        "backup_spec": "Files only",
        "status": "IN_PROGRESS",
        "expected_completion_date": "2026-05-01",
        "pickup_location": "IT desk",
    }

    # act: call PUT /api/tickets/{id} with owner token and updated payload
    response = client.put(f"/api/tickets/{created['id']}", json=payload, headers=_auth_header(owner_token))

    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "Updated description"
    assert data["status"] == "IN_PROGRESS"
    assert data["version"] == created["version"] + 1


def test_when_non_owner_updates_ticket_then_should_return_403(client):
    # arrange: admin creates ticket, non-owner generates token and prepares update payload
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    created = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    non_owner_token = _make_token(user_id=admin_user_id + 1, role="EMPLOYEE")
    payload = {
        "asset_id": asset_id,
        "requester_id": admin_user_id,
        "description": "Attempted update",
        "need_backup": False,
        "backup_spec": None,
        "status": "OPEN",
        "expected_completion_date": None,
        "pickup_location": None,
    }

    # act: call PUT /api/tickets/{id} with non-owner token
    response = client.put(f"/api/tickets/{created['id']}", json=payload, headers=_auth_header(non_owner_token))

    assert response.status_code == 403


def test_when_owner_deletes_ticket_then_should_return_204(client):
    # arrange: admin creates ticket, owner generates token
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    created = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    owner_token = _make_token(user_id=admin_user_id, role="EMPLOYEE")
    # act: call DELETE /api/tickets/{id} with owner token
    response = client.delete(f"/api/tickets/{created['id']}", headers=_auth_header(owner_token))

    assert response.status_code == 204


def test_when_non_owner_deletes_ticket_then_should_return_403(client):
    # arrange: admin creates ticket, non-owner generates token with different user_id
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    created = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    non_owner_token = _make_token(user_id=admin_user_id + 1, role="EMPLOYEE")
    # act: call DELETE /api/tickets/{id} with non-owner token
    response = client.delete(f"/api/tickets/{created['id']}", headers=_auth_header(non_owner_token))

    assert response.status_code == 403


def test_when_admin_patches_ticket_status_then_should_return_200(client):
    # arrange: admin creates ticket, prepares status update payload
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    created = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    # act: call PATCH /api/tickets/{id}/status with valid status
    response = client.patch(
        f"/api/tickets/{created['id']}/status",
        json={"status": "DONE"},
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "DONE"
    assert data["version"] == created["version"] + 1


def test_when_non_admin_patches_ticket_status_then_should_return_403(client):
    # arrange: admin creates ticket, employee generates token
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    created = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    employee_token = _make_token(user_id=admin_user_id, role="EMPLOYEE")
    # act: call PATCH /api/tickets/{id}/status with employee token
    response = client.patch(
        f"/api/tickets/{created['id']}/status",
        json={"status": "DONE"},
        headers=_auth_header(employee_token),
    )

    assert response.status_code == 403


def test_when_admin_receives_invalid_ticket_status_then_should_return_422(client):
    # arrange: admin creates ticket, prepares invalid status value
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    created = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    # act: call PATCH /api/tickets/{id}/status with invalid status value
    response = client.patch(
        f"/api/tickets/{created['id']}/status",
        json={"status": "NOT_A_STATUS"},
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 422


def test_when_patch_nonexistent_ticket_status_then_should_return_404(client):
    # arrange: create admin token, prepare nonexistent ticket ID and status update
    admin_token = _make_token(user_id=10001, role="ADMIN")

    # act: call PATCH /api/tickets/99999999/status with admin token
    response = client.patch(
        "/api/tickets/99999999/status",
        json={"status": "DONE"},
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 404
