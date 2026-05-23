from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4
import re

import pytest
from fastapi.testclient import TestClient

from app.api import ticket as ticket_api
from app.core.db import get_db
from app.core.security import create_access_token
from app.main import app
from app.models.asset import Asset, AssetStatus, AssetType
from app.models.ticket import RepairRequest, Attachment, RepairInspection, RepairRecord, User
from app.models.vendor import Vendor
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
                email="admin@example.com",
                location="HQ",
                must_change_password=False,
                is_active=True,
                role=SimpleNamespace(name="ADMIN"),
            ),
            2: SimpleNamespace(
                id=2,
                employee_id="E00000001",
                password="testpassword",
                name="Employee User",
                email="employee@example.com",
                location="Branch Office",
                must_change_password=False,
                is_active=True,
                role=SimpleNamespace(name="EMPLOYEE"),
            ),
        }
        self.assets: dict[int, Asset] = {}
        self.vendors: list[Vendor] = [Vendor(id=1, name="Lenovo")]
        self.tickets: dict[int, RepairRequest] = {}
        self.pending_asset: Asset | None = None
        self.pending_ticket: RepairRequest | None = None
        self.pending_attachment: Attachment | None = None
        self.pending_inspection: RepairInspection | None = None
        self.pending_record: RepairRecord | None = None
        self.next_asset_id = 1
        self.next_ticket_id = 1
        self.next_vendor_id = 2
        self.attachments = {}
        self.records = {}
        self.inspections = {}
        self.next_attachment_id = 1
        self.next_record_id = 1
        self.next_inspection_id = 1

    async def execute(self, stmt):
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        if "FROM users" in compiled:
            if "A00000001" in compiled:
                return FakeResult(self.users[1])
            if "E00000001" in compiled:
                return FakeResult(self.users[2])
            return FakeResult(None)
        return FakeResult(None)

    async def scalars(self, stmt):
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        lowered = compiled.lower()
        if "from vendors" in lowered:
            rows = self.vendors
            match = re.search(r"name\s*=\s*'([^']+)'", compiled, re.IGNORECASE)
            if match:
                rows = [row for row in rows if row.name == match.group(1)]
            rows = sorted(rows, key=lambda row: row.name)
            return FakeScalarResult(rows)
        if "FROM repair_requests" in compiled:
            rows = list(self.tickets.values())
            requester_match = re.search(r"requester_id\s*=\s*(\d+)", lowered)
            if requester_match:
                requester_id = int(requester_match.group(1))
                rows = [row for row in rows if row.requester_id == requester_id]
            asset_match = re.search(r"repair_requests\.asset_id\s*=\s*(\d+)", lowered)
            if asset_match:
                asset_id = int(asset_match.group(1))
                rows = [row for row in rows if row.asset_id == asset_id]
            status_in_match = re.search(r"status\s+in\s*\(([^)]+)\)", lowered)
            if status_in_match:
                statuses = [s.strip().strip("'") for s in status_in_match.group(1).split(",")]
                rows = [row for row in rows if getattr(row, "status", None) in statuses]
            rows = sorted(rows, key=lambda row: row.id, reverse=True)
            return FakeScalarResult(rows)
        if "from attachments" in lowered:
            rows = list(self.attachments.values())
            request_match = re.search(r"attachable_id\s+in\s*\(([^)]+)\)", compiled, re.IGNORECASE)
            if request_match:
                ids = [int(part.strip()) for part in request_match.group(1).split(",") if part.strip().isdigit()]
                rows = [row for row in rows if row.attachable_id in ids]
            rows = sorted(rows, key=lambda row: row.id, reverse=True)
            return FakeScalarResult(rows)
        if "from users" in lowered:
            match = re.search(r"id\s+in\s*\(([^)]+)\)", compiled, re.IGNORECASE)
            if match:
                ids = [int(part.strip()) for part in match.group(1).split(",") if part.strip().isdigit()]
                rows = [self.users[user_id] for user_id in ids if user_id in self.users]
                return FakeScalarResult(rows)
            return FakeScalarResult(list(self.users.values()))
        if "from assets" in lowered:
            rows = list(self.assets.values())
            in_match = re.search(r"in\s*\(([^)]+)\)", lowered, re.IGNORECASE)
            if in_match:
                ids = [int(part.strip()) for part in in_match.group(1).split(",") if part.strip().isdigit()]
                rows = [self.assets[asset_id] for asset_id in ids if asset_id in self.assets]
            else:
                id_match = re.search(r"assets\.id\s*=\s*(\d+)", lowered, re.IGNORECASE)
                if id_match:
                    asset_id = int(id_match.group(1))
                    rows = [self.assets[asset_id]] if asset_id in self.assets else []
            return FakeScalarResult(rows)
        if "from repair_inspections" in lowered or "from repair_inspection" in lowered:
            rows = list(self.inspections.values())
            request_match = re.search(r"request_id\s*=\s*(\d+)", lowered)
            if request_match:
                request_id = int(request_match.group(1))
                rows = [row for row in rows if row.request_id == request_id]
            return FakeScalarResult(rows)
        return FakeScalarResult([])

    async def get(self, model, key):
        if model is RepairRequest:
            return self.tickets.get(key)
        if model is Asset:
            return self.assets.get(key)
        if model is Vendor:
            return next((vendor for vendor in self.vendors if vendor.id == key), None)
        if model is Attachment:
            return self.attachments.get(key)

        if model is RepairInspection:
            return self.inspections.get(key)

        if model is RepairRecord:
            return self.records.get(key)

        if model is User:
            return self.users.get(key)
        return None

    def add(self, obj):
        if isinstance(obj, Asset):
            self.pending_asset = obj
        elif isinstance(obj, RepairRequest):
            self.pending_ticket = obj
        elif isinstance(obj, Attachment):
            self.pending_attachment = obj
        elif isinstance(obj, RepairInspection):
            self.pending_inspection = obj
        elif isinstance(obj, RepairRecord):
            self.pending_record = obj

    async def flush(self):
        if self.pending_asset is not None:
            await self.refresh(self.pending_asset)
        if self.pending_ticket is not None:
            await self.refresh(self.pending_ticket)
        if self.pending_attachment is not None:
            await self.refresh(self.pending_attachment)
        if self.pending_inspection is not None:
            await self.refresh(self.pending_inspection)
        if self.pending_record is not None:
            await self.refresh(self.pending_record)

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
            if getattr(obj, "vendor", None) is None:
                obj.__dict__["vendor"] = next(
                    (v for v in self.vendors if v.id == getattr(obj, "vendor_id", None)), None
                )
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
        elif isinstance(obj, Attachment):
            if obj.id is None:
                obj.id = self.next_attachment_id
                self.next_attachment_id += 1
            if getattr(obj, "created_at", None) is None:
                obj.created_at = now
            self.attachments[obj.id] = obj
            self.pending_attachment = None
        elif isinstance(obj, RepairInspection):
            if obj.id is None:
                obj.id = self.next_inspection_id
                self.next_inspection_id += 1
            if getattr(obj, "created_at", None) is None:
                obj.created_at = now
            if getattr(obj, "checked_at", None) is None:
                obj.checked_at = now
            self.inspections[obj.id] = obj
            self.pending_inspection = None
        elif isinstance(obj, RepairRecord):
            if obj.id is None:
                obj.id = self.next_record_id
                self.next_record_id += 1
            if getattr(obj, "created_at", None) is None:
                obj.created_at = now
            self.records[obj.id] = obj
            self.pending_record = None

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
        "activation_date": "2025-01-02",
        "warranty_expiry": "2028-01-01",
        "status": "available",
        "owner_id": owner_id,
    }

    response = client.post("/api/assets", json=payload, headers=_auth_header(admin_token))

    assert response.status_code == 201, response.json()
    return response.json()["id"]


