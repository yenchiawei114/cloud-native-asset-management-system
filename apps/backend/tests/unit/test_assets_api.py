from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.asset import Asset
from app.models.user import User
from .conftest import FakeResult, FakeScalarResult


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
        self.next_asset_id = 1

    async def execute(self, stmt):
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        if "FROM users" in compiled:
            if "A00000001" in compiled:
                return FakeResult(self.users[1])
            return FakeResult(None)
        return FakeResult(None)

    async def scalars(self, stmt):
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        if "FROM assets" in compiled:
            rows = sorted(self.assets.values(), key=lambda row: row.id)
            return FakeScalarResult(rows)
        return FakeScalarResult([])

    async def get(self, model, key):
        if model is Asset:
            return self.assets.get(key)
        if model is User:
            return self.users.get(key)
        return None

    def add(self, obj):
        if isinstance(obj, Asset):
            self.pending_asset = obj

    async def flush(self):
        if self.pending_asset is not None:
            await self.refresh(self.pending_asset)

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

    async def delete(self, obj):
        if isinstance(obj, Asset):
            self.assets.pop(obj.id, None)

    async def rollback(self):
        return None


@pytest.fixture
def fake_db_session():
    return FakeSession()


def get_token(client):
    # arrange & act: call POST /api/login with admin credentials
    res = client.post("/api/login", json={"employee_id": "A00000001", "password": "testpassword"})
    # assert & return: extract access token from response
    return res.json()["access_token"]


def test_when_receive_valid_asset_creation_request_then_should_return_201_or_200(client):
    # arrange: get auth token
    token = get_token(client)

    # act: call POST /api/assets with valid complete asset data
    payload = {
        "asset_code": f"A{uuid4().hex[:9].upper()}",
        "name": "Test Laptop",
        "type": "laptop",
        "model": "ThinkPad X1",
        "specification": "16GB RAM / 512GB SSD",
        "vendor": "Lenovo",
        "purchase_date": "2025-01-01",
        "purchase_price": 1500,
        "storage_location": "HQ",
        "owner_id": None,
        "activation_date": "2025-01-02",
        "warranty_expiry": "2028-01-01",
        "status": "available",
    }
    response = client.post(
        "/api/assets", json=payload, headers={"Authorization": f"Bearer {token}"}
    )

    # assert: verify response status and returned asset data
    assert response.status_code in (200, 201)
    data = response.json()
    assert data["name"] == "Test Laptop"


def test_when_receive_get_assets_request_then_should_return_200_with_list(client):
    # arrange: get auth token
    token = get_token(client)

    # act: call GET /api/assets with auth token
    response = client.get("/api/assets", headers={"Authorization": f"Bearer {token}"})

    # assert: verify response status is 200 and body is list
    assert response.status_code == 200
    assert isinstance(response.json(), list)
