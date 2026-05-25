import csv
import io
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.exc import StaleDataError

from app.api.deps import get_current_user, require_role
from app.core.audit import log_action
from app.core.db import get_db
from app.core.email import send_email
from app.models import Asset, AssetTransfer, OfficeLocation
from app.models.asset import AssetStatus, AssetType
from app.models.audit_log import Action, TargetType
from app.models.user import Role, User
from app.models.vendor import Vendor

admin_required = require_role("ADMIN")
router = APIRouter()


class PaginatedAssetResponse(BaseModel):
    total: int
    items: list
    skip: int
    limit: int


class AssetCreate(BaseModel):
    asset_code: str
    name: str
    type: AssetType
    model: str
    specification: str
    vendor: str
    purchase_date: date
    purchase_price: int
    storage_location: str | None = None
    owner_id: int | None = None
    activation_date: date
    warranty_expiry: date
    status: AssetStatus = AssetStatus.AVAILABLE


class AssetUpdate(BaseModel):
    version: int
    # asset_code 為唯一鍵，不允許修改；status 由業務流程控制，不允許直接更改
    name: str | None = None
    type: AssetType | None = None
    model: str | None = None
    specification: str | None = None
    vendor: str | None = None
    purchase_date: date | None = None
    purchase_price: int | None = None
    storage_location: str | None = None
    activation_date: date | None = None
    warranty_expiry: date | None = None


class AssetOut(AssetCreate):
    id: int
    created_at: datetime
    version: int
    borrower_id: int | None = None
    owner_name: str | None = None
    owner_employee_id: str | None = None
    office_location: str | None = None


class AssetTransferCreate(BaseModel):
    to_owner_id: int


class AssetTransferOut(BaseModel):
    id: int
    asset_id: int
    initiator_id: int
    from_owner_id: int
    to_owner_id: int
    status: str
    from_confirmed: bool
    to_confirmed: bool
    created_at: datetime
    asset_name: str | None = None
    asset_code: str | None = None
    from_owner_name: str | None = None
    to_owner_name: str | None = None


class AssetImportRowResult(BaseModel):
    row: int
    asset_code: str | None = None
    action: str | None = None
    success: bool
    error: str | None = None


class AssetImportResponse(BaseModel):
    total: int
    success_count: int
    failure_count: int
    results: list[AssetImportRowResult]


def _to_out(asset: Asset, owner: User | None = None) -> AssetOut:
    return AssetOut(
        id=asset.id,
        asset_code=asset.asset_code,
        name=asset.name,
        type=asset.type,
        model=asset.model,
        specification=asset.specification,
        vendor=asset.vendor.name,
        purchase_date=asset.purchase_date,
        purchase_price=asset.purchase_price,
        storage_location=asset.storage_location,
        owner_id=asset.owner_id,
        borrower_id=asset.borrower_id,
        activation_date=asset.activation_date,
        warranty_expiry=asset.warranty_expiry,
        status=asset.status,
        created_at=asset.created_at,
        version=asset.version,
        owner_name=owner.name if owner else None,
        owner_employee_id=owner.employee_id if owner else None,
        office_location=owner.location.name if owner and owner.location else None,
    )


def _transfer_to_out(
    t: AssetTransfer,
    asset: Asset | None = None,
    from_owner: User | None = None,
    to_owner: User | None = None,
) -> AssetTransferOut:
    return AssetTransferOut(
        id=t.id,
        asset_id=t.asset_id,
        initiator_id=t.initiator_id,
        from_owner_id=t.from_owner_id,
        to_owner_id=t.to_owner_id,
        status=t.status,
        from_confirmed=t.from_confirmed,
        to_confirmed=t.to_confirmed,
        created_at=t.created_at,
        asset_name=asset.name if asset else None,
        asset_code=asset.asset_code if asset else None,
        from_owner_name=from_owner.name if from_owner else None,
        to_owner_name=to_owner.name if to_owner else None,
    )


