from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.db import get_db
from app.core.email import send_email
from app.models import Asset, AssetTransfer
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
    owner_name: str | None = None
    owner_employee_id: str | None = None


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


def _to_out(asset: Asset, owner: User | None = None) -> AssetOut:
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
        owner_name=owner.name if owner else None,
        owner_employee_id=owner.employee_id if owner else None,
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


@router.get("/assets", response_model=list[AssetOut])
async def list_assets(
    owner_employee_id: str | None = None,
    keyword: str | None = None,
    asset_code_q: str | None = None,
    name_q: str | None = None,
    model_q: str | None = None,
    spec_q: str | None = None,
    owner_q: str | None = None,
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
        if owner_employee_id is not None and owner_employee_id != my_employee_id:
            raise HTTPException(status_code=403, detail="Forbidden: You can only query your own assets")
        stmt = stmt.where(Asset.owner_id == my_user_id)
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

    # 舊版通用關鍵字搜尋（向下相容）
    if keyword:
        stmt = stmt.where(
            or_(
                Asset.name.ilike(f"%{keyword}%"),
                Asset.asset_code.ilike(f"%{keyword}%"),
                Asset.model.ilike(f"%{keyword}%"),
                Asset.vendor.ilike(f"%{keyword}%"),
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

    rows = (await db.scalars(stmt)).all()

    # 批次取得 owner 資訊
    owner_ids = {r.owner_id for r in rows if r.owner_id is not None}
    owner_map: dict[int, User] = {}
    if owner_ids:
        owners = (await db.scalars(select(User).where(User.id.in_(owner_ids)))).all()
        owner_map = {o.id: o for o in owners}

    # owner_q 在記憶體過濾（需要 owner 名稱 / 工號）
    result = [_to_out(r, owner_map.get(r.owner_id) if r.owner_id else None) for r in rows]
    if owner_q:
        q = owner_q.lower()
        result = [
            a for a in result
            if (a.owner_name and q in a.owner_name.lower())
            or (a.owner_employee_id and q in a.owner_employee_id.lower())
        ]
    return result


@router.get("/assets/idle", response_model=list[AssetOut])
async def list_idle_assets(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[AssetOut]:
    stmt = select(Asset).where(Asset.status == AssetStatus.AVAILABLE).order_by(Asset.id.desc())
    rows = (await db.scalars(stmt)).all()
    return [_to_out(r) for r in rows]


@router.get("/assets/{asset_id}", response_model=AssetOut)
async def get_asset(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)) -> AssetOut:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")

    if user.get("role") != "ADMIN" and asset.owner_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    owner = await db.get(User, asset.owner_id) if asset.owner_id else None
    return _to_out(asset, owner)


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
    owner = await db.get(User, asset.owner_id) if asset.owner_id else None
    return _to_out(asset, owner)


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
    owner = await db.get(User, asset.owner_id) if asset.owner_id else None
    return _to_out(asset, owner)


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
    await db.refresh(transfer)
    return _transfer_to_out(transfer, asset, from_owner, to_user)


@router.get("/transfers/pending", response_model=list[AssetTransferOut])
async def list_pending_transfers(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[AssetTransferOut]:
    my_id = user["user_id"]
    rows = (await db.scalars(
        select(AssetTransfer).where(
            AssetTransfer.status == "PENDING",
            or_(AssetTransfer.from_owner_id == my_id, AssetTransfer.to_owner_id == my_id),
        ).order_by(AssetTransfer.created_at.desc())
    )).all()

    result = []
    for t in rows:
        asset = await db.get(Asset, t.asset_id)
        from_owner = await db.get(User, t.from_owner_id)
        to_owner = await db.get(User, t.to_owner_id)
        result.append(_transfer_to_out(t, asset, from_owner, to_owner))
    return result


@router.post("/transfers/{transfer_id}/confirm", response_model=AssetTransferOut)
async def confirm_transfer(
    transfer_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> AssetTransferOut:
    transfer = await db.get(AssetTransfer, transfer_id)
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
        asset = await db.get(Asset, transfer.asset_id)
        if asset:
            asset.owner_id = transfer.to_owner_id
            asset.status = AssetStatus.IN_USE
            asset.version += 1
        transfer.status = "COMPLETED"

    await db.commit()
    await db.refresh(transfer)
    asset = await db.get(Asset, transfer.asset_id)
    from_owner = await db.get(User, transfer.from_owner_id)
    to_owner = await db.get(User, transfer.to_owner_id)
    return _transfer_to_out(transfer, asset, from_owner, to_owner)


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
