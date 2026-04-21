from sqlalchemy import BigInteger, Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class RepairRequest(Base):
    __tablename__ = "repair_requests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    requester_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
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

    # phto url 現在只能放三個，但我在想是不是可以放更多
    photo_url1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_url2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_url3: Mapped[str | None] = mapped_column(String(255), nullable=True)

    inspection: Mapped["RepairInspection | None"] = relationship(
        "RepairInspection", back_populates="request", uselist=False, cascade="all, delete-orphan"
    )
    record: Mapped["RepairRecord | None"] = relationship(
        "RepairRecord", back_populates="request", uselist=False, cascade="all, delete-orphan"
    )


class RepairInspection(Base):
    __tablename__ = "repair_inspections"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("repair_requests.id"), nullable=False, unique=True)

    status: Mapped[bool] = mapped_column(Boolean, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    checked_by: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checked_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)

    photo_url1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_url2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_url3: Mapped[str | None] = mapped_column(String(255), nullable=True)

    request: Mapped["RepairRequest"] = relationship("RepairRequest", back_populates="inspection")


class RepairRecord(Base):
    __tablename__ = "repair_records"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("repair_requests.id"), nullable=False, unique=True)

    repair_date: Mapped[Date] = mapped_column(Date, nullable=False)
    issue_description: Mapped[str] = mapped_column(Text, nullable=False)
    solution: Mapped[str] = mapped_column(Text, nullable=False)
    cost: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vendor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)

    request: Mapped["RepairRequest"] = relationship("RepairRequest", back_populates="record")