ASSET_OUT_OPTIONS = (
    selectinload(Asset.vendor),
    selectinload(Asset.owner).selectinload(User.location),
)


TRANSFER_OUT_OPTIONS = (
    selectinload(AssetTransfer.asset).selectinload(Asset.vendor),
    selectinload(AssetTransfer.from_owner).selectinload(User.location),
    selectinload(AssetTransfer.to_owner).selectinload(User.location),
)


async def _get_asset_for_out(db: AsyncSession, asset_id: int) -> Asset | None:
    return (
        await db.scalars(
            select(Asset)
            .options(*ASSET_OUT_OPTIONS)
            .where(Asset.id == asset_id)
        )
    ).first()

def _asset_owner(asset: Asset) -> User | None:
    return asset.owner if asset.owner_id else None
    
async def _get_transfer_for_out(db: AsyncSession, transfer_id: int) -> AssetTransfer | None:
    return (
        await db.scalars(
            select(AssetTransfer)
            .options(*TRANSFER_OUT_OPTIONS)
            .where(AssetTransfer.id == transfer_id)
        )
    ).first()


async def _asset_before_for_log(db: AsyncSession, asset: Asset) -> dict:
    vendor = await db.get(Vendor, asset.vendor_id)
    owner_employee_id = None
    if asset.owner_id:
        owner = await db.get(User, asset.owner_id)
        owner_employee_id = owner.employee_id if owner else None
    return {
        "asset_code": asset.asset_code,
        "name": asset.name,
        "type": asset.type.value,
        "model": asset.model,
        "specification": asset.specification,
        "vendor": vendor.name if vendor else None,
        "purchase_date": str(asset.purchase_date),
        "purchase_price": asset.purchase_price,
        "storage_location": asset.storage_location,
        "owner_employee_id": owner_employee_id,
        "activation_date": str(asset.activation_date),
        "warranty_expiry": str(asset.warranty_expiry),
        "status": asset.status.value,
    }


def _parse_csv_date(raw: str) -> date:
    raw = raw.strip()
    if not raw:
        raise ValueError("date required")
    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError("invalid date format")


def _normalize_csv_value(value: str | list[str] | None) -> str:
    if isinstance(value, list):
        value = ",".join(value)
    return (value or "").strip()


