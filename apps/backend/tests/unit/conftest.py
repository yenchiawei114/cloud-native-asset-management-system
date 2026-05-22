"""Shared fixtures for unit tests."""

import pytest
from fastapi.testclient import TestClient

from app.core.db import get_db
from app.main import app


class FakeResult:
    """Mock result from execute() query."""

    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class FakeScalarResult:
    """Mock result from scalars() query."""

    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


@pytest.fixture
def client(fake_db_session):
    """FastAPI TestClient with overridden get_db dependency."""

    async def override_get_db():
        yield fake_db_session

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
