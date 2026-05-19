import asyncio
import pytest

from types import SimpleNamespace
from app.core import db


class DummySession:
    def __init__(self):
        self.rolled_back = False

    async def rollback(self):
        self.rolled_back = True


class DummyCtx:
    def __init__(self, sess):
        self._sess = sess

    async def __aenter__(self):
        return self._sess

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.mark.asyncio
async def test_get_db_rolls_back_on_exception(monkeypatch):
    dummy = DummySession()
    # Make Session() return an async context manager that yields our dummy session
    monkeypatch.setattr(db, "Session", lambda: DummyCtx(dummy))

    agen = db.get_db()
    sess = await agen.__anext__()   # get yielded session
    assert sess is dummy

    with pytest.raises(Exception):
        await agen.athrow(Exception("boom"))  # throw into generator to trigger except

    assert dummy.rolled_back is True


@pytest.mark.asyncio
async def test_dispose_engines_calls_engine_dispose(monkeypatch):
    called = {"v": False}

    async def fake_dispose():
        called["v"] = True

    monkeypatch.setattr(db, "engine", SimpleNamespace(dispose=fake_dispose))

    await db.dispose_engines()
    assert called["v"] is True