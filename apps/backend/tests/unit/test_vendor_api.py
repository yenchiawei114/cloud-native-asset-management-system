from types import SimpleNamespace

import pytest

from app.models.user import User
from app.models.vendor import Vendor
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
        self.vendors: list[Vendor] = []
        self.next_vendor_id = 1

    async def execute(self, stmt):
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        if "FROM users" in compiled:
            if "A00000001" in compiled:
                return FakeResult(self.users[1])
            return FakeResult(None)
        return FakeResult(None)

    async def scalars(self, stmt):
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        if "FROM vendors" in compiled:
            rows = sorted(self.vendors, key=lambda row: row.name)
            return FakeScalarResult(rows)
        return FakeScalarResult([])

    async def get(self, model, key):
        if model is User:
            return self.users.get(key)
        return None

    def add(self, obj):
        if isinstance(obj, Vendor):
            if obj.id is None:
                obj.id = self.next_vendor_id
                self.next_vendor_id += 1
            self.vendors.append(obj)


@pytest.fixture
def fake_db_session():
    return FakeSession()


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login_admin(client) -> str:
    login = client.post("/api/login", json={"employee_id": "A00000001", "password": "testpassword"})
    assert login.status_code == 200
    return login.json()["access_token"]


def test_get_vendors_auth_required(client):
    response = client.get("/api/vendors")
    assert response.status_code in (401, 403)


def test_get_vendors_success_returns_list(client, fake_db_session):
    fake_db_session.add(Vendor(name="Acme Supplies"))
    token = _login_admin(client)

    response = client.get("/api/vendors", headers=_auth_header(token))

    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert any(v.get("name") == "Acme Supplies" for v in payload)


def test_get_vendors_ordered_by_name(client, fake_db_session):
    fake_db_session.add(Vendor(name="Zeta Parts"))
    fake_db_session.add(Vendor(name="Alpha Components"))
    fake_db_session.add(Vendor(name="Mango Industrial"))
    token = _login_admin(client)

    response = client.get("/api/vendors", headers=_auth_header(token))

    assert response.status_code == 200
    names = [item["name"] for item in response.json()]
    assert names == sorted(names)


def test_get_vendors_empty_returns_empty_list(client):
    token = _login_admin(client)

    response = client.get("/api/vendors", headers=_auth_header(token))

    assert response.status_code == 200
    assert response.json() == []
