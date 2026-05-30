from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.vendor import Vendor

router = APIRouter()


class VendorOut(BaseModel):
    id: int
    name: str


@router.get("/vendors", response_model=list[VendorOut])
async def list_vendors(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> list[VendorOut]:
    rows = (await db.scalars(select(Vendor).order_by(Vendor.name))).all()
    return [VendorOut(id=r.id, name=r.name) for r in rows]
