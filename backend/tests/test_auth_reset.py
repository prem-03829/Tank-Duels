"""Unit tests for forgot-password and reset-password authentication endpoints."""

import unittest
from unittest.mock import MagicMock, patch
from flask import Flask
from supabase_auth.errors import AuthApiError

from app.auth import auth_bp


class TestAuthReset(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.register_blueprint(auth_bp)
        self.client = self.app.test_client()

    @patch("app.auth.get_auth_client")
    def test_forgot_password_valid_redirect_url_local(self, mock_get_auth_client):
        mock_auth = MagicMock()
        mock_get_auth_client.return_value.auth = mock_auth

        response = self.client.post(
            "/api/auth/forgot-password",
            json={
                "email": "user@example.com",
                "redirect_to": "http://127.0.0.1:5500/pages/reset-password.html",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json.get("message"),
            "If an account exists for this email, a password reset link has been sent.",
        )
        mock_auth.reset_password_for_email.assert_called_once_with(
            "user@example.com",
            options={"redirect_to": "http://127.0.0.1:5500/pages/reset-password.html"},
        )

    @patch("app.auth.get_auth_client")
    def test_forgot_password_valid_redirect_url_production(self, mock_get_auth_client):
        mock_auth = MagicMock()
        mock_get_auth_client.return_value.auth = mock_auth

        response = self.client.post(
            "/api/auth/forgot-password",
            json={
                "email": "user@example.com",
                "redirect_to": "https://tank-duels-flax.vercel.app/pages/reset-password.html",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json.get("message"),
            "If an account exists for this email, a password reset link has been sent.",
        )

    def test_forgot_password_invalid_redirect_url_rejection(self):
        response = self.client.post(
            "/api/auth/forgot-password",
            json={
                "email": "user@example.com",
                "redirect_to": "https://evil.com/reset-password.html",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json.get("error"), "Invalid redirect URL")

    @patch("app.auth.get_auth_client")
    def test_forgot_password_generic_response_on_supabase_exception(self, mock_get_auth_client):
        mock_auth = MagicMock()
        mock_auth.reset_password_for_email.side_effect = Exception("User not found")
        mock_get_auth_client.return_value.auth = mock_auth

        response = self.client.post(
            "/api/auth/forgot-password",
            json={"email": "nonexistent@example.com"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json.get("message"),
            "If an account exists for this email, a password reset link has been sent.",
        )

    def test_reset_password_requires_authentication(self):
        response = self.client.post(
            "/api/auth/reset-password",
            json={"password": "newpassword123"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json.get("error"), "Authentication required")

    def test_reset_password_validates_password_length(self):
        response = self.client.post(
            "/api/auth/reset-password",
            headers={"Authorization": "Bearer mock-recovery-token"},
            json={"password": "123"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json.get("error"), "Password must be at least 6 characters")

    @patch("app.auth.get_authenticated_client")
    def test_reset_password_success(self, mock_get_auth_client):
        mock_client = MagicMock()
        mock_client.auth.update_user.return_value = MagicMock(user={"id": "user-123"})
        mock_get_auth_client.return_value = mock_client

        response = self.client.post(
            "/api/auth/reset-password",
            headers={"Authorization": "Bearer valid-recovery-token"},
            json={"password": "newpassword123"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json.get("message"), "Password updated successfully")
        mock_client.auth.update_user.assert_called_once_with({"password": "newpassword123"})

    @patch("app.auth.get_authenticated_client")
    def test_reset_password_invalid_or_expired_token(self, mock_get_auth_client):
        mock_client = MagicMock()
        mock_client.auth.update_user.side_effect = Exception("Invalid session token")
        mock_get_auth_client.return_value = mock_client

        response = self.client.post(
            "/api/auth/reset-password",
            headers={"Authorization": "Bearer expired-token"},
            json={"password": "newpassword123"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("invalid or expired", response.json.get("error", "").lower())


if __name__ == "__main__":
    unittest.main()
