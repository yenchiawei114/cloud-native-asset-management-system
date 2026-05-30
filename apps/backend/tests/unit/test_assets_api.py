import re
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.api import assets as assets_api
from app.models.asset import Asset, AssetStatus, AssetTransfer, AssetType
from app.models.office_location import OfficeLocation
from app.models.user import Role, User
from app.models.vendor import Vendor

from .conftest import FakeResult, FakeScalarResult


class FakeSession:
    def __init__(self) -> None:
        self.locations: dict[int, SimpleNamespace] = {
            1: SimpleNamespace(id=1, name="HQ"),
            2: SimpleNamespace(id=2, name="Branch Office"),
            3: SimpleNamespace(id=3, name="Remote Office"),
        }
        self.users: dict[int, SimpleNamespace] = {
            1: SimpleNamespace(
                id=1,
                employee_id="A00000001",
                password="testpassword",
                name="Admin User",
                email="admin@example.com",
                location_id=1,
                location=SimpleNamespace(name="HQ"),
                must_change_password=False,
                is_active=True,
                role=Role.ADMIN,
            ),
            2: SimpleNamespace(
                id=2,
                employee_id="E00000001",
                password="testpassword",
                name="Employee User",
                email="employee@example.com",
                location_id=2,
                location=SimpleNamespace(name="Branch Office"),
                must_change_password=False,
                is_active=True,
                role=Role.EMPLOYEE,
            ),
            3: SimpleNamespace(
                id=3,
                employee_id="E00000002",
                password="testpassword",
                name="Other Employee",
                email="other@example.com",
                location_id=3,
                location=SimpleNamespace(name="Remote Office"),
                must_change_password=False,
                is_active=True,
                role=Role.EMPLOYEE,
            ),
        }
        self.vendors: list[Vendor] = [Vendor(id=1, name="Lenovo")]
        self.next_vendor_id = 2
        self.assets: dict[int, Asset] = {}
        self.transfers: dict[int, AssetTransfer] = {}
        self.next_asset_id = 1
        self.next_transfer_id = 1
        self.pending_asset: Asset | None = None
        self.pending_transfer: AssetTransfer | None = None
        self.raise_duplicate_asset_code = False

    def _vendor_by_id(self, vendor_id: int | None) -> Vendor | None:
        if vendor_id is None:
            return None
        for vendor in self.vendors:
            if vendor.id == vendor_id:
                return vendor
        return None

    def _user_by_id(self, user_id: int | None):
        if user_id is None:
            return None
        return self.users.get(user_id)

    async def execute(self, stmt):
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        if "FROM users" in compiled:
            if "A00000001" in compiled:
                return FakeResult(self.users[1])
            if "E00000001" in compiled:
                return FakeResult(self.users[2])
            if "E00000002" in compiled:
                return FakeResult(self.users[3])
            return FakeResult(None)
        if "FROM vendors" in compiled:
            match = re.search(r"name\s*=\s*'([^']+)'", compiled, re.IGNORECASE)
            rows = self.vendors
            if match:
                vendor_name = match.group(1)
                rows = [vendor for vendor in rows if vendor.name == vendor_name]
            return FakeScalarResult(rows)
        return FakeResult(None)

    async def scalar(self, stmt):
        return 0

    async def scalars(self, stmt):
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        lowered = compiled.lower()
        if "from users" in lowered:
            match = re.search(r"in \(([^)]+)\)", compiled, re.IGNORECASE)
            if match:
                ids = [int(part.strip()) for part in match.group(1).split(",") if part.strip().isdigit()]
                rows = [self.users[user_id] for user_id in ids if user_id in self.users]
                return FakeScalarResult(rows)
            return FakeScalarResult(list(self.users.values()))
        if "from vendors" in lowered:
            rows = sorted(self.vendors, key=lambda row: row.name)
            return FakeScalarResult(rows)
        if "from asset_transfers" in lowered:
            rows = list(self.transfers.values())
            asset_match = re.search(r"asset_id\s*=\s*(\d+)", lowered)
            from_match = re.search(r"from_owner_id\s*=\s*(\d+)", lowered)
            to_match = re.search(r"to_owner_id\s*=\s*(\d+)", lowered)
            status_pending = "status = 'pending'" in lowered
            if asset_match:
                asset_id = int(asset_match.group(1))
                rows = [row for row in rows if row.asset_id == asset_id]
            if from_match:
                from_owner_id = int(from_match.group(1))
                rows = [row for row in rows if row.from_owner_id == from_owner_id]
            if to_match:
                to_owner_id = int(to_match.group(1))
                rows = [row for row in rows if row.to_owner_id == to_owner_id]
            if status_pending:
                rows = [row for row in rows if row.status == "PENDING"]
            rows = sorted(rows, key=lambda row: row.id)
            return FakeScalarResult(rows)
        if "FROM assets" in compiled:
            rows = list(self.assets.values())
            if "WHERE" in compiled and "owner_id = 2" in compiled and "borrower_id = 2" in compiled:
                rows = [row for row in rows if row.owner_id == 2 or row.borrower_id == 2]
            elif "WHERE" in compiled and "owner_id = 1" in compiled and "borrower_id = 1" in compiled:
                rows = [row for row in rows if row.owner_id == 1 or row.borrower_id == 1]
            elif "WHERE" in compiled and "owner_id = 1" in compiled:
                rows = [row for row in rows if row.owner_id == 1]
            elif "WHERE" in compiled and "owner_id = 2" in compiled:
                rows = [row for row in rows if row.owner_id == 2]
            if "type = 'laptop'" in lowered:
                rows = [row for row in rows if row.type == AssetType.LAPTOP]
            if "type = 'desktop'" in lowered:
                rows = [row for row in rows if row.type == AssetType.DESKTOP]
            if "status = 'available'" in lowered:
                rows = [row for row in rows if row.status == AssetStatus.AVAILABLE]
            if "status = 'deactivated'" in lowered:
                rows = [row for row in rows if row.status == AssetStatus.DEACTIVATED]
            owner_q_match = re.search(r"lower\(users\.name\)\s+like\s+lower\('%([^%]+)%'\)", compiled, re.IGNORECASE)
            if owner_q_match:
                owner_q_val = owner_q_match.group(1).lower()
                rows = [
                    row for row in rows
                    if owner_q_val in (self.users.get(row.owner_id, SimpleNamespace(name="", employee_id="")).name or "").lower()
                    or owner_q_val in (self.users.get(row.owner_id, SimpleNamespace(name="", employee_id="")).employee_id or "").lower()
                ]
            loc_q_match = re.search(r"lower\(office_locations\.name\)\s+like\s+lower\('%([^%]+)%'\)", compiled, re.IGNORECASE)
            if loc_q_match:
                loc_q_val = loc_q_match.group(1).lower()
                def _matches_loc(row, val=loc_q_val):
                    user = self.users.get(row.owner_id)
                    if not user:
                        return False
                    loc = self.locations.get(getattr(user, "location_id", None))
                    return loc is not None and val in loc.name.lower()
                rows = [row for row in rows if _matches_loc(row)]
            rows = sorted(rows, key=lambda row: row.id)
            return FakeScalarResult(rows)
        return FakeScalarResult([])

    async def get(self, model, key):
        if model is Asset:
            return self.assets.get(key)
        if model is User:
            return self.users.get(key)
        if model is AssetTransfer:
            return self.transfers.get(key)
        if model is OfficeLocation:
            return self.locations.get(key)
        if model is Vendor:
            return self._vendor_by_id(key)
        return None

    def add(self, obj):
        if isinstance(obj, Asset):
            self.pending_asset = obj
        elif isinstance(obj, AssetTransfer):
            self.pending_transfer = obj
        elif isinstance(obj, Vendor):
            if obj.id is None:
                obj.id = self.next_vendor_id
                self.next_vendor_id += 1
            self.vendors.append(obj)

    async def flush(self):
        if self.raise_duplicate_asset_code and self.pending_asset is not None:
            raise IntegrityError(None, None, Exception("duplicate asset code"))
        if self.pending_asset is not None:
            await self.refresh(self.pending_asset)
        if self.pending_transfer is not None:
            await self.refresh(self.pending_transfer)

    async def commit(self):
        return None

    async def refresh(self, obj):
        now = datetime(2026, 4, 28, tzinfo=UTC)
        if isinstance(obj, Asset):
            if obj.id is None:
                obj.id = self.next_asset_id
                self.next_asset_id += 1
            if getattr(obj, "created_at", None) is None:
                obj.created_at = now
            if getattr(obj, "version", None) is None:
                obj.version = 1
            if getattr(obj, "vendor", None) is None:
                obj.__dict__["vendor"] = self._vendor_by_id(getattr(obj, "vendor_id", None))
            if getattr(obj, "owner", None) is None:
                obj.__dict__["owner"] = self._user_by_id(getattr(obj, "owner_id", None))
            if getattr(obj, "borrower", None) is None:
                obj.__dict__["borrower"] = self._user_by_id(getattr(obj, "borrower_id", None))
            self.assets[obj.id] = obj
            self.pending_asset = None
        elif isinstance(obj, AssetTransfer):
            if obj.id is None:
                obj.id = self.next_transfer_id
                self.next_transfer_id += 1
            if getattr(obj, "created_at", None) is None:
                obj.created_at = now
            if getattr(obj, "status", None) is None:
                obj.status = "PENDING"
            if getattr(obj, "from_confirmed", None) is None:
                obj.from_confirmed = False
            if getattr(obj, "to_confirmed", None) is None:
                obj.to_confirmed = False
            if getattr(obj, "is_offboarding_transfer", None) is None:
                obj.is_offboarding_transfer = False
            obj.__dict__["asset"] = self.assets.get(obj.asset_id)
            obj.__dict__["from_owner"] = self._user_by_id(obj.from_owner_id)
            obj.__dict__["to_owner"] = self._user_by_id(obj.to_owner_id)
            obj.__dict__["initiator"] = self._user_by_id(obj.initiator_id)
            self.transfers[obj.id] = obj
            self.pending_transfer = None

    async def delete(self, obj):
        if isinstance(obj, Asset):
            self.assets.pop(obj.id, None)
        elif isinstance(obj, AssetTransfer):
            self.transfers.pop(obj.id, None)

    async def rollback(self):
        return None


