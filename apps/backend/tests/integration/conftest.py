import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)
from sqlalchemy.pool import StaticPool
from sqlalchemy import select

from app.core.db import get_db
from app.main import app
from app.models import Base, User, NotificationPreference, Department, AuditLog

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


class AutoIdAsyncSession:
    """Wrapper for AsyncSession that auto-assigns IDs for SQLite in-memory tests."""

    def __init__(self, session):
        self._session = session
        self.id_counters = {"Department": 1, "User": 3, "NotificationPreference": 2, "AuditLog": 1}
        self._pending_objects = []

    async def _assign_ids(self):
        """Assign IDs to new objects before flush/commit."""
        # Check both new objects and pending tracked objects
        all_objects = list(self._session.new) + self._pending_objects

        for obj in all_objects:
            if isinstance(obj, Department) and obj.id is None:
                obj.id = self.id_counters["Department"]
                self.id_counters["Department"] += 1
            if isinstance(obj, User) and obj.id is None:
                obj.id = self.id_counters["User"]
                self.id_counters["User"] += 1
            elif isinstance(obj, NotificationPreference) and obj.id is None:
                obj.id = self.id_counters["NotificationPreference"]
                self.id_counters["NotificationPreference"] += 1
            elif isinstance(obj, AuditLog) and obj.id is None:
                obj.id = self.id_counters["AuditLog"]
                self.id_counters["AuditLog"] += 1

        # Clear pending after assignment
        self._pending_objects.clear()

    async def flush(self):
        await self._assign_ids()
        return await self._session.flush()

    async def commit(self):
        await self._assign_ids()
        return await self._session.commit()

    async def refresh(self, obj):
        return await self._session.refresh(obj)

    async def rollback(self):
        self._pending_objects.clear()
        return await self._session.rollback()

    async def execute(self, stmt):
        return await self._session.execute(stmt)

    async def scalars(self, stmt):
        return await self._session.scalars(stmt)

    async def get(self, entity, ident):
        return await self._session.get(entity, ident)

    async def delete(self, obj):
        return await self._session.delete(obj)

    def add(self, obj):
        # Track objects being added for ID assignment
        if isinstance(obj, (Department, User, NotificationPreference, AuditLog)):
            self._pending_objects.append(obj)
        return self._session.add(obj)

    def add_all(self, objs):
        # Track objects being added for ID assignment
        for obj in objs:
            if isinstance(obj, (Department, User, NotificationPreference, AuditLog)):
                self._pending_objects.append(obj)
        return self._session.add_all(objs)

    @property
    def new(self):
        return self._session.new

    def __getattr__(self, name):
        return getattr(self._session, name)


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create and configure test database engine (session scope)."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def test_db_session(test_engine):
    """Create a fresh DB session for each test (function scope)."""
    TestSession = async_sessionmaker(
        bind=test_engine,
        expire_on_commit=False,
        class_=AsyncSession,
    )

    async with TestSession() as session:
        wrapped = AutoIdAsyncSession(session)
        yield wrapped


@pytest.fixture
def override_db(test_db_session):
    """Override the get_db dependency for tests."""

    async def _override_get_db():
        yield test_db_session

    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture
async def client(override_db):
    """Async HTTP client for testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