@router.get("/assets", response_model=PaginatedAssetResponse)
async def list_assets(
    owner_employee_id: str | None = None,
    keyword: str | None = None,
    asset_code_q: str | None = None,
    name_q: str | None = None,
    model_q: str | None = None,
    spec_q: str | None = None,
    vendor_q: str | None = None,
    owner_q: str | None = None,
    office_location_q: str | None = None,
    asset_type: AssetType | None = None,
    status: AssetStatus | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> PaginatedAssetResponse:
    stmt = select(Asset)

    is_admin = user.get("role") == "ADMIN"
    my_employee_id = user.get("employee_id")
    my_user_id = user.get("user_id")

    if not is_admin:
        if owner_employee_id is not None and owner_employee_id != my_employee_id:
            raise HTTPException(status_code=403, detail="Forbidden: You can only query your own assets")
        # 包含保管人是自己或借用者是自己（備用機借用）的資產
        stmt = stmt.where(or_(Asset.owner_id == my_user_id, Asset.borrower_id == my_user_id))
    else:
        if owner_employee_id is not None:
            target_user = (await db.execute(
                select(User).where(User.employee_id == owner_employee_id)
            )).scalar_one_or_none()
            if target_user is None:
                raise HTTPException(status_code=404, detail="user not found")
            stmt = stmt.where(Asset.owner_id == target_user.id)

    if asset_type:
        stmt = stmt.where(Asset.type == asset_type)
    if status:
        stmt = stmt.where(Asset.status == status)

    # 追蹤已 JOIN 的資料表，避免重複 JOIN
    vendor_joined = False
    owner_joined = False

    # 舊版通用關鍵字搜尋（向下相容）
    if keyword:
        stmt = stmt.outerjoin(Asset.vendor)
        vendor_joined = True
        stmt = stmt.where(
            or_(
                Asset.name.ilike(f"%{keyword}%"),
                Asset.asset_code.ilike(f"%{keyword}%"),
                Asset.model.ilike(f"%{keyword}%"),
                Vendor.name.ilike(f"%{keyword}%"),
            )
        )

    # 新版各欄位獨立搜尋
    if asset_code_q:
        stmt = stmt.where(Asset.asset_code.ilike(f"%{asset_code_q}%"))
    if name_q:
        stmt = stmt.where(Asset.name.ilike(f"%{name_q}%"))
    if model_q:
        stmt = stmt.where(Asset.model.ilike(f"%{model_q}%"))
    if spec_q:
        stmt = stmt.where(Asset.specification.ilike(f"%{spec_q}%"))
    if vendor_q:
        if not vendor_joined:
            stmt = stmt.join(Asset.vendor)
            vendor_joined = True
        stmt = stmt.where(Vendor.name.ilike(f"%{vendor_q}%"))
    if owner_q:
        stmt = stmt.outerjoin(User, Asset.owner_id == User.id)
        owner_joined = True
        stmt = stmt.where(
            or_(
                User.name.ilike(f"%{owner_q}%"),
                User.employee_id.ilike(f"%{owner_q}%"),
            )
        )
    if office_location_q:
        if not owner_joined:
            stmt = stmt.outerjoin(User, Asset.owner_id == User.id)
            owner_joined = True
        stmt = stmt.outerjoin(OfficeLocation, User.location_id == OfficeLocation.id)
        stmt = stmt.where(OfficeLocation.name.ilike(f"%{office_location_q}%"))

    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    data_q = (
        stmt.options(*ASSET_OUT_OPTIONS)
        .order_by(Asset.id.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.scalars(data_q)).all()
    items = [_to_out(r, _asset_owner(r)) for r in rows]

    return PaginatedAssetResponse(total=total, items=items, skip=skip, limit=limit)


@router.get("/assets/idle", response_model=list[AssetOut])
async def list_idle_assets(
    owner_only: bool = False,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[AssetOut]:
    """列出閒置資產。owner_only=true 時只回傳當前用戶保管的閒置資產（供核准備用機時選擇）。"""
    stmt = (
        select(Asset)
        .options(*ASSET_OUT_OPTIONS)
        .where(Asset.status == AssetStatus.AVAILABLE)
        .order_by(Asset.id.desc())
    )
    if owner_only:
        stmt = stmt.where(Asset.owner_id == user["user_id"])
    rows = (await db.scalars(stmt)).all()
    return [_to_out(r, _asset_owner(r)) for r in rows]


@router.get("/assets/{asset_id}", response_model=AssetOut)
async def get_asset(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)) -> AssetOut:
    asset = await _get_asset_for_out(db, asset_id)
    
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")

    if user.get("role") != "ADMIN" and asset.owner_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    return _to_out(asset, _asset_owner(asset))


@router.post("/assets", response_model=AssetOut, status_code=201)
async def create_asset(
    payload: AssetCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(admin_required),
) -> AssetOut:
    payload_dict = payload.model_dump()

    vendor = (
        await db.scalars(
            select(Vendor).where(Vendor.name == payload.vendor)
        )
    ).first()

    if vendor is None:
        raise HTTPException(status_code=400, detail="vendor not found")

    payload_dict["vendor_id"] = vendor.id
    payload_dict.pop("vendor")

    # 辦公地點跟隨保管人，若無手動指定，自動填入保管人的 location
    if not payload_dict.get("storage_location"):
        owner_id = payload_dict.get("owner_id") or user["user_id"]
        ref_user = await db.get(User, owner_id)
        location_id = getattr(ref_user, "location_id", None) if ref_user else None
        if location_id:
            location = await db.get(OfficeLocation, location_id)
            if location:
                payload_dict["storage_location"] = location.name
        elif ref_user and getattr(ref_user, "location", None):
            legacy_location = ref_user.location
            payload_dict["storage_location"] = getattr(legacy_location, "name", legacy_location)

    asset = Asset(**payload_dict)
    db.add(asset)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="該資產編號已存在 (Asset code already exists)") from None
    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.CREATE,
        target_type=TargetType.ASSET,
        target_id=asset.id,
        target_name=f"{asset.name} ({asset.asset_code})",
        detail={"after": payload.model_dump(mode="json")},
    )
    await db.commit()
    asset = await _get_asset_for_out(db, asset.id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    return _to_out(asset, _asset_owner(asset))


@router.post("/assets/import", response_model=AssetImportResponse)
async def import_assets_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(admin_required),
) -> AssetImportResponse:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty file")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as err:
        raise HTTPException(status_code=400, detail="invalid file encoding, expected UTF-8") from err

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="missing CSV header")

    normalized_headers = [h.strip().lower() for h in reader.fieldnames]
    required_headers = {
        "asset_code",
        "name",
        "type",
        "model",
        "specification",
        "vendor",
        "purchase_date",
        "purchase_price",
        "activation_date",
        "warranty_expiry",
    }
    missing = required_headers - set(normalized_headers)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"missing required columns: {', '.join(sorted(missing))}",
        )

    results: list[AssetImportRowResult] = []
    prepared_rows: list[dict] = []
    row_results: dict[int, AssetImportRowResult] = {}
    has_error = False
    location_cache: dict[int, str | None] = {}

    async def _get_location_name_for_user(user_id: int) -> str | None:
        if user_id in location_cache:
            return location_cache[user_id]
        ref_user = await db.get(User, user_id)
        if not ref_user or not ref_user.location_id:
            location_cache[user_id] = None
            return None
        location = await db.get(OfficeLocation, ref_user.location_id)
        location_cache[user_id] = location.name if location else None
        return location_cache[user_id]

    for row_index, row in enumerate(reader, start=2):
        extra_values = row.get(None)
        if extra_values and any(str(v).strip() for v in extra_values):
            raise HTTPException(
                status_code=400,
                detail=f"row {row_index}: unexpected extra columns",
            )
        normalized_row = {
            k.strip().lower(): _normalize_csv_value(v)
            for k, v in row.items()
            if k is not None
        }
        if not any(normalized_row.values()):
            continue

        try:
            asset_code = normalized_row.get("asset_code", "")
            if not asset_code:
                raise ValueError("asset_code required")
            if len(asset_code) > 10:
                raise ValueError("asset_code too long")
            if any(r.get("asset_code") == asset_code for r in prepared_rows):
                raise ValueError("duplicate asset_code in file")

            name = normalized_row.get("name", "")
            if not name:
                raise ValueError("name required")

            asset_type_raw = normalized_row.get("type", "").lower()
            if not asset_type_raw:
                raise ValueError("type required")
            try:
                asset_type = AssetType(asset_type_raw)
            except ValueError as err:
                raise ValueError("invalid type") from err

            model = normalized_row.get("model", "")
            if not model:
                raise ValueError("model required")

            specification = normalized_row.get("specification", "")
            if not specification:
                raise ValueError("specification required")

            vendor_name = normalized_row.get("vendor", "")
            if not vendor_name:
                raise ValueError("vendor required")
            vendor = (
                await db.scalars(
                    select(Vendor).where(Vendor.name == vendor_name)
                )
            ).first()
            if vendor is None:
                raise ValueError("vendor not found")

            purchase_date = _parse_csv_date(normalized_row.get("purchase_date", ""))
            activation_date = _parse_csv_date(normalized_row.get("activation_date", ""))
            warranty_expiry = _parse_csv_date(normalized_row.get("warranty_expiry", ""))

            purchase_price_raw = normalized_row.get("purchase_price", "")
            if not purchase_price_raw:
                raise ValueError("purchase_price required")
            try:
                purchase_price = int(purchase_price_raw)
            except ValueError as err:
                raise ValueError("invalid purchase_price") from err

            owner_id = user["user_id"]
            asset = (
                await db.scalars(
                    select(Asset).where(Asset.asset_code == asset_code)
                )
            ).first()

            action = "updated" if asset else "created"
            row_results[row_index] = AssetImportRowResult(
                row=row_index,
                asset_code=asset_code,
                action=action,
                success=True,
            )

            final_storage_location = None
            if action == "created":
                final_storage_location = await _get_location_name_for_user(owner_id)

            prepared_rows.append({
                "row": row_index,
                "asset_code": asset_code,
                "action": action,
                "asset": asset,
                "name": name,
                "type": asset_type,
                "model": model,
                "specification": specification,
                "vendor_id": vendor.id,
                "purchase_date": purchase_date,
                "purchase_price": purchase_price,
                "storage_location": final_storage_location,
                "owner_id": owner_id,
                "activation_date": activation_date,
                "warranty_expiry": warranty_expiry,
                "status": None,
                "owner_employee_id": None,
            })
        except StaleDataError:
            await db.rollback()
            row_results[row_index] = AssetImportRowResult(
                row=row_index,
                asset_code=normalized_row.get("asset_code") or None,
                action="updated",
                success=False,
                error="asset has been modified by another user",
            )
            has_error = True
        except IntegrityError:
            await db.rollback()
            row_results[row_index] = AssetImportRowResult(
                row=row_index,
                asset_code=normalized_row.get("asset_code") or None,
                action=None,
                success=False,
                error="integrity error",
            )
            has_error = True
        except Exception as exc:
            await db.rollback()
            row_results[row_index] = AssetImportRowResult(
                row=row_index,
                asset_code=normalized_row.get("asset_code") or None,
                action=None,
                success=False,
                error=str(exc),
            )
            has_error = True

    if not row_results:
        return AssetImportResponse(total=0, success_count=0, failure_count=0, results=[])

    if has_error:
        for result in row_results.values():
            if result.success:
                result.success = False
                result.error = "aborted due to validation errors"
        results = sorted(row_results.values(), key=lambda r: r.row)
        return AssetImportResponse(
            total=len(results),
            success_count=0,
            failure_count=len(results),
            results=results,
        )

    try:
        for row in prepared_rows:
            if row["action"] == "created":
                asset = Asset(
                    asset_code=row["asset_code"],
                    name=row["name"],
                    type=row["type"],
                    model=row["model"],
                    specification=row["specification"],
                    vendor_id=row["vendor_id"],
                    purchase_date=row["purchase_date"],
                    purchase_price=row["purchase_price"],
                    storage_location=row["storage_location"],
                    owner_id=row["owner_id"],
                    activation_date=row["activation_date"],
                    warranty_expiry=row["warranty_expiry"],
                    status=AssetStatus.AVAILABLE,
                )
                db.add(asset)
                await db.flush()
                await log_action(
                    db,
                    user_id=user["user_id"],
                    actor_name=user["name"],
                    action=Action.CREATE,
                    target_type=TargetType.ASSET,
                    target_id=asset.id,
                    target_name=f"{asset.name} ({asset.asset_code})",
                    detail={
                        "after": {
                            "asset_code": asset.asset_code,
                            "name": asset.name,
                            "type": asset.type.value,
                            "model": asset.model,
                            "specification": asset.specification,
                            "vendor": (await db.get(Vendor, asset.vendor_id)).name,
                            "purchase_date": str(asset.purchase_date),
                            "purchase_price": asset.purchase_price,
                            "storage_location": asset.storage_location,
                            "owner_employee_id": None,
                            "activation_date": str(asset.activation_date),
                            "warranty_expiry": str(asset.warranty_expiry),
                            "status": asset.status.value,
                        }
                    },
                )
            else:
                asset = row["asset"]
                before_data = await _asset_before_for_log(db, asset)
                asset.name = row["name"]
                asset.type = row["type"]
                asset.model = row["model"]
                asset.specification = row["specification"]
                asset.vendor_id = row["vendor_id"]
                asset.purchase_date = row["purchase_date"]
                asset.purchase_price = row["purchase_price"]
                asset.activation_date = row["activation_date"]
                asset.warranty_expiry = row["warranty_expiry"]

                after_data = {
                    "name": asset.name,
                    "type": asset.type.value,
                    "model": asset.model,
                    "specification": asset.specification,
                    "vendor": (await db.get(Vendor, asset.vendor_id)).name,
                    "purchase_date": str(asset.purchase_date),
                    "purchase_price": asset.purchase_price,
                    "storage_location": asset.storage_location,
                    "owner_employee_id": None,
                    "activation_date": str(asset.activation_date),
                    "warranty_expiry": str(asset.warranty_expiry),
                }

                await log_action(
                    db,
                    user_id=user["user_id"],
                    actor_name=user["name"],
                    action=Action.UPDATE,
                    target_type=TargetType.ASSET,
                    target_id=asset.id,
                    target_name=f"{asset.name} ({asset.asset_code})",
                    detail={"before": before_data, "after": after_data},
                )
        await db.commit()
    except (StaleDataError, IntegrityError) as exc:
        await db.rollback()
        error_msg = "asset has been modified by another user" if isinstance(exc, StaleDataError) else "integrity error"
        for result in row_results.values():
            result.success = False
            result.error = error_msg
        results = sorted(row_results.values(), key=lambda r: r.row)
        return AssetImportResponse(
            total=len(results),
            success_count=0,
            failure_count=len(results),
            results=results,
        )

    results = sorted(row_results.values(), key=lambda r: r.row)
    return AssetImportResponse(
        total=len(results),
        success_count=len(results),
        failure_count=0,
        results=results,
    )