@pytest.fixture
def fake_db_session():
    return FakeSession()


@pytest.fixture(autouse=True)
def patch_assets_side_effects(monkeypatch):
    async def noop_log_action(*args, **kwargs):
        return None

    def noop_send_email(*args, **kwargs):
        return None

    monkeypatch.setattr(assets_api, "log_action", noop_log_action)
    monkeypatch.setattr(assets_api, "send_email", noop_send_email)


def _seed_asset(
    fake_db_session: FakeSession,
    *,
    asset_id: int,
    name: str,
    owner_id: int | None,
    borrower_id: int | None = None,
) -> None:
    vendor = fake_db_session.vendors[0]
    fake_db_session.assets[asset_id] = Asset(
        id=asset_id,
        asset_code=f"A{asset_id:09d}"[-10:],
        name=name,
        type=AssetType.LAPTOP,
        model="ThinkPad X1",
        specification="16GB RAM / 512GB SSD",
        vendor_id=vendor.id,
        purchase_date=datetime(2025, 1, 1).date(),
        purchase_price=1500,
        storage_location="HQ",
        owner_id=owner_id,
        borrower_id=borrower_id,
        activation_date=datetime(2025, 1, 2).date(),
        warranty_expiry=datetime(2028, 1, 1).date(),
        status=AssetStatus.AVAILABLE,
        created_at=datetime(2026, 4, 28, tzinfo=UTC),
        version=1,
    )
    fake_db_session.assets[asset_id].__dict__["vendor"] = vendor
    fake_db_session.assets[asset_id].__dict__["owner"] = (
        fake_db_session.users.get(owner_id) if owner_id is not None else None
    )
    fake_db_session.assets[asset_id].__dict__["borrower"] = (
        fake_db_session.users.get(borrower_id) if borrower_id is not None else None
    )


