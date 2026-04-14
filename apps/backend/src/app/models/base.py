from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """所有 model 共用的 SQLAlchemy declarative base。"""
