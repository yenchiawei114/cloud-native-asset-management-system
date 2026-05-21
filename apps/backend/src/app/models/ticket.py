from sqlalchemy import Index, BigInteger, Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base
from app.models.asset import Asset
from app.models.user import User


class RepairRequest(Base):
    __tablename__ = "repair_requests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    need_backup: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    backup_spec: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("OPEN", "IN_PROGRESS", "DONE", "CANCELLED", "RETURNED", "WAITING_LOANER_RETURN", name="repair_request_status"),
        nullable=False,
        default="OPEN",
    )
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_completion_date: Mapped[Date | None] = mapped_column(Date, nullable=True)
    pickup_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    loaner_asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"), nullable=True)
    loaner_return_borrower_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    loaner_return_lender_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    inspection: Mapped["RepairInspection | None"] = relationship(
        "RepairInspection", back_populates="request", uselist=False, cascade="all, delete-orphan"
    )
    record: Mapped["RepairRecord | None"] = relationship(
        "RepairRecord", back_populates="request", uselist=False, cascade="all, delete-orphan"
    )
    requester: Mapped["User"] = relationship("User", back_populates="repair_requests")
    target_asset: Mapped["Asset"] = relationship("Asset", back_populates="repair_requests", foreign_keys=[asset_id])
    loaner_asset: Mapped["Asset | None"] = relationship("Asset", back_populates="loaner_requests", foreign_keys=[loaner_asset_id])


class RepairInspection(Base):
    __tablename__ = "repair_inspections"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("repair_requests.id"), nullable=False, unique=True)

    status: Mapped[bool] = mapped_column(Boolean, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    checked_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    checked_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)

    request: Mapped["RepairRequest"] = relationship("RepairRequest", back_populates="inspection")
    checker: Mapped["User"] = relationship("User", back_populates="repair_inspections")


class RepairRecord(Base):
    __tablename__ = "repair_records"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("repair_requests.id"), nullable=False, unique=True)
    repair_date: Mapped[Date] = mapped_column(Date, nullable=False)
    issue_description: Mapped[str] = mapped_column(Text, nullable=False)
    solution: Mapped[str] = mapped_column(Text, nullable=False)
    cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)

    request: Mapped["RepairRequest"] = relationship("RepairRequest", back_populates="record", foreign_keys=[request_id])
    vendor: Mapped["Vendor"] = relationship("Vendor", back_populates="repair_records", foreign_keys=[vendor_id])


class Attachment(Base):
    __tablename__ = "attachments"

    __table_args__ = (
        Index("ix_attachments_attachable_type_id", "attachable_type", "attachable_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    attachable_type: Mapped[str] = mapped_column(
        Enum("REPAIR_REQUEST", "REPAIR_INSPECTION", "REPAIR_RECORD", name="attachment_attachable_type"),
        nullable=False,
    )
    attachable_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    file_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_type: Mapped[str] = mapped_column(
        Enum("IMAGE", "VIDEO", "DOCUMENT", "OTHER", name="attachment_file_type"),
        nullable=False,
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
