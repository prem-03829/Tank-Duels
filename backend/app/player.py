import traceback

from flask import Blueprint, current_app, g, jsonify, request
from postgrest.exceptions import APIError as PostgrestAPIError

from app.auth import (
    _extract_bearer_token,
    _get_obj_field,
    _read_json_body,
    require_auth,
)
from app.logging_utils import redact_log_message
from app.supabase import get_authenticated_client

player_bp = Blueprint("player", __name__)

_MAX_USERNAME_LENGTH = 50
_PLAYER_COLUMNS = "player_id,username,created_at,updated_at"
_STATISTICS_COLUMNS = "player_id,battles_played,battles_won,battles_lost,total_damage,updated_at"
_INTERNAL_ERROR = {"error": "Internal server error"}


@player_bp.get("/api/player/me")
@require_auth
def get_profile():
    user_id = _get_obj_field(g.user, "id")
    token = _extract_bearer_token()

    try:
        response = (
            get_authenticated_client(token)
            .table("player")
            .select(_PLAYER_COLUMNS)
            .eq("player_id", user_id)
            .execute()
        )
    except PostgrestAPIError:
        _log_redacted("Player profile fetch failed")
        return jsonify(_INTERNAL_ERROR), 500
    except Exception:
        _log_redacted("Player profile fetch failed unexpectedly")
        return jsonify(_INTERNAL_ERROR), 500

    rows = getattr(response, "data", None) or []
    if not rows:
        return jsonify({"error": "Player profile not found"}), 404

    return jsonify({"player": _player_payload(rows[0])}), 200


@player_bp.post("/api/player/me")
@require_auth
def create_profile():
    data = _read_json_body()
    if data is None:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    username = data.get("username")
    if username is None or not isinstance(username, str):
        return jsonify({"error": "username is required"}), 400
    username = username.strip()
    if not username:
        return jsonify({"error": "username must not be empty"}), 400
    if len(username) > _MAX_USERNAME_LENGTH:
        return jsonify({"error": "username must be 50 characters or fewer"}), 400

    user_id = _get_obj_field(g.user, "id")
    token = _extract_bearer_token()

    user_client = get_authenticated_client(token)

    try:
        existing = (
            user_client.table("player")
            .select(_PLAYER_COLUMNS)
            .eq("player_id", user_id)
            .execute()
        )
        existing_rows = getattr(existing, "data", None) or []
        if existing_rows:
            return jsonify({"error": "Player profile already exists"}), 409
    except Exception:
        pass

    try:
        result = (
            user_client.table("player")
            .insert({"player_id": user_id, "username": username})
            .execute()
        )
    except PostgrestAPIError as exc:
        if _get_obj_field(exc, "code") == "23505":
            return jsonify({"error": "Username already taken"}), 409
        _log_redacted("Player profile creation failed")
        return jsonify(_INTERNAL_ERROR), 500
    except Exception:
        _log_redacted("Player profile creation failed unexpectedly")
        return jsonify(_INTERNAL_ERROR), 500

    rows = getattr(result, "data", None) or []
    if not rows:
        return jsonify({"error": "Could not create profile"}), 500

    return jsonify({"player": _player_payload(rows[0])}), 201


@player_bp.patch("/api/player/me")
@require_auth
def update_profile():
    data = _read_json_body()
    if data is None:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    username = data.get("username")
    if username is None or not isinstance(username, str):
        return jsonify({"error": "username is required"}), 400
    if not username.strip():
        return jsonify({"error": "username must not be empty"}), 400
    if len(username) > _MAX_USERNAME_LENGTH:
        return jsonify({"error": "username must be 50 characters or fewer"}), 400

    user_id = _get_obj_field(g.user, "id")
    token = _extract_bearer_token()

    try:
        result = (
            get_authenticated_client(token)
            .table("player")
            .update({"username": username})
            .eq("player_id", user_id)
            .execute()
        )
    except PostgrestAPIError as exc:
        if _get_obj_field(exc, "code") == "23505":
            return jsonify({"error": "Username already taken"}), 409
        _log_redacted("Player profile update failed")
        return jsonify(_INTERNAL_ERROR), 500
    except Exception:
        _log_redacted("Player profile update failed unexpectedly")
        return jsonify(_INTERNAL_ERROR), 500

    rows = getattr(result, "data", None) or []
    if not rows:
        return jsonify({"error": "Player profile not found"}), 404

    return jsonify({"player": _player_payload(rows[0])}), 200


@player_bp.get("/api/player/stats")
@require_auth
def get_statistics():
    user_id = _get_obj_field(g.user, "id")
    token = _extract_bearer_token()

    try:
        response = (
            get_authenticated_client(token)
            .table("player_statistics")
            .select(_STATISTICS_COLUMNS)
            .eq("player_id", user_id)
            .execute()
        )
    except PostgrestAPIError:
        _log_redacted("Player statistics fetch failed")
        return jsonify(_INTERNAL_ERROR), 500
    except Exception:
        _log_redacted("Player statistics fetch failed unexpectedly")
        return jsonify(_INTERNAL_ERROR), 500

    rows = getattr(response, "data", None) or []
    if not rows:
        return jsonify({"error": "Player statistics not found"}), 404

    return jsonify({"statistics": _statistics_payload(rows[0])}), 200


def _player_payload(row):
    return {
        "player_id": _get_obj_field(row, "player_id"),
        "username": _get_obj_field(row, "username"),
        "created_at": _get_obj_field(row, "created_at"),
        "updated_at": _get_obj_field(row, "updated_at"),
    }


def _statistics_payload(row):
    return {
        "player_id": _get_obj_field(row, "player_id"),
        "battles_played": _get_obj_field(row, "battles_played"),
        "battles_won": _get_obj_field(row, "battles_won"),
        "battles_lost": _get_obj_field(row, "battles_lost"),
        "total_damage": _get_obj_field(row, "total_damage"),
        "updated_at": _get_obj_field(row, "updated_at"),
    }


def _log_redacted(context):
    current_app.logger.error(
        "%s:\n%s",
        context,
        redact_log_message(traceback.format_exc()),
    )
