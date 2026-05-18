from sqlalchemy import Integer, String, BigInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base



class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)

    users: Mapped[list["User"]] = relationship(
        "User", 
        back_populates="department"
    )