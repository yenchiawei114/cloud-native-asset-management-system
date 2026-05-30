from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.main import app


@pytest.fixture(autouse=True)
def clean_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def mock_redis():
    with patch("app.api.ticket.redis") as mock:
        store = {}

        async def mock_get(key: str):
            return store.get(key)

        async def mock_setex(key: str, ttl: int, value: str):
            store[key] = value
            return True

        async def mock_delete(key: str):
            if key in store:
                del store[key]
            return 1

        mock.get = AsyncMock(side_effect=mock_get)
        mock.setex = AsyncMock(side_effect=mock_setex)
        mock.delete = AsyncMock(side_effect=mock_delete)
        yield mock


@pytest.mark.asyncio
async def test_ticket_draft_flow(mock_redis) -> None:
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": 42,
        "name": "Test User",
        "employee_id": "EMP042",
        "role": "EMPLOYEE"
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Try to get a non-existent draft
        resp = await client.get("/api/tickets/draft/100")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "draft not found"

        # Save a draft
        payload = {
            "description": "My screen is broken",
            "need_backup": True,
            "backup_spec": "MacBook Pro",
            "pickup_location": "Taipei Office"
        }
        resp = await client.post("/api/tickets/draft/100", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["asset_id"] == 100
        assert data["user_id"] == 42
        assert data["draft_data"] == payload

        # Get the saved draft
        resp = await client.get("/api/tickets/draft/100")
        assert resp.status_code == 200
        data = resp.json()
        assert data["asset_id"] == 100
        assert data["user_id"] == 42
        assert data["draft_data"] == payload

        # Delete the draft
        resp = await client.delete("/api/tickets/draft/100")
        assert resp.status_code == 204

        # Try to get it again, should be 404
        resp = await client.get("/api/tickets/draft/100")
        assert resp.status_code == 404
