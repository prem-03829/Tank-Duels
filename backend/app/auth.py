from functools import wraps

import traceback

from flask import Blueprint, current_app, g, jsonify, request
from postgrest.exceptions import APIError as PostgrestAPIError
from supabase_auth.errors import AuthApiError

from app.logging_utils import redact_log_message
from app.supabase import get_auth_client, get_authenticated_client, get_supabase

auth_bp = Blueprint("auth", __name__)

_MAX_USERNAME_LENGTH = 50


def require_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        token = _extract_bearer_token()
        if token is None:
            return jsonify({"error": "Authentication required"}), 401

        try:
            user_response = get_supabase().auth.get_user(jwt=token)
        except Exception:
            return jsonify({"error": "Invalid or expired token"}), 401

        if user_response is None:
            return jsonify({"error": "Invalid or expired token"}), 401

        authenticated_user = _get_obj_field(user_response, "user")
        if authenticated_user is None:
            return jsonify({"error": "Invalid or expired token"}), 401

        g.user = authenticated_user
        return view(*args, **kwargs)

    return wrapper


@auth_bp.post("/api/auth/signup")
def signup():
    data = _read_json_body()
    if data is None:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    email = _require_string(data, "email")
    password = _require_string(data, "password", strip_value=False)
    username = _require_string(data, "username")

    if email is None:
        return jsonify({"error": "email is required"}), 400
    if password is None:
        return jsonify({"error": "password is required"}), 400
    if username is None:
        return jsonify({"error": "username is required"}), 400
    if len(username) > _MAX_USERNAME_LENGTH:
        return jsonify({"error": "username must be 50 characters or fewer"}), 400

    try:
        response = get_auth_client().auth.sign_up(
            {
                "email": email,
                "password": password,
                "options": {"data": {"username": username}},
            }
        )
    except AuthApiError as exc:
        return _auth_error_response(exc)

    user = _get_obj_field(response, "user")
    if user is None:
        return jsonify({"error": "Signup could not be completed"}), 500
    user_id = _get_obj_field(user, "id")

    session = _get_obj_field(response, "session")
    access_token = _get_obj_field(session, "access_token") if session is not None else None
    refresh_token = _get_obj_field(session, "refresh_token") if session is not None else None

    if access_token is None:
        return jsonify(
            {
                "user": {"id": user_id, "email": _get_obj_field(user, "email")},
                "profile_initialized": False,
                "message": "Account created. Profile initialization requires email confirmation.",
            }
        ), 201

    try:
        user_client = get_authenticated_client(access_token, refresh_token)
        user_client.table("player").insert(
            {"player_id": user_id, "username": username}
        ).execute()
    except PostgrestAPIError as exc:
        if _get_obj_field(exc, "code") == "23505":
            message = (_get_obj_field(exc, "message") or "").lower()
            if "username" in message:
                return jsonify({"error": "Username already taken"}), 409
            return jsonify({"error": "A player profile already exists for this account"}), 409
        current_app.logger.error(
            "Player profile initialization failed:\n%s",
            redact_log_message(traceback.format_exc()),
        )
        return jsonify(
            {
                "error": "The account was created, but the player profile could not be initialized. Please contact support."
            }
        ), 500
    except Exception:
        current_app.logger.error(
            "Player profile initialization failed unexpectedly:\n%s",
            redact_log_message(traceback.format_exc()),
        )
        return jsonify(
            {
                "error": "The account was created, but the player profile could not be initialized. Please contact support."
            }
        ), 500

    return jsonify(_auth_payload(user, session)), 201


@auth_bp.post("/api/auth/login")
def login():
    data = _read_json_body()
    if data is None:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    email = _require_string(data, "email")
    password = _require_string(data, "password", strip_value=False)
    if email is None or password is None:
        return jsonify({"error": "email and password are required"}), 400

    try:
        response = get_auth_client().auth.sign_in_with_password(
            {"email": email, "password": password}
        )
    except AuthApiError as exc:
        return _auth_error_response(exc)

    user = _get_obj_field(response, "user")
    if user is None:
        return jsonify({"error": "Login failed"}), 500
    session = _get_obj_field(response, "session")
    return jsonify(_auth_payload(user, session))


@auth_bp.get("/api/auth/me")
@require_auth
def me():
    user = g.user
    return jsonify(
        {"user": {"id": _get_obj_field(user, "id"), "email": _get_obj_field(user, "email")}}
    )


@auth_bp.post("/api/auth/logout")
def logout():
    try:
        get_auth_client().auth.sign_out(options={"scope": "global"})
    except Exception:
        pass
    return jsonify({"message": "Logged out successfully"})


def _read_json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def _require_string(data, name, strip_value=True):
    value = data.get(name)
    if value is None or not isinstance(value, str):
        return None
    if strip_value:
        value = value.strip()
    if not value:
        return None
    return value


def _extract_bearer_token():
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token if token else None


def _get_obj_field(obj, key):
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _auth_payload(user, session):
    payload = {"user": {}}
    if user is not None:
        payload["user"] = {
            "id": _get_obj_field(user, "id"),
            "email": _get_obj_field(user, "email"),
        }
    if session is not None:
        payload["session"] = {
            "access_token": _get_obj_field(session, "access_token"),
            "refresh_token": _get_obj_field(session, "refresh_token"),
        }
    return payload


def _auth_error_response(exc):
    code = getattr(exc, "code", None)
    message = (getattr(exc, "message", "") or "").lower()

    if code in {"over_email_send_rate_limit", "over_email_otp_rate_limit"}:
        return jsonify({"error": "Too many requests. Please try again later."}), 429
    if code == "invalid_credentials" or "invalid login credentials" in message:
        return jsonify({"error": "Invalid email or password"}), 401
    if code == "email_not_confirmed" or "not confirmed" in message:
        return jsonify({"error": "Email not confirmed"}), 401
    if code == "user_already_exists" or "already registered" in message:
        return jsonify({"error": "User already exists"}), 409
    return jsonify({"error": "Authentication failed"}), 400