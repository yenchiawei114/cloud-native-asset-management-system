from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import settings


class TestUnauthenticatedAccess:
    """Test 401 Unauthorized for endpoints requiring authentication."""

    async def test_create_asset_without_token(self, client):
        """POST /api/assets requires admin token."""
        response = await client.post("/api/assets", json={"name": "Test Asset", "asset_type": "equipment"})
        assert response.status_code == 401

    async def test_delete_asset_without_token(self, client):
        """POST /api/assets/{asset_id}/deactivate requires admin token."""
        response = await client.post("/api/assets/1/deactivate")
        assert response.status_code == 401

    async def test_list_assets_without_token(self, client):
        """GET /api/assets requires authentication."""
        response = await client.get("/api/assets")
        assert response.status_code == 401

    async def test_get_asset_without_token(self, client):
        """GET /api/assets/{asset_id} requires authentication."""
        response = await client.get("/api/assets/1")
        assert response.status_code == 401

    async def test_update_asset_without_token(self, client):
        """PATCH /api/assets/{asset_id} requires admin token."""
        response = await client.put("/api/assets/1", json={"name": "Updated"})
        assert response.status_code == 401

    async def test_create_ticket_without_token(self, client):
        """POST /api/tickets requires authentication."""
        response = await client.post("/api/tickets", json={"asset_id": 1, "issue_type": "maintenance"})
        assert response.status_code == 401

    async def test_delete_inspection_without_token(self, client):
        """DELETE /api/tickets/{ticket_id}/inspection requires admin token."""
        response = await client.delete("/api/tickets/1/inspection")
        assert response.status_code == 401


class TestForbiddenAccessControl:
    """Test 403 Forbidden when user lacks required role."""

    def _create_user_token(self, role: str = "EMPLOYEE") -> str:
        """Helper to create a token with specified role."""
        payload = {"sub": "testuser", "role": role, "exp": datetime.now(UTC) + timedelta(hours=1)}
        return jwt.encode(payload, settings.secret_key, algorithm="HS256")

    def _create_admin_token(self) -> str:
        """Helper to create an admin token."""
        return self._create_user_token(role="ADMIN")

    async def test_user_cannot_create_asset(self, client):
        """User (non-admin) cannot POST /api/assets."""
        headers = {"Authorization": f"Bearer {self._create_user_token()}"}
        response = await client.post("/api/assets", headers=headers, json={"name": "Test", "asset_type": "equipment"})
        assert response.status_code == 403

    async def test_user_cannot_delete_asset(self, client):
        """User (non-admin) cannot POST /api/assets/{asset_id}/deactivate."""
        headers = {"Authorization": f"Bearer {self._create_user_token()}"}
        response = await client.post("/api/assets/1/deactivate", headers=headers)
        assert response.status_code == 403

    async def test_user_cannot_update_asset(self, client):
        """User (non-admin) cannot PUT /api/assets/{asset_id}."""
        headers = {"Authorization": f"Bearer {self._create_user_token()}"}
        response = await client.put("/api/assets/1", headers=headers, json={"name": "Updated"})
        assert response.status_code == 403

    async def test_user_cannot_delete_inspection(self, client):
        """User (non-admin) cannot DELETE /api/tickets/{ticket_id}/inspection."""
        headers = {"Authorization": f"Bearer {self._create_user_token()}"}
        response = await client.delete("/api/tickets/1/inspection", headers=headers)
        assert response.status_code == 403

    async def test_user_can_list_assets(self, client):
        """User can read (GET) assets."""
        headers = {"Authorization": f"Bearer {self._create_user_token()}"}
        response = await client.get("/api/assets", headers=headers)
        # May return 200 or different status, but NOT 403
        assert response.status_code != 403

    async def test_user_can_create_ticket(self, client):
        """User can create tickets (may fail for other reasons, but not 403)."""
        headers = {"Authorization": f"Bearer {self._create_user_token()}"}
        response = await client.post(
            "/api/tickets", headers=headers, json={"asset_id": 1, "issue_type": "maintenance"}
        )
        # Check it's not forbidden (may fail for missing data, etc.)
        assert response.status_code != 403

    async def test_admin_can_create_asset(self, client):
        """Admin can POST /api/assets (may fail for other reasons, not 403)."""
        headers = {"Authorization": f"Bearer {self._create_admin_token()}"}
        response = await client.post("/api/assets", headers=headers, json={"name": "Test", "asset_type": "equipment"})
        # Should not be forbidden
        assert response.status_code != 403

    async def test_admin_can_delete_inspection(self, client):
        """Admin can DELETE /api/tickets/{ticket_id}/inspection."""
        headers = {"Authorization": f"Bearer {self._create_admin_token()}"}
        response = await client.delete("/api/tickets/1/inspection", headers=headers)
        # May fail (404, 400), but not forbidden
        assert response.status_code != 403
