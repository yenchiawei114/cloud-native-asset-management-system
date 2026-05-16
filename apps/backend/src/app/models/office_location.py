from sqlalchemy import BigInteger, String
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class OfficeLocation(Base):
    __tablename__ = "office_locations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
