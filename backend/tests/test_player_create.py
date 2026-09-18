"""Unit tests for public auth config and CREATE-ONLY player profile creation endpoint."""

import unittest
from unittest.mock import MagicMock, patch
from flask import Flask
from postgrest.exceptions import APIError as PostgrestAPIError

from app.auth import auth_bp
from app.player import player_bp


class TestAuthConfigAndPlayerCreate(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.register_blueprint(auth_bp)
        self.app.register_blueprint(player_bp)
        self.client = self.app.test_client()

    def test_get_auth_config_returns_only_public_keys(self):
        response = self.client.get("/api/auth/config")
        self.assertEqual(response.status_code, 200)
        data = response.json
        self.assertIn("supabase_url", data)
        self.assertIn("supabase_key", data)
        self.assertEqual(set(data.keys()), {"supabase_url", "supabase_key"})
        self.assertNotIn("service_role", str(data).lower())
        self.assertNotIn("secret", str(data).lower())

    def test_create_profile_requires_authentication(self):
        response = self.client.post("/api/player/me", json={"username": "TankCommander"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json.get("error"), "Authentication required")

    @patch("app.player.get_authenticated_client")
    @patch("app.auth.get_supabase")
    def test_create_profile_validates_username_required(self, mock_get_supabase, mock_get_auth_client):
        mock_get_supabase.return_value.auth.get_user.return_value = MagicMock(user={"id": "user-123"})
        response = self.client.post(
            "/api/player/me",
            headers={"Authorization": "Bearer mock-token"},
            json={"username": "  "},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.json.get("error", "").lower())

    @patch("app.player.get_authenticated_client")
    @patch("app.auth.get_supabase")
    def test_create_profile_success(self, mock_get_supabase, mock_get_auth_client):
        mock_get_supabase.return_value.auth.get_user.return_value = MagicMock(user={"id": "user-123"})
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        mock_client.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{
                "player_id": "user-123",
                "username": "TankCommander",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
            }]
        )
        mock_get_auth_client.return_value = mock_client

        response = self.client.post(
            "/api/player/me",
            headers={"Authorization": "Bearer mock-token"},
            json={"username": "TankCommander"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json.get("player", {}).get("username"), "TankCommander")

    @patch("app.player.get_authenticated_client")
    @patch("app.auth.get_supabase")
    def test_create_profile_rejects_existing_profile(self, mock_get_supabase, mock_get_auth_client):
        mock_get_supabase.return_value.auth.get_user.return_value = MagicMock(user={"id": "user-123"})
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{"player_id": "user-123", "username": "ExistingUser"}]
        )
        mock_get_auth_client.return_value = mock_client

        response = self.client.post(
            "/api/player/me",
            headers={"Authorization": "Bearer mock-token"},
            json={"username": "NewUsername"},
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("already exists", response.json.get("error", "").lower())

    @patch("app.player.get_authenticated_client")
    @patch("app.auth.get_supabase")
    def test_create_profile_duplicate_username(self, mock_get_supabase, mock_get_auth_client):
        mock_get_supabase.return_value.auth.get_user.return_value = MagicMock(user={"id": "user-123"})
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        mock_client.table.return_value.insert.return_value.execute.side_effect = PostgrestAPIError(
            {"code": "23505", "message": "duplicate key value violates unique constraint"}
        )
        mock_get_auth_client.return_value = mock_client

        response = self.client.post(
            "/api/player/me",
            headers={"Authorization": "Bearer mock-token"},
            json={"username": "TakenUsername"},
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("already taken", response.json.get("error", "").lower())


if __name__ == "__main__":
    unittest.main()
