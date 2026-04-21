from sqlalchemy import BigInteger, Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class RepairRequest(Base):
    __tablename__ = "repair_requests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    need_backup: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    backup_spec: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("OPEN", "IN_PROGRESS", "DONE", "CANCELLED", name="repair_request_status"),
        nullable=False,
        default="OPEN",
    )
    expected_completion_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    pickup_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    inspection: Mapped["RepairInspection | None"] = relationship(
        "RepairInspection", back_populates="request", uselist=False, cascade="all, delete-orphan"
    )
    record: Mapped["RepairRecord | None"] = relationship(
        "RepairRecord", back_populates="request", uselist=False, cascade="all, delete-orphan"
    )
    requester: Mapped["User"] = relationship("User", back_populates="repair_requests")
    target_asset: Mapped["Asset"] = relationship("Asset", back_populates="repair_requests")


class RepairInspection(Base):
    __tablename__ = "repair_inspections"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("repair_requests.id"), nullable=False, unique=True)

    status: Mapped[bool] = mapped_column(Boolean, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    checked_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    checked_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)

    request: Mapped["RepairRequest"] = relationship("RepairRequest", back_populates="inspection")
    checker: Mapped["User"] = relationship("User", back_populates="repair_inspections")


class RepairRecord(Base):
    __tablename__ = "repair_records"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("repair_requests.id"), nullable=False, unique=True)
    repair_date: Mapped[Date] = mapped_column(Date, nullable=False)
    issue_description: Mapped[str] = mapped_column(Text, nullable=False)
    solution: Mapped[str] = mapped_column(Text, nullable=False)
    cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vendor: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
    
    request: Mapped["RepairRequest"] = relationship("RepairRequest", back_populates="record")


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    attachable_type: Mapped[str] = mapped_column(
        Enum("REPAIR_REQUEST", "REPAIR_INSPECTION", "REPAIR_RECORD", name="attachment_attachable_type"),
        nullable=False,
    )
    attachable_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    file_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_type: Mapped[str] = mapped_column(
        Enum("IMAGE", "VIDEO", "DOCUMENT", "OTHER", name="attachment_file_type"),
        nullable=False,
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