def _create_ticket(
    client,
    asset_id: int,
    requester_id: int,
    description: str = "Keyboard broken",
    token: str | None = None,
    need_backup: bool = False,
    backup_spec: str | None = None,
) -> dict:
    payload = {
        "asset_id": asset_id,
        "requester_id": requester_id,
        "description": description,
        "need_backup": need_backup,
        "backup_spec": backup_spec,
    }
    headers = _auth_header(token) if token else {}
    response = client.post("/api/tickets", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()


def _create_inspection(fake_db, ticket_id: int):
    from app.models.ticket import RepairInspection

    inspection = RepairInspection(
        id=1,
        request_id=ticket_id,
        issue_summary="x",
        diagnosis="y",
        action_taken="z",
    )
    fake_db.inspections[ticket_id] = inspection


def _create_vendor(client, token):
    payload = {"name": "Lenovo"}
    resp = client.post("/api/vendors", json=payload, headers=_auth_header(token))
    assert resp.status_code == 201
    return resp.json()["id"]


def _seed_attachment(
    fake_db_session: FakeSession,
    *,
    attachment_id: int,
    attachable_id: int,
    file_name: str = "evidence.png",
) -> None:
    fake_db_session.attachments[attachment_id] = Attachment(
        id=attachment_id,
        attachable_type="REPAIR_REQUEST",
        attachable_id=attachable_id,
        file_url=f"uploads/{file_name}",
        file_type="IMAGE",
        file_name=file_name,
        created_at=datetime(2026, 4, 28, tzinfo=timezone.utc),
    )


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


def _login_employee(client) -> tuple[str, int]:
    login = client.post("/api/login", json={"employee_id": "E00000001", "password": "testpassword"})
    assert login.status_code == 200

    token = login.json()["access_token"]
    me = client.get("/api/me", headers=_auth_header(token))
    assert me.status_code == 200
    return token, me.json()["user_id"]


def test_when_admin_lists_tickets_then_should_return_200_with_list(client):
    admin_token, admin_user_id = _login_admin(client)

    employee_token, employee_id = _login_employee(client)

    asset_id = _create_asset(
        client,
        admin_token,
        owner_id=employee_id,
    )

    # requester should be employee (realistic flow)
    _create_ticket(
        client,
        asset_id,
        requester_id=employee_id,
        token=employee_token,
    )

    # act
    response = client.get("/api/tickets", headers=_auth_header(admin_token))

    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert len(response.json()) > 0


def test_when_admin_lists_tickets_with_loaner_asset_then_should_include_loaner_details(
    client,
    fake_db_session,
):
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    loaner_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    created = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    fake_db_session.tickets[created["id"]].loaner_asset_id = loaner_id
    fake_db_session.tickets[created["id"]].status = "WAITING_LOANER_RETURN"

    response = client.get("/api/tickets", headers=_auth_header(admin_token))

    assert response.status_code == 200
    ticket = next(item for item in response.json() if item["id"] == created["id"])
    assert ticket["loaner_asset_id"] == loaner_id
    assert ticket["loaner_asset_code"] == fake_db_session.assets[loaner_id].asset_code
    assert ticket["loaner_asset_name"] == fake_db_session.assets[loaner_id].name


def test_when_non_owner_lists_asset_tickets_then_should_return_403(client, fake_db_session):
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    employee_token = _make_token(user_id=admin_user_id + 1, role="EMPLOYEE")
    response = client.get(f"/api/assets/{asset_id}/tickets", headers=_auth_header(employee_token))

    assert response.status_code == 403
    assert response.json()["detail"] == "Forbidden"


def test_when_asset_not_found_for_asset_tickets_then_should_return_404(client):
    admin_token = _make_token(user_id=10001, role="ADMIN")

    response = client.get("/api/assets/9999/tickets", headers=_auth_header(admin_token))

    assert response.status_code == 404
    assert response.json()["detail"] == "asset not found"


def test_when_admin_lists_user_tickets_then_should_return_nested_data(client, fake_db_session):
    admin_token, admin_user_id = _login_admin(client)
    employee_token = _make_token(user_id=2, role="EMPLOYEE")

    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    loaner_id = _create_asset(client, admin_token, owner_id=admin_user_id)

    employee_ticket = _create_ticket(
        client,
        asset_id,
        requester_id=2,
        token=employee_token,
        need_backup=True,
        backup_spec="Backup docs",
    )
    other_ticket = _create_ticket(client, loaner_id, requester_id=admin_user_id, token=admin_token)

    fake_db_session.tickets[employee_ticket["id"]].loaner_asset_id = loaner_id
    fake_db_session.tickets[employee_ticket["id"]].status = "WAITING_LOANER_RETURN"
    _seed_attachment(
        fake_db_session,
        attachment_id=1,
        attachable_id=employee_ticket["id"],
        file_name="employee-proof.png",
    )

    response = client.get("/api/tickets/list/E00000001", headers=_auth_header(admin_token))

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1

    item = payload[0]
    assert item["request"]["id"] == employee_ticket["id"]
    assert item["request"]["requester_id"] == 2
    assert item["request"]["requester_name"] == "Employee User"
    assert item["request"]["loaner_asset_id"] == loaner_id
    assert item["request"]["loaner_asset_code"] == fake_db_session.assets[loaner_id].asset_code
    assert item["request"]["loaner_asset_name"] == fake_db_session.assets[loaner_id].name
    assert item["attachment"] is not None
    assert item["attachment"]["attachable_id"] == employee_ticket["id"]
    assert item["attachment"]["file_name"] == "employee-proof.png"
    assert all(entry["request"]["id"] != other_ticket["id"] for entry in payload)


def test_when_employee_lists_own_tickets_then_should_return_only_their_tickets(
    client,
    fake_db_session,
):
    admin_token, admin_user_id = _login_admin(client)
    employee_token, employee_user_id = _login_employee(client)

    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    asset2_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    own_ticket = _create_ticket(client, asset_id, requester_id=employee_user_id, token=employee_token)
    _create_ticket(client, asset2_id, requester_id=admin_user_id, token=admin_token)

    _seed_attachment(
        fake_db_session,
        attachment_id=1,
        attachable_id=own_ticket["id"],
        file_name="employee-proof.png",
    )

    response = client.get("/api/tickets/list/E00000001", headers=_auth_header(employee_token))

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["request"]["id"] == own_ticket["id"]
    assert payload[0]["request"]["requester_id"] == employee_user_id
    assert payload[0]["request"]["requester_name"] == "Employee User"
    assert payload[0]["attachment"]["file_name"] == "employee-proof.png"


def test_when_employee_requests_other_employee_tickets_then_should_return_403(client):
    employee_token, _ = _login_employee(client)

    response = client.get("/api/tickets/list/A00000001", headers=_auth_header(employee_token))

    assert response.status_code == 403
    assert response.json()["detail"] == "Forbidden"


def test_when_user_tickets_request_for_unknown_employee_then_should_return_404(client):
    admin_token = _make_token(user_id=10001, role="ADMIN")

    response = client.get("/api/tickets/list/UNKNOWN", headers=_auth_header(admin_token))

    assert response.status_code == 404
    assert response.json()["detail"] == "user not found"


def test_when_asset_has_tickets_and_attachments_then_should_return_nested_data(
    client,
    fake_db_session,
):
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    loaner_id = _create_asset(client, admin_token, owner_id=admin_user_id)

    created = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)
    fake_db_session.tickets[created["id"]].loaner_asset_id = loaner_id
    fake_db_session.tickets[created["id"]].status = "WAITING_LOANER_RETURN"
    _seed_attachment(fake_db_session, attachment_id=1, attachable_id=created["id"], file_name="repair-proof.png")

    response = client.get(f"/api/assets/{asset_id}/tickets", headers=_auth_header(admin_token))

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1

    item = payload[0]
    assert item["request"]["id"] == created["id"]
    assert item["request"]["loaner_asset_id"] == loaner_id
    assert item["request"]["loaner_asset_code"] == fake_db_session.assets[loaner_id].asset_code
    assert item["request"]["loaner_asset_name"] == fake_db_session.assets[loaner_id].name
    assert item["attachment"] is not None
    assert item["attachment"]["attachable_id"] == created["id"]
    assert item["attachment"]["file_name"] == "repair-proof.png"


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


