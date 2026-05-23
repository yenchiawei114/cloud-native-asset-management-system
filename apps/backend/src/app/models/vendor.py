from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)

    assets: Mapped[list["Asset"]] = relationship("Asset", back_populates="vendor", foreign_keys="Asset.vendor_id")
    repair_records: Mapped[list["RepairRecord"]] = relationship("RepairRecord", back_populates="vendor", foreign_keys="RepairRecord.vendor_id")
