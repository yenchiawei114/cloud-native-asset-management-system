from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
