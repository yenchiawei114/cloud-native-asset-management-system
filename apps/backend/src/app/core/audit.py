from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import Action, AuditLog, TargetType


async def log_action(
    db: AsyncSession,
    user_id: int,
    actor_name: str,
    action: Action,
    target_type: TargetType,
    target_id: int,
    target_name: str | None = None,
    detail: dict | None = None,
) -> None:
    db.add(AuditLog(
        user_id=user_id,
        actor_name=actor_name,
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_name=target_name,
        detail=detail,
    ))
    # 不在此處 commit，由呼叫方統一 commit，確保原子性
