from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Asset
from app.models.asset import AssetType, AssetStatus

from app.api.deps import require_role, get_current_user

admin_required = require_role("admin")
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
async def list_assets(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)) -> list[AssetOut]:
    rows = (await db.scalars(select(Asset).order_by(Asset.id.desc()))).all()
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
        await db.commit()
        await db.refresh(asset)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="該資產編號已存在 (Asset code already exists)")
    return _to_out(asset)

@router.delete("/assets/{asset_id}", status_code=204)
async def delete_asset(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(admin_required)) -> None:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    
    await db.delete(asset)
    await db.commit()
