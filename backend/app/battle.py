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
from app.battle_setup import DEFAULT_MAP, generate_setup, resolve_map
from app.logging_utils import redact_log_message
from app.supabase import get_authenticated_client

battle_bp = Blueprint("battle", __name__)

_VALID_GAME_MODES = {"LOCAL", "LAN", "ONLINE"}
_INTERNAL_ERROR = {"error": "Internal server error"}
_INITIAL_HEALTH = 100
_ANGLE_MIN = 0
_ANGLE_MAX = 360
_POWER_MIN = 0
_POWER_MAX = 100
_DEFAULT_ROUNDS = 1
_ROUNDS_MIN = 1
_ROUNDS_MAX = 3
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
_BATTLES_STATE_COLUMNS = "battle_id,player1_id,player2_id,current_turn,status,battle_state"
_BATTLE_CONTROL_FIELDS = frozenset(
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

    map_key = data.get("map")
    if map_key is not None and not isinstance(map_key, str):
        return jsonify({"error": "map must be a string"}), 400
    map_key = resolve_map(map_key) if map_key else DEFAULT_MAP

    rounds = data.get("rounds")
    if rounds is None:
        rounds = _DEFAULT_ROUNDS
    elif isinstance(rounds, bool) or not isinstance(rounds, int):
        return jsonify({"error": "rounds must be an integer"}), 400
    elif rounds < _ROUNDS_MIN or rounds > _ROUNDS_MAX:
        return jsonify({"error": "rounds must be between 1 and 3"}), 400

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
                        str(user_id), str(player2_uuid), map_key=map_key, rounds=rounds
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
        supplied = _BATTLE_CONTROL_FIELDS.intersection(data)
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


@battle_bp.post("/api/battles/<battle_id>/actions/fire")
@require_auth
def fire_battle_action(battle_id):
    data = _read_json_body()
    if data is None:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    if isinstance(data, dict):
        supplied = _BATTLE_CONTROL_FIELDS.intersection(data)
        if supplied:
            return jsonify(
                {"error": "Identity and battle control fields must not be supplied by the client"}
            ), 400

    shot, error = _validate_shot_input(data)
    if error is not None:
        error_payload, error_status = error
        return jsonify(error_payload), error_status

    user_id = _get_obj_field(g.user, "id")
    battle, error = get_authenticated_battle_for_turn(
        battle_id, user_id, columns=_BATTLES_STATE_COLUMNS
    )
    if error is not None:
        error_payload, error_status = error
        return jsonify(error_payload), error_status

    state = _get_obj_field(battle, "battle_state")
    if not isinstance(state, dict):
        state = {}
    if state.get("pending_fire") is not None:
        return jsonify({"error": "A shot is already in flight"}), 409

    state["pending_fire"] = {
        "player_id": str(user_id),
        "angle": shot[0],
        "power": shot[1],
    }

    battle_uuid = _parse_uuid(battle_id)
    token = _extract_bearer_token()

    try:
        update_result = (
            get_authenticated_client(token)
            .table("battle")
            .update({"battle_state": state})
            .eq("battle_id", str(battle_uuid))
            .or_(f"player1_id.eq.{user_id},player2_id.eq.{user_id}")
            .execute()
        )
    except PostgrestAPIError:
        _log_redacted("Battle fire action failed")
        return jsonify(_INTERNAL_ERROR), 500
    except Exception:
        _log_redacted("Battle fire action failed unexpectedly")
        return jsonify(_INTERNAL_ERROR), 500

    rows = getattr(update_result, "data", None) or []
    if not rows:
        return jsonify({"error": "Battle not found"}), 404

    return jsonify({"battle": _battle_payload(rows[0])}), 200


def get_authenticated_battle_for_turn(battle_id, user_id, columns=None):
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

    if not columns:
        columns = _TURN_CHECK_COLUMNS

    token = _extract_bearer_token()
    try:
        response = (
            get_authenticated_client(token)
            .table("battle")
            .select(columns)
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


def build_initial_battle_state(player1_id, player2_id, map_key=None, rounds=_DEFAULT_ROUNDS):
    """Construct the server-authoritative initial battle state (version 2).

    Both player ids must be validated UUID strings. ``map_key`` is a client
    choice (aliases are resolved and unknown values fall back to dustlands,
    mirroring the frontend Terrain.generate) and ``rounds`` is the chosen number
    of rounds (1-3). Every randomized element - seed, terrain heights, tank
    positions, initial wind and the scoreboard - is generated on the server and
    stored here; the client supplies none of it. The current turn remains the
    authoritative ``current_turn`` column, not this JSON.
    """
    if not isinstance(rounds, int) or isinstance(rounds, bool):
        rounds = _DEFAULT_ROUNDS
    rounds = max(_ROUNDS_MIN, min(_ROUNDS_MAX, rounds))

    setup = generate_setup(map_key=map_key)
    tanks = setup["tanks"]
    return {
        "version": 2,
        "setup": {
            "map": setup["map"],
            "seed": setup["seed"],
            "terrain": {"heights": setup["heights"]},
            "players": {
                player1_id: {
                    "x": tanks["player1"]["x"],
                    "y": tanks["player1"]["y"],
                    "health": _INITIAL_HEALTH,
                },
                player2_id: {
                    "x": tanks["player2"]["x"],
                    "y": tanks["player2"]["y"],
                    "health": _INITIAL_HEALTH,
                },
            },
            "wind": setup["wind"],
            "round": 1,
            "max_rounds": rounds,
            "scores": {player1_id: 0, player2_id: 0},
        },
    }


def _validate_shot_input(data):
    """Validate a fire action's client input (angle and power only).

    Bounds mirror the existing frontend (TD.ANGLE_MIN/MAX, TD.POWER_MIN/MAX).
    Returns ``((angle, power), None)`` on success, where the values are
    rounded integers, or ``(None, (payload, status_code))`` on failure.
    """
    if not isinstance(data, dict):
        return None, ({"error": "Request body must be a JSON object"}, 400)

    angle = data.get("angle")
    power = data.get("power")

    if angle is None or power is None:
        return None, ({"error": "angle and power are required"}, 400)

    angle_value = _as_number(angle)
    power_value = _as_number(power)
    if angle_value is None or power_value is None:
        return None, ({"error": "angle and power must be numbers"}, 400)

    if angle_value < _ANGLE_MIN or angle_value > _ANGLE_MAX:
        return None, ({"error": "angle must be between 0 and 360"}, 400)

    if power_value < _POWER_MIN or power_value > _POWER_MAX:
        return None, ({"error": "power must be between 0 and 100"}, 400)

    return (round(angle_value), round(power_value)), None


def _as_number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


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