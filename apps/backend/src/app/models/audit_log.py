from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import BigInteger, Text, DateTime, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class Action(PyEnum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class TargetType(PyEnum):
    ASSET = "assets"
    RepairRequest = "repair_requests"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[Action] = mapped_column(Enum(Action), nullable=False)
    target_type: Mapped[TargetType] = mapped_column(Enum(TargetType), nullable=False)
    target_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    detail: Mapped[str | None] = mapped_column(Text)

    user: Mapped["User"] = relationship(
        "User",
        back_populates="audit_logs"
    )
