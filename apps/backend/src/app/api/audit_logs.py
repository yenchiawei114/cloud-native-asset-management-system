from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.db import get_db
from app.models.audit_log import Action, AuditLog, TargetType

router = APIRouter()
admin_required = require_role("ADMIN")


class AuditLogOut(BaseModel):
    id: int
    user_id: int
    actor_name: str | None
    action: str
    target_type: str
    target_id: int
    target_name: str | None
    timestamp: datetime
    detail: dict | None


class AuditLogListOut(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    page_size: int


def _to_out(row: AuditLog) -> AuditLogOut:
    return AuditLogOut(
        id=row.id,
        user_id=row.user_id,
        actor_name=row.actor_name,
        action=row.action.value,
        target_type=row.target_type.value,
        target_id=row.target_id,
        target_name=row.target_name,
        timestamp=row.timestamp,
        detail=row.detail,
    )


@router.get("/audit-logs", response_model=AuditLogListOut)
async def list_audit_logs(
    target_type: str | None = None,
    target_id: int | None = None,
    user_id: int | None = None,
    action: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _user=Depends(admin_required),
) -> AuditLogListOut:
    stmt = select(AuditLog)

    if target_type is not None:
        try:
            stmt = stmt.where(AuditLog.target_type == TargetType(target_type))
        except ValueError:
            raise HTTPException(status_code=422, detail=f"invalid target_type: {target_type}")
    if target_id is not None:
        stmt = stmt.where(AuditLog.target_id == target_id)
    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if action is not None:
        try:
            stmt = stmt.where(AuditLog.action == Action(action))
        except ValueError:
            raise HTTPException(status_code=422, detail=f"invalid action: {action}")
    if from_date is not None:
        stmt = stmt.where(AuditLog.timestamp >= datetime(from_date.year, from_date.month, from_date.day, tzinfo=timezone.utc))
    if to_date is not None:
        upper = datetime(to_date.year, to_date.month, to_date.day, tzinfo=timezone.utc) + timedelta(days=1)
        stmt = stmt.where(AuditLog.timestamp < upper)

    total = (await db.scalar(select(func.count()).select_from(stmt.subquery()))) or 0

    stmt = stmt.order_by(AuditLog.timestamp.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.scalars(stmt)).all()

    return AuditLogListOut(
        items=[_to_out(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
