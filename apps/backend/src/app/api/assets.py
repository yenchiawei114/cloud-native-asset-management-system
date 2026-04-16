"""Asset CRUD 端點，作為新功能開發的參考範例。

此處展示的模式：
- 使用 `Depends(get_db)` 取得預設 DB session。
- 透過 `storage.upload / delete / get_url` 處理 blob，不綁定特定後端。
- 以 UUID 作為 storage key 前綴 → 即使檔名相同，上傳也不會衝突，
  `path` 欄位無須應用層加鎖即可保持唯一。
"""

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.storage import storage
from app.models import Asset

from app.api.deps import require_role, get_current_user
admin_required = require_role("ADMIN")


router = APIRouter()


class AssetOut(BaseModel):
    id: int
    name: str
    path: str
    content_type: str | None
    size_bytes: int
    url: str
    created_at: datetime
    updated_at: datetime


def _to_out(asset: Asset) -> AssetOut:
    return AssetOut(
        id=asset.id,
        name=asset.name,
        path=asset.path,
        content_type=asset.content_type,
        size_bytes=asset.size_bytes,
        url=storage.get_url(asset.path),
        created_at=asset.created_at,
        updated_at=asset.updated_at,
    )


@router.get("/assets", response_model=list[AssetOut])
async def list_assets(db: AsyncSession = Depends(get_db), user=Depends(admin_required),) -> list[AssetOut]:
    rows = (await db.scalars(select(Asset).order_by(Asset.id.desc()))).all()
    return [_to_out(a) for a in rows]


@router.get("/assets/{asset_id}", response_model=AssetOut)
async def get_asset(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user),) -> AssetOut:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")

    # 權限判斷：ADMIN 可讀取所有資產，USER 只能讀取自己的資產
    if user.get("role") != "ADMIN" and asset.owner_id != user.get("id"):
        raise HTTPException(status_code=403, detail="Forbidden")

    return _to_out(asset)


@router.post("/assets", response_model=AssetOut, status_code=201)
async def create_asset(
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    user=Depends(admin_required),
) -> AssetOut:
    data = await file.read()
    display_name = name or file.filename or "unnamed"
    key = f"assets/{uuid4().hex}/{display_name}"

    await storage.upload(key, data)
    try:
        asset = Asset(
            name=display_name,
            path=key,
            content_type=file.content_type,
            size_bytes=len(data),
        )
        db.add(asset)
        await db.commit()
        await db.refresh(asset)
    except Exception:
        # DB 寫入失敗 → 剛上傳的檔案變成孤兒，須刪除避免殘留。
        await storage.delete(key)
        raise

    return _to_out(asset)


@router.delete("/assets/{asset_id}", status_code=204)
async def delete_asset(asset_id: int, db: AsyncSession = Depends(get_db), user=Depends(admin_required),) -> None:
    asset = await db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="asset not found")
    await storage.delete(asset.path)
    await db.delete(asset)
    await db.commit()
