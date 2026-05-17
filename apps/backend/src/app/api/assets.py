from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.db import get_db
from app.models import Asset
from app.models.asset import AssetType, AssetStatus
from app.models.audit_log import Action, TargetType
from app.models.user import User

from app.api.deps import require_role, get_current_user

admin_required = require_role("ADMIN")
router = APIRouter()

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
    # asset_code 為唯一鍵，不允許修改
    name: str | None = None
    type: AssetType | None = None
    model: str | None = None
    specification: str | None = None
    vendor: str | None = None
    purchase_date: date | None = None
    purchase_price: int | None = None
    storage_location: str | None = None
    owner_id: int | None = None
    activation_date: date | None = None
    warranty_expiry: date | None = None
    status: AssetStatus | None = None


class AssetOut(AssetCreate):
    id: int
    created_at: datetime
    version: int


def _to_out(asset: Asset) -> AssetOut:
    return AssetOut(
        id=asset.id,
        asset_code=asset.asset_code,
        name=asset.name,
        type=asset.type,
        model=asset.model,
        specification=asset.specification,
        vendor=asset.vendor,
        purchase_date=asset.purchase_date,
        purchase_price=asset.purchase_price,
        storage_location=asset.storage_location,
        owner_id=asset.owner_id,
        activation_date=asset.activation_date,
        warranty_expiry=asset.warranty_expiry,
        status=asset.status,
        created_at=asset.created_at,
        version=asset.version,
    )

@router.get("/assets", response_model=list[AssetOut])
async def list_assets(
    owner_employee_id: str | None = None,
    keyword: str | None = None,
    asset_type: AssetType | None = None,
    status: AssetStatus | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[AssetOut]:
    stmt = select(Asset).order_by(Asset.id.desc())

    is_admin = user.get("role") == "ADMIN"
    my_employee_id = user.get("employee_id")
    my_user_id = user.get("user_id")

    if not is_admin:
        # 一般用戶只能查自己的資產
        if owner_employee_id is not None and owner_employee_id != my_employee_id:
            raise HTTPException(status_code=403, detail="Forbidden: You can only query your own assets")
        stmt = stmt.where(Asset.owner_id == my_user_id)
    else:
        # 管理員可依 employee_id 篩選，查無此員工則回傳 404
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
    if keyword:
        stmt = stmt.where(
            or_(
                Asset.name.ilike(f"%{keyword}%"),
                Asset.asset_code.ilike(f"%{keyword}%"),
                Asset.model.ilike(f"%{keyword}%"),
                Asset.vendor.ilike(f"%{keyword}%"),
            )
        )

    rows = (await db.scalars(stmt)).all()
    return [_to_out(a) for a in rows]

@router.get("/assets/idle", response_model=list[AssetOut])
async def list_idle_assets(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[AssetOut]:
    # 所有人皆可查看閒置設備清單，以便進行後續的調撥或申請
    stmt = select(Asset).where(Asset.status == AssetStatus.AVAILABLE).order_by(Asset.id.desc())
    rows = (await db.scalars(stmt)).all()
    return [_to_out(a) for a in rows]


@router.get("/assets/{asset_id}", response_model=AssetOut)
async def get_asset(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)) -> AssetOut:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")

    # 權限判斷：ADMIN 可讀取所有資產，USER 只能讀取自己的資產
    if user.get("role") != "ADMIN" and asset.owner_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    return _to_out(asset)

@router.post("/assets", response_model=AssetOut, status_code=201)
async def create_asset(
    payload: AssetCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(admin_required),
) -> AssetOut:
    asset = Asset(**payload.model_dump())
    db.add(asset)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="該資產編號已存在 (Asset code already exists)")
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
    await db.refresh(asset)
    return _to_out(asset)

@router.put("/assets/{asset_id}", response_model=AssetOut)
async def update_asset(
    asset_id: int,
    payload: AssetUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(admin_required),
) -> AssetOut:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")

    if asset.version != payload.version:
        raise HTTPException(
            status_code=409, 
            detail="該資產已被其他使用者修改，請重新整理後再試 (Asset has been modified by another user)"
        )

    before_data = _to_out(asset).model_dump(mode="json")
    # 使用 model_fields_set 確保明確傳入 null 時能清除欄位
    update_data = payload.model_dump(exclude_unset=True, exclude={"version"})
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
            detail="該資產已被其他使用者修改，請重新整理後再試 (Asset has been modified by another user)"
        )
    await db.refresh(asset)
    return _to_out(asset)


@router.delete("/assets/{asset_id}", status_code=204)
async def delete_asset(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(admin_required)) -> None:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")

    before = _to_out(asset).model_dump(mode="json")
    target_name = f"{asset.name} ({asset.asset_code})"
    await db.delete(asset)
    await log_action(
        db,
        user_id=user["user_id"],
        actor_name=user["name"],
        action=Action.DELETE,
        target_type=TargetType.ASSET,
        target_id=asset_id,
        target_name=target_name,
        detail={"before": before},
    )
    await db.commit()