def test_when_employee_gets_ticket_with_unmatched_requester_id_then_should_return_403(client):
    # arrange: employee creates ticket, different employee attempts to access it
    admin_token, admin_user_id = _login_admin(client)
    employee_token, employee_user_id = _login_employee(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    created = _create_ticket(
        client,
        asset_id,
        requester_id=employee_user_id,
        token=employee_token,
    )

    different_employee_token = _make_token(user_id=employee_user_id + 1, role="EMPLOYEE")

    # act: call GET /api/tickets/{id} with unmatched employee user_id
    response = client.get(f"/api/tickets/{created['id']}", headers=_auth_header(different_employee_token))

    assert response.status_code == 403


def test_when_admin_gets_other_employee_ticket_then_should_return_requester_and_loaner_details(
    client,
    fake_db_session,
):
    admin_token, admin_user_id = _login_admin(client)
    employee_token, employee_user_id = _login_employee(client)

    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    loaner_id = _create_asset(client, admin_token, owner_id=admin_user_id)

    created = _create_ticket(
        client,
        asset_id,
        requester_id=employee_user_id,
        token=employee_token,
    )
    fake_db_session.tickets[created["id"]].loaner_asset_id = loaner_id
    ticket_api.redis.values.pop(f"ticket:{created['id']}", None)

    response = client.get(f"/api/tickets/{created['id']}", headers=_auth_header(admin_token))

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == created["id"]
    assert data["requester_id"] == employee_user_id
    assert data["requester_name"] == "Employee User"
    assert data["loaner_asset_id"] == loaner_id
    assert data["loaner_asset_code"] == fake_db_session.assets[loaner_id].asset_code
    assert data["loaner_asset_name"] == fake_db_session.assets[loaner_id].name


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


def test_when_ticket_exists_in_cache_then_should_return_cached_ticket(
    client,
    monkeypatch,
):
    fake_redis = ticket_api.redis

    cached = ticket_api.RepairRequestOut(
        id=1,
        asset_id=1,
        requester_id=1,
        description="cached",
        need_backup=False,
        backup_spec=None,
        status="OPEN",
        expected_completion_date=None,
        pickup_location=None,
        created_at=datetime.now(timezone.utc),
        version=1,
    )

    fake_redis.values["ticket:1"] = cached.model_dump_json()

    token = _make_token(1, "EMPLOYEE")

    response = client.get(
        "/api/tickets/1",
        headers=_auth_header(token),
    )

    assert response.status_code == 200
    assert response.json()["description"] == "cached"


def test_when_returned_ticket_updated_then_should_reset_status_to_open(
    client,
    fake_db_session,
):
    admin_token, admin_user_id = _login_admin(client)

    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)

    created = _create_ticket(
        client,
        asset_id,
        requester_id=admin_user_id,
        token=admin_token,
    )

    ticket = fake_db_session.tickets[created["id"]]
    ticket.status = "RETURNED"
    ticket.reject_reason = "missing info"

    response = client.put(
        f"/api/tickets/{ticket.id}",
        json={
            "asset_id": asset_id,
            "requester_id": admin_user_id,
            "description": "updated",
            "need_backup": False,
            "status": "DONE",
        },
        headers=_auth_header(_make_token(admin_user_id, "EMPLOYEE")),
    )

    data = response.json()

    assert response.status_code == 200
    assert data["status"] == "OPEN"
    assert data["reject_reason"] is None


