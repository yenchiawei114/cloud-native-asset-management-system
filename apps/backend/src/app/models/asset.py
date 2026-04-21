from datetime import datetime, date
from enum import Enum as PyEnum
from sqlalchemy import BigInteger, Integer, CHAR, String, DateTime, Date, Enum, ForeignKey, func
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


class Asset(Base):
    __tablename__ = "assets"

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
    activation_date: Mapped[date] = mapped_column(
        Date,
        nullable=False
    )
    warranty_expiry: Mapped[date] = mapped_column(
        Date,
        nullable=False
    )
    status: Mapped[AssetStatus] = mapped_column(Enum(AssetStatus), nullable=False, default=AssetStatus.AVAILABLE)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(), 
        nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    owner: Mapped["User"] = relationship("User", back_populates="assets")
    repair_requests: Mapped[list["RepairRequest"]] = relationship("RepairRequest", back_populates="target_asset")