@router.put("/assets/{asset_id}", response_model=AssetOut)
async def update_asset(
    asset_id: int,
    payload: AssetUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(admin_required),
) -> AssetOut:
    asset = await _get_asset_for_out(db, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")

    if asset.version != payload.version:
        raise HTTPException(
            status_code=409, 
            detail="該資產已被其他使用者修改，請重新整理後再試 (Asset has been modified by another user)"
        )

    before_data = _to_out(asset, _asset_owner(asset)).model_dump(mode="json")
    # 使用 model_fields_set 確保明確傳入 null 時能清除欄位
    update_data = payload.model_dump(exclude_unset=True, exclude={"version"})
    vendor_name = update_data.pop("vendor", None)
    if "vendor" in payload.model_fields_set:
        if vendor_name is None:
            raise HTTPException(status_code=400, detail="vendor required")
        vendor = (
            await db.scalars(
                select(Vendor).where(Vendor.name == vendor_name)
            )
        ).first()

        if vendor is None:
            raise HTTPException(status_code=400, detail="vendor not found")

        asset.vendor_id = vendor.id
    # 建立日誌專用的序列化數據
    after_data = payload.model_dump(exclude_unset=True, exclude={"version"}, mode="json")

    for field, value in update_data.items():
        setattr(asset, field, value)

    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.UPDATE,
        target_type=TargetType.ASSET,
        target_id=asset_id,
        target_name=f"{asset.name} ({asset.asset_code})",
        detail={"before": before_data, "after": after_data},
    )
    try:
        await db.commit()
    except StaleDataError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="該資產已被其他使用者修改，請重新整理後再試 (Asset has been modified by another user)",
        ) from None
    asset = await _get_asset_for_out(db, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    return _to_out(asset, _asset_owner(asset))


@router.post("/assets/{asset_id}/deactivate", response_model=AssetOut)
async def deactivate_asset(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(admin_required)) -> AssetOut:
    asset = await _get_asset_for_out(db, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    if asset.status == AssetStatus.DEACTIVATED:
        raise HTTPException(status_code=400, detail="資產已停用")

    before = _to_out(asset, _asset_owner(asset)).model_dump(mode="json")
    asset.status = AssetStatus.DEACTIVATED
    asset.owner_id = None
    asset.storage_location = None
    asset.version += 1

    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.UPDATE,
        target_type=TargetType.ASSET,
        target_id=asset_id,
        target_name=f"{asset.name} ({asset.asset_code})",
        detail={"before": before, "after": {"status": "deactivated", "owner_id": None}},
    )
    await db.commit()
    asset = await _get_asset_for_out(db, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    return _to_out(asset, _asset_owner(asset))


@router.post("/assets/{asset_id}/toggle-status", response_model=AssetOut)
async def toggle_asset_status(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(admin_required)) -> AssetOut:
    asset = await _get_asset_for_out(db, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    if asset.owner_id != user["user_id"]:
        raise HTTPException(status_code=403, detail="只能更改自己保管的資產狀態")

    if asset.status == AssetStatus.AVAILABLE:
        new_status = AssetStatus.IN_USE
    elif asset.status == AssetStatus.IN_USE:
        new_status = AssetStatus.AVAILABLE
    else:
        raise HTTPException(status_code=400, detail="只有閒置或使用中的資產可以切換狀態")

    before = _to_out(asset, _asset_owner(asset)).model_dump(mode="json")
    asset.status = new_status
    asset.version += 1

    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.UPDATE,
        target_type=TargetType.ASSET,
        target_id=asset_id,
        target_name=f"{asset.name} ({asset.asset_code})",
        detail={"before": before, "after": {"status": new_status.value}},
    )
    await db.commit()
    asset = await _get_asset_for_out(db, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    return _to_out(asset, _asset_owner(asset))


@router.post("/assets/{asset_id}/activate", response_model=AssetOut)
async def activate_asset(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(admin_required)) -> AssetOut:
    asset = await _get_asset_for_out(db, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    if asset.status != AssetStatus.DEACTIVATED:
        raise HTTPException(status_code=400, detail="只有已停用的資產可以重新啟用")

    admin_user = await db.get(User, user["user_id"])

    asset.owner_id = user["user_id"]
    asset.storage_location = admin_user.location.name if admin_user and admin_user.location else None
    asset.status = AssetStatus.AVAILABLE
    asset.version += 1

    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.UPDATE,
        target_type=TargetType.ASSET,
        target_id=asset_id,
        target_name=f"{asset.name} ({asset.asset_code})",
        detail={"after": {"status": "available", "owner_id": user["user_id"]}},
    )
    await db.commit()
    asset = await _get_asset_for_out(db, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    return _to_out(asset, _asset_owner(asset))


# ── 資產轉移 ──────────────────────────────────────────────

@router.post("/assets/{asset_id}/transfers", response_model=AssetTransferOut, status_code=201)
async def initiate_transfer(
    asset_id: int,
    payload: AssetTransferCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(admin_required),
) -> AssetTransferOut:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")

    to_user = await db.get(User, payload.to_owner_id)
    if to_user is None:
        raise HTTPException(status_code=404, detail="target user not found")

    if asset.owner_id == payload.to_owner_id:
        raise HTTPException(status_code=400, detail="新保管人與目前保管人相同")

    # 取消同一資產已有的 PENDING 轉移
    existing = (await db.scalars(
        select(AssetTransfer).where(
            AssetTransfer.asset_id == asset_id,
            AssetTransfer.status == "PENDING",
        )
    )).first()
    if existing:
        existing.status = "CANCELLED"

    from_owner = await db.get(User, asset.owner_id) if asset.owner_id else None

    transfer = AssetTransfer(
        asset_id=asset_id,
        initiator_id=user["user_id"],
        from_owner_id=asset.owner_id or user["user_id"],
        to_owner_id=payload.to_owner_id,
    )
    db.add(transfer)
    await db.flush()

    # Email 通知雙方
    asset_label = f"{asset.name}（{asset.asset_code}）"
    if from_owner:
        send_email(
            subject=f"【資產轉移通知】{asset_label} 待您確認",
            body=f"<p>您好 {from_owner.name}，</p><p>管理員發起了資產轉移申請，資產 <b>{asset_label}</b> 擬轉移給 <b>{to_user.name}</b>。</p><p>請登入系統確認此次轉移。</p>",
            receiver=from_owner.email,
        )
    send_email(
        subject=f"【資產轉移通知】{asset_label} 待您確認",
        body=f"<p>您好 {to_user.name}，</p><p>管理員申請將資產 <b>{asset_label}</b> 轉移給您。</p><p>請登入系統確認此次轉移。</p>",
        receiver=to_user.email,
    )

    await db.commit()
    transfer = await _get_transfer_for_out(db, transfer.id)
    if transfer is None:
        raise HTTPException(status_code=404, detail="transfer not found")
    return _transfer_to_out(transfer, transfer.asset, transfer.from_owner, transfer.to_owner)


@router.get("/transfers/pending", response_model=list[AssetTransferOut])
async def list_pending_transfers(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[AssetTransferOut]:
    my_id = user["user_id"]
    rows = (await db.scalars(
        select(AssetTransfer)
        .options(*TRANSFER_OUT_OPTIONS)
        .where(
            AssetTransfer.status == "PENDING",
            or_(AssetTransfer.from_owner_id == my_id, AssetTransfer.to_owner_id == my_id),
        ).order_by(AssetTransfer.created_at.desc())
    )).all()

    return [_transfer_to_out(t, t.asset, t.from_owner, t.to_owner) for t in rows]


@router.post("/transfers/{transfer_id}/confirm", response_model=AssetTransferOut)
async def confirm_transfer(
    transfer_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> AssetTransferOut:
    transfer = await _get_transfer_for_out(db, transfer_id)
    if transfer is None:
        raise HTTPException(status_code=404, detail="transfer not found")
    if transfer.status != "PENDING":
        raise HTTPException(status_code=400, detail="此轉移已結束")

    my_id = user["user_id"]
    if my_id == transfer.from_owner_id:
        transfer.from_confirmed = True
    elif my_id == transfer.to_owner_id:
        transfer.to_confirmed = True
    else:
        raise HTTPException(status_code=403, detail="Forbidden")

    # 雙方皆確認 → 完成轉移
    if transfer.from_confirmed and transfer.to_confirmed:
        asset = transfer.asset
        to_user = transfer.to_owner
        if asset:
            asset.owner_id = transfer.to_owner_id
            # 辦公地點跟隨新保管人
            if to_user:
                asset.storage_location = to_user.location.name if to_user.location else None
            # 維修中的資產不更動狀態，待維修結案後由工單流程設定
            if asset.status != AssetStatus.MAINTENANCE:
                is_admin_owner = to_user and to_user.role == Role.ADMIN
                asset.status = AssetStatus.AVAILABLE if is_admin_owner else AssetStatus.IN_USE
            asset.version += 1
        transfer.status = "COMPLETED"

    await db.commit()
    transfer = await _get_transfer_for_out(db, transfer_id)
    if transfer is None:
        raise HTTPException(status_code=404, detail="transfer not found")
    return _transfer_to_out(transfer, transfer.asset, transfer.from_owner, transfer.to_owner)


@router.delete("/transfers/{transfer_id}", status_code=204)
async def cancel_transfer(
    transfer_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(admin_required),
) -> None:
    transfer = await db.get(AssetTransfer, transfer_id)
    if transfer is None:
        raise HTTPException(status_code=404, detail="transfer not found")
    if transfer.status != "PENDING":
        raise HTTPException(status_code=400, detail="此轉移已結束")
    if transfer.initiator_id != user["user_id"]:
        raise HTTPException(status_code=403, detail="只有發起者可以撤銷此轉移")
    transfer.status = "CANCELLED"
    await db.commit()