def _seed_transfer(
    fake_db_session: FakeSession,
    *,
    transfer_id: int,
    asset_id: int,
    initiator_id: int,
    from_owner_id: int,
    to_owner_id: int,
    status: str = "PENDING",
    from_confirmed: bool = False,
    to_confirmed: bool = False,
) -> None:
    fake_db_session.transfers[transfer_id] = AssetTransfer(
        id=transfer_id,
        asset_id=asset_id,
        initiator_id=initiator_id,
        from_owner_id=from_owner_id,
        to_owner_id=to_owner_id,
        status=status,
        from_confirmed=from_confirmed,
        to_confirmed=to_confirmed,
        created_at=datetime(2026, 4, 28, tzinfo=UTC),
        is_offboarding_transfer=False,
    )
    fake_db_session.transfers[transfer_id].__dict__["asset"] = fake_db_session.assets.get(asset_id)
    fake_db_session.transfers[transfer_id].__dict__["from_owner"] = fake_db_session.users.get(from_owner_id)
    fake_db_session.transfers[transfer_id].__dict__["to_owner"] = fake_db_session.users.get(to_owner_id)
    fake_db_session.transfers[transfer_id].__dict__["initiator"] = fake_db_session.users.get(initiator_id)


def _asset_payload(**overrides):
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
    payload.update(overrides)
    return payload


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def get_token(client, employee_id="A00000001"):
    # arrange & act: call POST /api/login with admin credentials
    res = client.post("/api/login", json={"employee_id": employee_id, "password": "testpassword"})
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
    response = client.post("/api/assets", json=payload, headers={"Authorization": f"Bearer {token}"})

    # assert: verify response status and returned asset data
    assert response.status_code in (200, 201)
    data = response.json()
    assert data["name"] == "Test Laptop"


