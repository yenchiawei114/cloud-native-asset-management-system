from enum import Enum as PyEnum

from sqlalchemy import BigInteger, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class NoteType(PyEnum):
    EMAIL = "email"
    SLACK = "slack"
    TEAMS = "teams"



class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    type: Mapped[NoteType] = mapped_column(Enum(NoteType), nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)

    user: Mapped["User"] = relationship(
        "User", 
        back_populates="notification_preferences"
    )