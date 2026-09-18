"""Unit tests for player profile avatar support with regex preset matching."""

import unittest
from unittest.mock import MagicMock, patch
from flask import Flask

from app.auth import auth_bp
from app.player import player_bp


class TestPlayerAvatar(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.register_blueprint(auth_bp)
        self.app.register_blueprint(player_bp)
        self.client = self.app.test_client()

    @patch("app.player.get_authenticated_client")
    @patch("app.auth.get_supabase")
    def test_default_profile_returns_preset_tank_00(self, mock_get_supabase, mock_get_auth_client):
        mock_get_supabase.return_value.auth.get_user.return_value = MagicMock(user={"id": "user-123"})
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{
                "player_id": "user-123",
                "username": "TankCommander",
                "avatar_type": "preset",
                "avatar_value": "tank-00",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
            }]
        )
        mock_get_auth_client.return_value = mock_client

        response = self.client.get(
            "/api/player/me",
            headers={"Authorization": "Bearer mock-token"},
        )
        self.assertEqual(response.status_code, 200)
        player = response.json.get("player", {})
        self.assertEqual(player.get("avatar_type"), "preset")
        self.assertEqual(player.get("avatar_value"), "tank-00")

    @patch("app.player.get_authenticated_client")
    @patch("app.auth.get_supabase")
    def test_preset_updates_accepted_formats(self, mock_get_supabase, mock_get_auth_client):
        mock_get_supabase.return_value.auth.get_user.return_value = MagicMock(user={"id": "user-123"})
        mock_client = MagicMock()
        mock_get_auth_client.return_value = mock_client

        accepted_presets = ["tank-00", "tank-08", "tank-09", "tank-10", "tank-99"]

        for preset in accepted_presets:
            mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[{
                    "player_id": "user-123",
                    "username": "TankCommander",
                    "avatar_type": "preset",
                    "avatar_value": preset,
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-01T00:00:00Z",
                }]
            )
            response = self.client.patch(
                "/api/player/me",
                headers={"Authorization": "Bearer mock-token"},
                json={"avatar_type": "preset", "avatar_value": preset},
            )
            self.assertEqual(response.status_code, 200, f"Failed for preset {preset}")
            self.assertEqual(response.json.get("player", {}).get("avatar_value"), preset)

    @patch("app.player.get_authenticated_client")
    @patch("app.auth.get_supabase")
    def test_invalid_preset_formats_rejected(self, mock_get_supabase, mock_get_auth_client):
        mock_get_supabase.return_value.auth.get_user.return_value = MagicMock(user={"id": "user-123"})

        invalid_presets = [
            "tank-0",
            "tank-1",
            "tank-100",
            "tank-abc",
            "avatar-01",
            "tank-00.png",
            "tank-01/",
            "http://evil.com/tank-01",
            "",
        ]
        for invalid_preset in invalid_presets:
            response = self.client.patch(
                "/api/player/me",
                headers={"Authorization": "Bearer mock-token"},
                json={"avatar_type": "preset", "avatar_value": invalid_preset},
            )
            self.assertEqual(response.status_code, 400, f"Should reject {invalid_preset}")
            self.assertIn("error", response.json)

    @patch("app.player.get_authenticated_client")
    @patch("app.auth.get_supabase")
    def test_valid_custom_path_for_authenticated_user(self, mock_get_supabase, mock_get_auth_client):
        user_id = "user-123"
        mock_get_supabase.return_value.auth.get_user.return_value = MagicMock(user={"id": user_id})
        mock_client = MagicMock()
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{
                "player_id": user_id,
                "username": "TankCommander",
                "avatar_type": "custom",
                "avatar_value": f"{user_id}/avatar.webp",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
            }]
        )
        mock_get_auth_client.return_value = mock_client

        response = self.client.patch(
            "/api/player/me",
            headers={"Authorization": "Bearer mock-token"},
            json={"avatar_type": "custom", "avatar_value": f"{user_id}/avatar.webp"},
        )
        self.assertEqual(response.status_code, 200)
        player = response.json.get("player", {})
        self.assertEqual(player.get("avatar_type"), "custom")
        self.assertEqual(player.get("avatar_value"), f"{user_id}/avatar.webp")

    @patch("app.player.get_authenticated_client")
    @patch("app.auth.get_supabase")
    def test_custom_path_for_another_user_rejected(self, mock_get_supabase, mock_get_auth_client):
        mock_get_supabase.return_value.auth.get_user.return_value = MagicMock(user={"id": "user-123"})

        response = self.client.patch(
            "/api/player/me",
            headers={"Authorization": "Bearer mock-token"},
            json={"avatar_type": "custom", "avatar_value": "other-user-999/avatar.webp"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json)

    @patch("app.player.get_authenticated_client")
    @patch("app.auth.get_supabase")
    def test_arbitrary_url_rejected(self, mock_get_supabase, mock_get_auth_client):
        mock_get_supabase.return_value.auth.get_user.return_value = MagicMock(user={"id": "user-123"})

        arbitrary_urls = [
            "https://evil.com/avatar.png",
            "http://attacker.org/avatar.webp",
            "ftp://files/avatar.webp",
            "user-123/avatar.png",
            "user-123/other.webp",
        ]
        for url in arbitrary_urls:
            response = self.client.patch(
                "/api/player/me",
                headers={"Authorization": "Bearer mock-token"},
                json={"avatar_type": "custom", "avatar_value": url},
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn("error", response.json)

    @patch("app.player.get_authenticated_client")
    @patch("app.auth.get_supabase")
    def test_invalid_avatar_type_rejected(self, mock_get_supabase, mock_get_auth_client):
        mock_get_supabase.return_value.auth.get_user.return_value = MagicMock(user={"id": "user-123"})

        invalid_types = ["invalid", "url", "image", "default", 123, None]
        for itype in invalid_types:
            response = self.client.patch(
                "/api/player/me",
                headers={"Authorization": "Bearer mock-token"},
                json={"avatar_type": itype, "avatar_value": "tank-00"},
            )
            self.assertEqual(response.status_code, 400)
            self.assertIn("error", response.json)

    @patch("app.player.get_authenticated_client")
    @patch("app.auth.get_supabase")
    def test_existing_profile_patch_behavior_still_works(self, mock_get_supabase, mock_get_auth_client):
        mock_get_supabase.return_value.auth.get_user.return_value = MagicMock(user={"id": "user-123"})
        mock_client = MagicMock()
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{
                "player_id": "user-123",
                "username": "UpdatedName",
                "avatar_type": "preset",
                "avatar_value": "tank-00",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
            }]
        )
        mock_get_auth_client.return_value = mock_client

        response = self.client.patch(
            "/api/player/me",
            headers={"Authorization": "Bearer mock-token"},
            json={"username": "UpdatedName"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json.get("player", {}).get("username"), "UpdatedName")
        mock_client.table.return_value.update.assert_called_with({"username": "UpdatedName"})


if __name__ == "__main__":
    unittest.main()
