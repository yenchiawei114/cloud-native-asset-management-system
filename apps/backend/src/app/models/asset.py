from datetime import datetime, date
from enum import Enum as PyEnum
from sqlalchemy import Index, BigInteger, Boolean, Integer, CHAR, String, DateTime, Date, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base


class AssetType(PyEnum):
    LAPTOP = "laptop"
    DESKTOP = "desktop"
    PHONE = "phone"
    TABLET = "tablet"
    SERVER = "server"
    NETWORK = "network"
    OTHER = "other"


class AssetStatus(PyEnum):
    IN_USE = "in_use"              # 使用中
    MAINTENANCE = "maintenance"    # 維修中
    BORROWED = "borrowed"          # 已借出
    AVAILABLE = "available"        # 閒置可調撥
    DEACTIVATED = "deactivated"    # 已停用


class Asset(Base):
    __tablename__ = "assets"

    __table_args__ = (
        Index("ix_assets_status_id", "status", "id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asset_code: Mapped[str] = mapped_column(CHAR(10), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[AssetType] = mapped_column(Enum(AssetType), nullable=False)
    model: Mapped[str] = mapped_column(String(255), nullable=False)
    specification: Mapped[str] = mapped_column(String(255), nullable=False)
    vendor: Mapped[str] = mapped_column(String(100), nullable=False)
    purchase_date: Mapped[date] = mapped_column(
        Date,
        nullable=False
    )
    purchase_price: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_location: Mapped[str | None] = mapped_column(String(255))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    borrower_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    activation_date: Mapped[date] = mapped_column(
        Date,
        nullable=False
    )
    warranty_expiry: Mapped[date] = mapped_column(
        Date,
        nullable=False
    )
    status: Mapped[AssetStatus] = mapped_column(Enum(AssetStatus, values_callable=lambda x: [e.value for e in x]), nullable=False, default=AssetStatus.AVAILABLE)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    __mapper_args__ = {
        "version_id_col": version
    }

    owner: Mapped["User"] = relationship("User", back_populates="assets", foreign_keys=[owner_id])
    repair_requests: Mapped[list["RepairRequest"]] = relationship("RepairRequest", back_populates="target_asset", foreign_keys="RepairRequest.asset_id")
    transfers: Mapped[list["AssetTransfer"]] = relationship("AssetTransfer", back_populates="asset", foreign_keys="AssetTransfer.asset_id")


class AssetTransferStatus(PyEnum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class AssetTransfer(Base):
    __tablename__ = "asset_transfers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    initiator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    from_owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    to_owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("PENDING", "COMPLETED", "CANCELLED", name="asset_transfer_status"),
        nullable=False,
        default="PENDING",
    )
    from_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    to_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_offboarding_transfer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    asset: Mapped["Asset"] = relationship("Asset", back_populates="transfers", foreign_keys=[asset_id])
    initiator: Mapped["User"] = relationship("User", foreign_keys=[initiator_id])
    from_owner: Mapped["User"] = relationship("User", foreign_keys=[from_owner_id])
    to_owner: Mapped["User"] = relationship("User", foreign_keys=[to_owner_id])