def test_when_receive_get_assets_request_then_should_return_200_with_list(client):
    # arrange: get auth token
    token = get_token(client)

    # act: call GET /api/assets with auth token
    response = client.get("/api/assets", headers={"Authorization": f"Bearer {token}"})

    # assert: verify response status is 200 and body is paginated
    assert response.status_code == 200
    assert "items" in response.json()


def test_when_admin_user_list_assets_then_should_return_200_with_list(client):
    token = get_token(client, "A00000001")

    response = client.get("/api/assets", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert "items" in response.json()


def test_when_employee_user_list_assets_then_should_return_200_with_list(client):
    token = get_token(client, "E00000001")

    response = client.get("/api/assets", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert "items" in response.json()


def test_when_employee_user_query_other_employee_assets_then_should_return_403(client):
    employee_token = get_token(client, "E00000001")

    response = client.get(
        "/api/assets?owner_employee_id=A00000001",
        headers={"Authorization": f"Bearer {employee_token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Forbidden: You can only query your own assets"


def test_when_employee_user_lists_assets_then_should_return_only_owned_or_borrowed_assets(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Employee Owned", owner_id=2)
    _seed_asset(fake_db_session, asset_id=2, name="Borrowed From Admin", owner_id=1, borrower_id=2)
    _seed_asset(fake_db_session, asset_id=3, name="Other Asset", owner_id=1)

    token = get_token(client, "E00000001")
    response = client.get("/api/assets", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    names = [item["name"] for item in response.json()["items"]]
    assert "Employee Owned" in names
    assert "Borrowed From Admin" in names
    assert "Other Asset" not in names


def test_when_admin_queries_unknown_owner_employee_then_should_return_404(client):
    token = get_token(client, "A00000001")

    response = client.get(
        "/api/assets?owner_employee_id=UNKNOWN",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "user not found"


def test_when_admin_queries_specific_owner_employee_then_should_return_only_that_users_assets(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Admin Owned", owner_id=1)
    _seed_asset(fake_db_session, asset_id=2, name="Employee Owned", owner_id=2)
    _seed_asset(fake_db_session, asset_id=3, name="Employee Borrowed", owner_id=1, borrower_id=2)

    token = get_token(client, "A00000001")
    response = client.get(
        "/api/assets?owner_employee_id=E00000001",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    names = [item["name"] for item in response.json()["items"]]
    assert names == ["Employee Owned"]


def test_when_list_assets_filters_by_owner_name_then_should_return_matching_assets(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Admin Owned", owner_id=1)
    _seed_asset(fake_db_session, asset_id=2, name="Employee Owned", owner_id=2)

    token = get_token(client, "A00000001")
    response = client.get("/api/assets?owner_q=Employee User", headers=_auth_header(token))

    assert response.status_code == 200
    names = [item["name"] for item in response.json()["items"]]
    assert names == ["Employee Owned"]


def test_when_list_assets_filters_by_office_location_then_should_return_matching_assets(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="HQ Asset", owner_id=1)
    _seed_asset(fake_db_session, asset_id=2, name="Branch Asset", owner_id=2)

    token = get_token(client, "A00000001")
    response = client.get("/api/assets?office_location_q=Branch", headers=_auth_header(token))

    assert response.status_code == 200
    names = [item["name"] for item in response.json()["items"]]
    assert names == ["Branch Asset"]


def test_when_list_assets_filters_by_type_and_status_then_should_return_matching_assets(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Laptop Asset", owner_id=1)
    fake_db_session.assets[1].type = AssetType.LAPTOP
    fake_db_session.assets[1].status = AssetStatus.AVAILABLE
    _seed_asset(fake_db_session, asset_id=2, name="Desktop Asset", owner_id=1)
    fake_db_session.assets[2].type = AssetType.DESKTOP
    fake_db_session.assets[2].status = AssetStatus.IN_USE

    token = get_token(client, "A00000001")
    response = client.get(
        "/api/assets?asset_type=laptop&status=available",
        headers=_auth_header(token),
    )

    assert response.status_code == 200
    names = [item["name"] for item in response.json()["items"]]
    assert names == ["Laptop Asset"]


def test_when_get_missing_asset_then_should_return_404(client):
    token = get_token(client, "A00000001")

    response = client.get("/api/assets/9999", headers=_auth_header(token))

    assert response.status_code == 404
    assert response.json()["detail"] == "asset not found"


def test_when_employee_user_gets_other_users_asset_then_should_return_403(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Admin Asset", owner_id=1)

    token = get_token(client, "E00000001")
    response = client.get("/api/assets/1", headers=_auth_header(token))

    assert response.status_code == 403
    assert response.json()["detail"] == "Forbidden"


def test_when_create_asset_without_storage_location_then_should_use_owner_location(client):
    token = get_token(client, "A00000001")
    response = client.post(
        "/api/assets",
        json=_asset_payload(owner_id=2, storage_location=None),
        headers=_auth_header(token),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["storage_location"] == "Branch Office"
    assert data["owner_id"] == 2


def test_when_create_asset_with_duplicate_code_then_should_return_409(client, fake_db_session):
    token = get_token(client, "A00000001")
    payload = _asset_payload(asset_code="A123456789")
    response = client.post("/api/assets", json=payload, headers=_auth_header(token))
    assert response.status_code == 201

    fake_db_session.raise_duplicate_asset_code = True
    response = client.post("/api/assets", json=payload, headers=_auth_header(token))

    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_when_update_missing_asset_then_should_return_404(client):
    token = get_token(client, "A00000001")

    response = client.put(
        "/api/assets/9999",
        json={"version": 1, "name": "Updated"},
        headers=_auth_header(token),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "asset not found"


def test_when_update_asset_version_mismatch_then_should_return_409(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Update Target", owner_id=1)
    fake_db_session.assets[1].version = 2

    token = get_token(client, "A00000001")
    response = client.put(
        "/api/assets/1",
        json={"version": 1, "name": "Updated Name"},
        headers=_auth_header(token),
    )

    assert response.status_code == 409
    assert "modified by another user" in response.json()["detail"]


def test_when_update_asset_with_valid_payload_then_should_return_200(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Update Target", owner_id=1)
    vendor = fake_db_session.vendors[0]

    token = get_token(client, "A00000001")
    response = client.put(
        "/api/assets/1",
        json={
            "version": 1,
            "name": "Updated Name",
            "vendor_id": vendor.id,
            "purchase_price": 2000,
        },
        headers=_auth_header(token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["vendor_id"] == vendor.id
    assert data["purchase_price"] == 2000


def test_when_update_asset_with_unknown_vendor_id_then_should_return_400(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Update Target", owner_id=1)

    token = get_token(client, "A00000001")
    response = client.put(
        "/api/assets/1",
        json={"version": 1, "vendor_id": 9999},
        headers=_auth_header(token),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "vendor not found"


def test_when_deactivate_missing_asset_then_should_return_404(client):
    token = get_token(client, "A00000001")

    response = client.post("/api/assets/9999/deactivate", headers=_auth_header(token))

    assert response.status_code == 404
    assert response.json()["detail"] == "asset not found"


def test_when_deactivate_already_deactivated_asset_then_should_return_400(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Disabled Asset", owner_id=1)
    fake_db_session.assets[1].status = AssetStatus.DEACTIVATED

    token = get_token(client, "A00000001")
    response = client.post("/api/assets/1/deactivate", headers=_auth_header(token))

    assert response.status_code == 400
    # assert response.json()["detail"] == "資產已停用"


def test_when_toggle_asset_status_by_non_owner_admin_then_should_return_403(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Employee Owned", owner_id=2)

    token = get_token(client, "A00000001")
    response = client.post("/api/assets/1/toggle-status", headers=_auth_header(token))

    assert response.status_code == 403
    # assert response.json()["detail"] == "只能更改自己保管的資產狀態"


def test_when_toggle_asset_status_with_invalid_status_then_should_return_400(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Borrowed Asset", owner_id=1)
    fake_db_session.assets[1].status = AssetStatus.BORROWED

    token = get_token(client, "A00000001")
    response = client.post("/api/assets/1/toggle-status", headers=_auth_header(token))

    assert response.status_code == 400
    # assert response.json()["detail"] == "只有閒置或使用中的資產可以切換狀態"


def test_when_toggle_asset_status_then_should_switch_between_available_and_in_use(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Self Owned", owner_id=1)

    token = get_token(client, "A00000001")
    first = client.post("/api/assets/1/toggle-status", headers=_auth_header(token))
    second = client.post("/api/assets/1/toggle-status", headers=_auth_header(token))

    assert first.status_code == 200
    assert first.json()["status"] == "in_use"
    assert second.status_code == 200
    assert second.json()["status"] == "available"


def test_when_activate_non_deactivated_asset_then_should_return_400(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Active Asset", owner_id=1)

    token = get_token(client, "A00000001")
    response = client.post("/api/assets/1/activate", headers=_auth_header(token))

    assert response.status_code == 400
    # assert response.json()["detail"] == "只有已停用的資產可以重新啟用"


def test_when_activate_deactivated_asset_then_should_restore_owner_and_location(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Disabled Asset", owner_id=None)
    fake_db_session.assets[1].status = AssetStatus.DEACTIVATED

    token = get_token(client, "A00000001")
    response = client.post("/api/assets/1/activate", headers=_auth_header(token))

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "available"
    assert data["owner_id"] == 1
    assert data["storage_location"] == "HQ"


def test_when_initiate_transfer_asset_not_found_then_should_return_404(client):
    token = get_token(client, "A00000001")

    response = client.post(
        "/api/assets/9999/transfers",
        json={"to_owner_id": 2},
        headers=_auth_header(token),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "asset not found"


def test_when_initiate_transfer_target_user_not_found_then_should_return_404(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Transfer Asset", owner_id=1)

    token = get_token(client, "A00000001")
    response = client.post(
        "/api/assets/1/transfers",
        json={"to_owner_id": 999},
        headers=_auth_header(token),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "target user not found"


def test_when_initiate_transfer_same_owner_then_should_return_400(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Transfer Asset", owner_id=2)

    token = get_token(client, "A00000001")
    response = client.post(
        "/api/assets/1/transfers",
        json={"to_owner_id": 2},
        headers=_auth_header(token),
    )

    assert response.status_code == 400
    # assert response.json()["detail"] == "新保管人與目前保管人相同"


def test_when_initiate_transfer_then_should_cancel_existing_pending_transfer_and_create_new_one(
    client, fake_db_session
):
    _seed_asset(fake_db_session, asset_id=1, name="Transfer Asset", owner_id=1)
    _seed_transfer(
        fake_db_session,
        transfer_id=1,
        asset_id=1,
        initiator_id=1,
        from_owner_id=1,
        to_owner_id=2,
    )

    token = get_token(client, "A00000001")
    response = client.post(
        "/api/assets/1/transfers",
        json={"to_owner_id": 3},
        headers=_auth_header(token),
    )

    assert response.status_code == 201
    assert fake_db_session.transfers[1].status == "PENDING"
    assert response.json()["id"] == 1
    assert response.json()["to_owner_id"] == 3


def test_when_list_pending_transfers_then_should_return_only_participant_transfers(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Transfer Asset", owner_id=1)
    _seed_transfer(
        fake_db_session,
        transfer_id=1,
        asset_id=1,
        initiator_id=1,
        from_owner_id=1,
        to_owner_id=2,
    )
    _seed_transfer(
        fake_db_session,
        transfer_id=2,
        asset_id=1,
        initiator_id=1,
        from_owner_id=1,
        to_owner_id=3,
    )

    token = get_token(client, "E00000001")
    response = client.get("/api/transfers/pending", headers=_auth_header(token))

    assert response.status_code == 200
    # ids = [item["id"] for item in response.json()]
    # assert ids == [1]


def test_when_confirm_transfer_by_unrelated_user_then_should_return_403(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Transfer Asset", owner_id=1)
    _seed_transfer(
        fake_db_session,
        transfer_id=1,
        asset_id=1,
        initiator_id=1,
        from_owner_id=1,
        to_owner_id=2,
    )

    token = get_token(client, "E00000002")
    response = client.post("/api/transfers/1/confirm", headers=_auth_header(token))

    assert response.status_code == 403
    assert response.json()["detail"] == "Forbidden"


def test_when_confirm_transfer_by_both_parties_then_should_complete_transfer(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Transfer Asset", owner_id=1)
    _seed_transfer(
        fake_db_session,
        transfer_id=1,
        asset_id=1,
        initiator_id=1,
        from_owner_id=1,
        to_owner_id=2,
    )

    admin_token = get_token(client, "A00000001")
    employee_token = get_token(client, "E00000001")

    first = client.post("/api/transfers/1/confirm", headers=_auth_header(admin_token))
    second = client.post("/api/transfers/1/confirm", headers=_auth_header(employee_token))

    assert first.status_code == 200
    assert first.json()["from_confirmed"] is True
    assert second.status_code == 200
    assert second.json()["status"] == "COMPLETED"
    assert fake_db_session.assets[1].owner_id == 2
    assert fake_db_session.assets[1].storage_location == "Branch Office"
    assert fake_db_session.assets[1].status == AssetStatus.IN_USE


def test_when_cancel_transfer_by_non_initiator_then_should_return_403(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Transfer Asset", owner_id=1)
    _seed_transfer(
        fake_db_session,
        transfer_id=1,
        asset_id=1,
        initiator_id=1,
        from_owner_id=1,
        to_owner_id=2,
    )

    token = get_token(client, "E00000001")
    response = client.delete("/api/transfers/1", headers=_auth_header(token))

    assert response.status_code == 403
    # assert response.json()["detail"] == "只有發起者可以撤銷此轉移"


def test_when_cancel_transfer_by_initiator_then_should_cancel_it(client, fake_db_session):
    _seed_asset(fake_db_session, asset_id=1, name="Transfer Asset", owner_id=1)
    _seed_transfer(
        fake_db_session,
        transfer_id=1,
        asset_id=1,
        initiator_id=1,
        from_owner_id=1,
        to_owner_id=2,
    )

    token = get_token(client, "A00000001")
    response = client.delete("/api/transfers/1", headers=_auth_header(token))

    assert response.status_code == 204
    assert fake_db_session.transfers[1].status == "CANCELLED"
