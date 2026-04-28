from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import BigInteger, JSON, String, DateTime, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class Action(PyEnum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


class TargetType(PyEnum):
    ASSET      = "ASSET"
    TICKET     = "TICKET"
    INSPECTION = "INSPECTION"
    RECORD     = "RECORD"
    ATTACHMENT = "ATTACHMENT"
    USER       = "USER"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    actor_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    action: Mapped[Action] = mapped_column(Enum(Action), nullable=False)
    target_type: Mapped[TargetType] = mapped_column(Enum(TargetType), nullable=False)
    target_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    target_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    user: Mapped["User"] = relationship(
        "User",
        back_populates="audit_logs",
    )
