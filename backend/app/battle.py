import traceback
import uuid

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

battle_bp = Blueprint("battle", __name__)

_VALID_GAME_MODES = {"LOCAL", "LAN", "ONLINE"}
_INTERNAL_ERROR = {"error": "Internal server error"}
_INITIAL_HEALTH = 100
_BATTLE_FIELDS = [
    "battle_id",
    "player1_id",
    "player2_id",
    "winner_player_id",
    "defeated_player_id",
    "current_turn",
    "game_mode",
    "status",
    "battle_state",
    "created_at",
    "started_at",
    "ended_at",
]
_BATTLE_COLUMNS = ",".join(_BATTLE_FIELDS)
_TURN_CHECK_COLUMNS = "battle_id,player1_id,player2_id,current_turn,status"
_TURN_FORBIDDEN_FIELDS = frozenset(
    {
        "player_id",
        "current_turn",
        "battle_state",
        "status",
        "winner_player_id",
        "defeated_player_id",
    }
)


@battle_bp.post("/api/battles")
@require_auth
def create_battle():
    data = _read_json_body()
    if data is None:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    if "player1_id" in data:
        return jsonify({"error": "player1_id must not be supplied by the client"}), 400

    player2_id = data.get("player2_id")
    if player2_id is None or not isinstance(player2_id, str) or not player2_id.strip():
        return jsonify({"error": "player2_id is required"}), 400
    player2_uuid = _parse_uuid(player2_id.strip())
    if player2_uuid is None:
        return jsonify({"error": "player2_id must be a valid UUID"}), 400

    game_mode = data.get("game_mode")
    if game_mode is None or not isinstance(game_mode, str):
        return jsonify({"error": "game_mode is required"}), 400
    if game_mode not in _VALID_GAME_MODES:
        return jsonify({"error": "unsupported game_mode"}), 400

    user_id = _get_obj_field(g.user, "id")
    user_uuid = _parse_uuid(user_id)
    if user_uuid is not None and user_uuid == player2_uuid:
        return jsonify({"error": "player2_id must be different from the authenticated player"}), 400

    token = _extract_bearer_token()

    try:
        result = (
            get_authenticated_client(token)
            .table("battle")
            .insert(
                {
                    "player1_id": str(user_id),
                    "player2_id": str(player2_uuid),
                    "game_mode": game_mode,
                    "status": "IN_PROGRESS",
                    "current_turn": str(user_id),
                    "battle_state": build_initial_battle_state(
                        str(user_id), str(player2_uuid)
                    ),
                }
            )
            .execute()
        )
    except PostgrestAPIError as exc:
        if _get_obj_field(exc, "code") == "23503":
            return jsonify({"error": "Player not found"}), 404
        _log_redacted("Battle creation failed")
        return jsonify(_INTERNAL_ERROR), 500
    except Exception:
        _log_redacted("Battle creation failed unexpectedly")
        return jsonify(_INTERNAL_ERROR), 500

    rows = getattr(result, "data", None) or []
    if not rows:
        return jsonify(_INTERNAL_ERROR), 500

    return jsonify({"battle": _battle_payload(rows[0])}), 201


@battle_bp.get("/api/battles/<battle_id>")
@require_auth
def get_battle(battle_id):
    battle_uuid = _parse_uuid(battle_id)
    if battle_uuid is None:
        return jsonify({"error": "battle_id must be a valid UUID"}), 400

    user_id = _get_obj_field(g.user, "id")
    token = _extract_bearer_token()

    try:
        response = (
            get_authenticated_client(token)
            .table("battle")
            .select(_BATTLE_COLUMNS)
            .eq("battle_id", str(battle_uuid))
            .or_(f"player1_id.eq.{user_id},player2_id.eq.{user_id}")
            .execute()
        )
    except PostgrestAPIError:
        _log_redacted("Battle fetch failed")
        return jsonify(_INTERNAL_ERROR), 500
    except Exception:
        _log_redacted("Battle fetch failed unexpectedly")
        return jsonify(_INTERNAL_ERROR), 500

    rows = getattr(response, "data", None) or []
    if not rows:
        return jsonify({"error": "Battle not found"}), 404

    return jsonify({"battle": _battle_payload(rows[0])}), 200


@battle_bp.post("/api/battles/<battle_id>/turn/check")
@require_auth
def check_turn(battle_id):
    data = _read_json_body()
    if isinstance(data, dict):
        supplied = _TURN_FORBIDDEN_FIELDS.intersection(data)
        if supplied:
            return jsonify(
                {"error": "Identity and battle control fields must not be supplied by the client"}
            ), 400

    user_id = _get_obj_field(g.user, "id")
    battle, error = get_authenticated_battle_for_turn(battle_id, user_id)
    if error is not None:
        error_payload, error_status = error
        return jsonify(error_payload), error_status

    return (
        jsonify(
            {
                "turn": {
                    "battle_id": _get_obj_field(battle, "battle_id"),
                    "player_id": str(user_id),
                    "is_current_turn": True,
                }
            }
        ),
        200,
    )


def get_authenticated_battle_for_turn(battle_id, user_id):
    """Resolve a battle and authorize `user_id` to perform a turn action.

    Performs no database mutation. Filters on the database side (participant
    predicate + RLS) so battles the user does not participate in are
    indistinguishable from nonexistent ones.

    Returns ``(battle, None)`` where ``battle`` is the matching row whenever the
    user is a participant, the battle is ``IN_PROGRESS``, and it is their turn.
    Otherwise returns ``(None, (payload, status_code))``.
    """
    battle_uuid = _parse_uuid(battle_id)
    if battle_uuid is None:
        return None, ({"error": "battle_id must be a valid UUID"}, 400)

    token = _extract_bearer_token()
    try:
        response = (
            get_authenticated_client(token)
            .table("battle")
            .select(_TURN_CHECK_COLUMNS)
            .eq("battle_id", str(battle_uuid))
            .or_(f"player1_id.eq.{user_id},player2_id.eq.{user_id}")
            .execute()
        )
    except PostgrestAPIError:
        _log_redacted("Battle fetch for turn check failed")
        return None, (_INTERNAL_ERROR, 500)
    except Exception:
        _log_redacted("Battle fetch for turn check failed unexpectedly")
        return None, (_INTERNAL_ERROR, 500)

    rows = getattr(response, "data", None) or []
    if not rows:
        return None, ({"error": "Battle not found"}, 404)

    battle = rows[0]
    if _get_obj_field(battle, "status") != "IN_PROGRESS":
        return None, ({"error": "Battle is not in progress"}, 409)

    current_turn = _get_obj_field(battle, "current_turn")
    if str(current_turn) != str(user_id):
        return None, ({"error": "Not your turn"}, 409)

    return battle, None


def build_initial_battle_state(player1_id, player2_id):
    """Construct the server-controlled initial battle state.

    Both parameters must be validated UUID strings before calling.
    The returned dict is intended for direct storage in battle_state.
    """
    return {
        "version": 1,
        "players": {
            player1_id: {"health": _INITIAL_HEALTH},
            player2_id: {"health": _INITIAL_HEALTH},
        },
    }


def _battle_payload(row):
    return {field: _get_obj_field(row, field) for field in _BATTLE_FIELDS}


def _parse_uuid(value):
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None


def _log_redacted(context):
    current_app.logger.error(
        "%s:\n%s",
        context,
        redact_log_message(traceback.format_exc()),
    )