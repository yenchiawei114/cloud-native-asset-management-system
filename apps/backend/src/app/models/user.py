from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import BigInteger, Integer, CHAR, String, DateTime, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class Sex(PyEnum):
    MALE = "M"
    FEMALE = "F"


class Role(PyEnum):
    EMPLOYEE = "employee"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    employee_id: Mapped[str] = mapped_column(CHAR(9), unique=True, nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sex: Mapped[Sex] = mapped_column(Enum(Sex), name='sex',
        nullable=False,
        default=Sex.MALE
    )
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role), name='role',
        nullable=False
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(), 
        nullable=False
    )

    department: Mapped["Department"] = relationship(
        "Department", 
        back_populates="users"
    )
    assets: Mapped[list["Asset"]] = relationship(
        "Asset", 
        back_populates="owner"
    )
    notification_preferences: Mapped[list["NotificationPreference"]] = relationship(
        "NotificationPreference", 
        back_populates="user"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog",
        back_populates="user"
    )
    repair_inspections: Mapped[list["RepairInspection"]] = relationship(
        "RepairInspection",
        back_populates="checker"
    )
    repair_requests: Mapped[list["RepairRequest"]] = relationship(
        "RepairRequest",
        back_populates="requester"
    )