def test_when_assigning_available_loaner_then_should_borrow_asset(
    client,
    fake_db_session,
):
    # arrange: admin creates ticket and a loaner asset marked available
    admin_token, admin_user_id = _login_admin(client)
    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)

    # create a loaner asset (type loaner, status available)
    loaner_payload = {
        "asset_code": f"L{uuid4().hex[:9].upper()}",
        "name": "Loaner Device",
        "type": "laptop",
        "model": "LoanerModel",
        "specification": "Spec",
        "vendor": "Lenovo",
        "purchase_date": "2025-01-01",
        "purchase_price": 100,
        "storage_location": "IT",
        "owner_id": admin_user_id,
        "activation_date": "2025-01-02",
        "warranty_expiry": "2028-01-01",
        "status": "available",
    }
    resp = client.post("/api/assets", json=loaner_payload, headers=_auth_header(admin_token))
    assert resp.status_code == 201
    loaner_id = resp.json()["id"]

    created = _create_ticket(
        client,
        asset_id,
        requester_id=admin_user_id,
        token=admin_token,
        need_backup=True,
        backup_spec="Backup user profile",
    )

    # act: admin assigns the available loaner and moves ticket to IN_PROGRESS
    response = client.patch(
        f"/api/tickets/{created['id']}/status",
        json={
            "status": "IN_PROGRESS",
            "expected_completion_date": "2026-05-01",
            "loaner_asset_id": loaner_id,
        },
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 200
    data = response.json()
    # borrower assignment and status set on ticket
    # assert data.get("loaner_asset_id") == loaner_id
    assert data.get("status") == "IN_PROGRESS"

    # asset status should be updated to BORROWED in fake db and main asset moved to maintenance
    assert fake_db_session.assets[loaner_id].status == AssetStatus.BORROWED
    assert fake_db_session.assets[asset_id].status == AssetStatus.MAINTENANCE

    # validation: assigning a non-available loaner should fail
    # mark loaner as already borrowed
    fake_db_session.assets[loaner_id].status = AssetStatus.BORROWED
    response2 = client.patch(
        f"/api/tickets/{created['id']}/status",
        json={
            "status": "IN_PROGRESS",
            "expected_completion_date": "2026-05-01",
            "loaner_asset_id": loaner_id,
        },
        headers=_auth_header(admin_token),
    )

    assert response2.status_code == 400

    # non-admin validation: employees cannot patch ticket status
    non_admin_token = _make_token(user_id=admin_user_id + 1, role="EMPLOYEE")
    response3 = client.patch(
        f"/api/tickets/{created['id']}/status",
        json={
            "status": "IN_PROGRESS",
            "expected_completion_date": "2026-05-01",
            "loaner_asset_id": loaner_id,
        },
        headers=_auth_header(non_admin_token),
    )

    assert response3.status_code == 403


def test_when_close_non_in_progress_ticket_then_should_return_400(
    client,
    fake_db_session,
):
    admin_token, admin_user_id = _login_admin(client)

    asset_id = _create_asset(
        client,
        admin_token,
        owner_id=admin_user_id,
    )

    created = _create_ticket(
        client,
        asset_id,
        requester_id=admin_user_id,
        token=admin_token,
    )

    response = client.post(
        f"/api/tickets/{created['id']}/close",
        json={
            "issue_description": "broken fan",
            "solution": "replaced fan",
            "vendor_id": 1,
            "cost": 100,
        },
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 400


def test_when_close_ticket_without_loaner_then_should_mark_done(
    client,
    fake_db_session,
    monkeypatch,
):
    sent_emails = []

    def fake_send_email(**kwargs):
        sent_emails.append(kwargs)

    monkeypatch.setattr(ticket_api, "send_email", fake_send_email)

    admin_token, admin_user_id = _login_admin(client)

    asset_id = _create_asset(
        client,
        admin_token,
        owner_id=admin_user_id,
    )

    created = _create_ticket(
        client,
        asset_id,
        requester_id=admin_user_id,
        token=admin_token,
    )

    # important
    ticket = fake_db_session.tickets[created["id"]]
    ticket.status = "IN_PROGRESS"

    response = client.post(
        f"/api/tickets/{ticket.id}/close",
        json={
            "issue_description": "fan broken",
            "solution": "fan replaced",
            "vendor_id": 1,
            "cost": 300,
        },
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 200

    data = response.json()

    assert data["status"] == "DONE"
    assert data["version"] == 2

    # verify repair record created
    # assert len(fake_db_session.records) == 1

    # record = next(iter(fake_db_session.records.values()))

    # assert record.solution == "fan replaced"

    # verify email sent
    # assert len(sent_emails) == 1


def test_when_confirm_loaner_return_with_wrong_status_then_should_return_400(
    client,
    fake_db_session,
):
    admin_token, admin_user_id = _login_admin(client)

    asset_id = _create_asset(
        client,
        admin_token,
        owner_id=admin_user_id,
    )

    loaner_id = _create_asset(
        client,
        admin_token,
        owner_id=admin_user_id,
    )

    created = _create_ticket(
        client,
        asset_id,
        requester_id=admin_user_id,
        token=admin_token,
    )

    ticket = fake_db_session.tickets[created["id"]]
    ticket.status = "DONE"
    ticket.loaner_asset_id = loaner_id

    response = client.post(
        f"/api/tickets/{ticket.id}/confirm-loaner-return",
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 400


def test_when_confirm_loaner_return_without_loaner_then_should_return_400(
    client,
    fake_db_session,
):
    admin_token, admin_user_id = _login_admin(client)

    asset_id = _create_asset(
        client,
        admin_token,
        owner_id=admin_user_id,
    )

    created = _create_ticket(
        client,
        asset_id,
        requester_id=admin_user_id,
        token=admin_token,
    )

    ticket = fake_db_session.tickets[created["id"]]
    ticket.status = "WAITING_LOANER_RETURN"
    ticket.loaner_asset_id = None

    response = client.post(
        f"/api/tickets/{ticket.id}/confirm-loaner-return",
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 400


def _add_fake_user(fake_db_session, user_id: int, role, name: str = "User"):
    fake_db_session.users[user_id] = SimpleNamespace(
        id=user_id,
        employee_id=f"E{user_id:08d}",
        password="pw",
        name=name,
        must_change_password=False,
        is_active=True,
        role=role,
        email=f"user{user_id}@test.com",
        location="HQ",
    )


def test_when_unrelated_user_confirms_loaner_return_then_should_return_403(
    client,
    fake_db_session,
):
    from app.models.user import Role

    _add_fake_user(fake_db_session, 999, Role.EMPLOYEE)

    admin_token, admin_user_id = _login_admin(client)

    asset_id = _create_asset(
        client,
        admin_token,
        owner_id=admin_user_id,
    )

    loaner_id = _create_asset(
        client,
        admin_token,
        owner_id=admin_user_id,
    )

    created = _create_ticket(
        client,
        asset_id,
        requester_id=admin_user_id,
        token=admin_token,
    )

    ticket = fake_db_session.tickets[created["id"]]
    ticket.status = "WAITING_LOANER_RETURN"
    ticket.loaner_asset_id = loaner_id

    unrelated_token = _make_token(999, "EMPLOYEE")

    response = client.post(
        f"/api/tickets/{ticket.id}/confirm-loaner-return",
        headers=_auth_header(unrelated_token),
    )

    assert response.status_code == 403


def test_when_lender_confirms_then_should_only_update_lender_flag(
    client,
    fake_db_session,
):
    from app.models.user import Role

    lender_id = 100
    borrower_id = 200

    _add_fake_user(fake_db_session, lender_id, Role.ADMIN)
    _add_fake_user(fake_db_session, borrower_id, Role.EMPLOYEE)

    lender_token = _make_token(lender_id, "ADMIN")

    admin_token, _ = _login_admin(client)

    asset_id = _create_asset(
        client,
        admin_token,
        owner_id=lender_id,
    )

    loaner_id = _create_asset(
        client,
        admin_token,
        owner_id=lender_id,
    )

    created = _create_ticket(
        client,
        asset_id,
        requester_id=borrower_id,
        token=lender_token,
    )

    ticket = fake_db_session.tickets[created["id"]]

    ticket.status = "WAITING_LOANER_RETURN"
    ticket.loaner_asset_id = loaner_id

    response = client.post(
        f"/api/tickets/{ticket.id}/confirm-loaner-return",
        headers=_auth_header(lender_token),
    )

    assert response.status_code == 200

    data = response.json()

    assert data["loaner_return_lender_confirmed"] is True
    assert data["loaner_return_borrower_confirmed"] is False
    assert data["status"] == "WAITING_LOANER_RETURN"


def test_when_both_confirm_loaner_return_then_should_complete_ticket(
    client,
    fake_db_session,
):
    from app.models.user import Role
    from app.models.asset import AssetStatus

    lender_id = 100
    borrower_id = 200

    _add_fake_user(fake_db_session, lender_id, Role.ADMIN)
    _add_fake_user(fake_db_session, borrower_id, Role.EMPLOYEE)

    lender_token = _make_token(lender_id, "ADMIN")
    borrower_token = _make_token(borrower_id, "EMPLOYEE")

    admin_token, _ = _login_admin(client)

    asset_id = _create_asset(
        client,
        admin_token,
        owner_id=borrower_id,
    )

    loaner_id = _create_asset(
        client,
        admin_token,
        owner_id=lender_id,
    )

    created = _create_ticket(
        client,
        asset_id,
        requester_id=borrower_id,
        token=borrower_token,
    )

    ticket = fake_db_session.tickets[created["id"]]

    ticket.status = "WAITING_LOANER_RETURN"
    ticket.loaner_asset_id = loaner_id

    loaner_asset = fake_db_session.assets[loaner_id]
    loaner_asset.status = AssetStatus.BORROWED
    loaner_asset.borrower_id = borrower_id

    # lender confirms first
    response1 = client.post(
        f"/api/tickets/{ticket.id}/confirm-loaner-return",
        headers=_auth_header(lender_token),
    )

    assert response1.status_code == 200

    # borrower confirms second
    response2 = client.post(
        f"/api/tickets/{ticket.id}/confirm-loaner-return",
        headers=_auth_header(borrower_token),
    )

    assert response2.status_code == 200

    data = response2.json()

    assert data["status"] == "DONE"

    assert data["loaner_return_lender_confirmed"] is True
    assert data["loaner_return_borrower_confirmed"] is True

    # verify loaner released
    assert loaner_asset.status == AssetStatus.AVAILABLE
    assert loaner_asset.borrower_id is None


def test_when_admin_gets_ticket_inspection_then_should_return_200(
    client,
    fake_db_session,
):
    # arrange
    admin_token, admin_user_id = _login_admin(client)

    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    created = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    ticket = fake_db_session.tickets[created["id"]]
    ticket.status = "WAITING_INSPECTION"

    inspection = RepairInspection(
        id=1,
        request_id=ticket.id,
        status=True,
        note="passed",
        checked_by=admin_user_id,
        checked_at=datetime(2026, 4, 28, tzinfo=timezone.utc),
    )

    fake_db_session.inspections = {}
    fake_db_session.inspections[ticket.id] = inspection

    # act
    response = client.get(
        f"/api/tickets/{ticket.id}/inspection",
        headers=_auth_header(admin_token),
    )

    # assert
    assert response.status_code == 200
    data = response.json()
    assert data["request_id"] == ticket.id
    assert data["status"] is True
    assert data["note"] == "passed"
    assert data["checked_by"] == admin_user_id


def test_when_user_gets_other_ticket_inspection_then_should_return_403(client):
    # arrange
    admin_token, admin_user_id = _login_admin(client)

    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    ticket = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    other_user_token = _make_token(user_id=99999, role="EMPLOYEE")

    # act
    response = client.get(
        f"/api/tickets/{ticket['id']}/inspection",
        headers=_auth_header(other_user_token),
    )

    # assert
    assert response.status_code == 403


def test_when_get_nonexistent_ticket_inspection_then_should_return_404(client):
    admin_token, _ = _login_admin(client)

    response = client.get(
        "/api/tickets/999999/inspection",
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 404


def test_when_ticket_has_no_inspection_then_should_return_404(client):
    # arrange
    admin_token, admin_user_id = _login_admin(client)

    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    ticket = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    # act
    response = client.get(
        f"/api/tickets/{ticket['id']}/inspection",
        headers=_auth_header(admin_token),
    )

    # assert
    assert response.status_code == 404
    assert response.json()["detail"] == "inspection not found"


def test_when_admin_creates_ticket_inspection_then_should_return_201(
    client,
    fake_db_session,
):
    # arrange
    admin_token, admin_user_id = _login_admin(client)

    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    created = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)
    ticket = fake_db_session.tickets[created["id"]]
    payload = {
        "status": True,
        "note": "All good",
        "checked_by": admin_user_id,
    }

    # act
    response = client.post(
        f"/api/tickets/{ticket.id}/inspection",
        json=payload,
        headers=_auth_header(admin_token),
    )

    # assert
    assert response.status_code == 201
    data = response.json()
    assert data["request_id"] == ticket.id
    assert data["status"] is True
    assert data["note"] == "All good"
    assert data["checked_by"] == admin_user_id


def test_when_non_admin_creates_ticket_inspection_then_should_return_403(
    client,
    fake_db_session,
):
    # arrange
    admin_token, admin_user_id = _login_admin(client)

    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    ticket = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    employee_token = _make_token(user_id=99999, role="EMPLOYEE")

    payload = {
        "status": "PASSED",
        "note": "Not allowed",
        "checked_by": "Hacker",
    }

    # act
    response = client.post(
        f"/api/tickets/{ticket['id']}/inspection",
        json=payload,
        headers=_auth_header(employee_token),
    )

    # assert
    assert response.status_code == 403


def test_when_create_inspection_for_nonexistent_ticket_then_should_return_404(
    client,
):
    admin_token, _ = _login_admin(client)

    payload = {
        "status": True,
        "note": "test",
        "checked_by": 1,
    }

    response = client.post(
        "/api/tickets/999999/inspection",
        json=payload,
        headers=_auth_header(admin_token),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "ticket not found"


def test_when_inspection_already_exists_then_should_return_409(
    client,
    fake_db_session,
):
    # arrange
    admin_token, admin_user_id = _login_admin(client)

    asset_id = _create_asset(client, admin_token, owner_id=admin_user_id)
    ticket = _create_ticket(client, asset_id, requester_id=admin_user_id, token=admin_token)

    payload = {
        "status": True,
        "note": "first",
        "checked_by": admin_user_id,
    }

    # create first inspection
    response1 = client.post(
        f"/api/tickets/{ticket['id']}/inspection",
        json=payload,
        headers=_auth_header(admin_token),
    )
    assert response1.status_code == 201

    # act: try create again
    response2 = client.post(
        f"/api/tickets/{ticket['id']}/inspection",
        json=payload,
        headers=_auth_header(admin_token),
    )

    # assert
    assert response2.status_code == 409
    assert response2.json()["detail"] == "inspection already exists"
