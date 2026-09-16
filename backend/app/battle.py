import re
import secrets
import traceback
import uuid
from datetime import datetime, timezone

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
from app.shot_resolution import resolve_shot
from app.statistics import apply_completed_battle_statistics
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
_BATTLE_CODE_LENGTH = 4
_BATTLE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_BATTLE_CODE_FORMAT = r"^[A-HJ-NP-Z2-9]{4}$"
_BATTLE_CODE_ATTEMPTS = 8
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
    "battle_code",
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

    game_mode = data.get("game_mode")
    if game_mode is None or not isinstance(game_mode, str):
        return jsonify({"error": "game_mode is required"}), 400
    if game_mode not in _VALID_GAME_MODES:
        return jsonify({"error": "unsupported game_mode"}), 400

    player2_uuid = None
    if game_mode != "ONLINE":
        player2_id = data.get("player2_id")
        if player2_id is None or not isinstance(player2_id, str) or not player2_id.strip():
            return jsonify({"error": "player2_id is required"}), 400
        player2_uuid = _parse_uuid(player2_id.strip())
        if player2_uuid is None:
            return jsonify({"error": "player2_id must be a valid UUID"}), 400
    elif "player2_id" in data:
        return jsonify(
            {"error": "player2_id must not be supplied for ONLINE battles"}
        ), 400

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
    if player2_uuid is not None and user_uuid is not None and user_uuid == player2_uuid:
        return jsonify({"error": "player2_id must be different from the authenticated player"}), 400

    token = _extract_bearer_token()

    try:
        if game_mode == "ONLINE":
            rows = _insert_online_waiting(
                token, str(user_id), map_key=map_key, rounds=rounds
            )
        else:
            rows = _insert_local_lan(
                token,
                str(user_id),
                str(player2_uuid),
                game_mode,
                map_key=map_key,
                rounds=rounds,
            )
    except PostgrestAPIError as exc:
        if _get_obj_field(exc, "code") == "23503":
            return jsonify({"error": "Player not found"}), 404
        _log_redacted("Battle creation failed")
        return jsonify(_INTERNAL_ERROR), 500
    except Exception:
        _log_redacted("Battle creation failed unexpectedly")
        return jsonify(_INTERNAL_ERROR), 500

    if not rows:
        return jsonify(_INTERNAL_ERROR), 500

    return jsonify({"battle": _battle_payload(rows[0])}), 201


def _insert_online_waiting(token, player1_id, map_key=None, rounds=_DEFAULT_ROUNDS):
    """Insert a WAITING ONLINE battle with a server-generated join code.

    The body may only carry game_mode (ONLINE) plus the optional map/rounds; the
    join code and every control field are generated server-side. The db unique
    index on battle_code is the final collision guard: a 23505 during insert is
    retried with a fresh code for a handful of attempts. Since a full setup
    needs both players, the placeholder state keeps the chosen map/rounds so the
    joining player can rebuild the authoritative state via build_initial_battle_state.
    """
    client = get_authenticated_client(token)
    for _ in range(_BATTLE_CODE_ATTEMPTS):
        code = _generate_battle_code()
        try:
            result = (
                client.table("battle")
                .insert(
                    {
                        "player1_id": player1_id,
                        "player2_id": None,
                        "game_mode": "ONLINE",
                        "status": "WAITING",
                        "current_turn": player1_id,
                        "battle_state": _waiting_battle_state(
                            player1_id, map_key, rounds
                        ),
                        "battle_code": code,
                    }
                )
                .execute()
            )
        except PostgrestAPIError as exc:
            if _get_obj_field(exc, "code") == "23505":
                continue
            raise
        rows = getattr(result, "data", None) or []
        if rows:
            return rows
        raise RuntimeError("battle_code collisions exhausted")


def _insert_local_lan(
    token, player1_id, player2_id, game_mode, map_key=None, rounds=_DEFAULT_ROUNDS
):
    result = (
        get_authenticated_client(token)
        .table("battle")
        .insert(
            {
                "player1_id": player1_id,
                "player2_id": player2_id,
                "game_mode": game_mode,
                "status": "IN_PROGRESS",
                "current_turn": player1_id,
                "battle_state": build_initial_battle_state(
                    player1_id, player2_id, map_key=map_key, rounds=rounds
                ),
            }
        )
        .execute()
    )
    return getattr(result, "data", None) or []


@battle_bp.post("/api/battles/join")
@require_auth
def join_battle():
    data = _read_json_body()
    if data is None:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    raw_code = data.get("battle_code")
    if not isinstance(raw_code, str):
        return jsonify({"error": "battle_code is required"}), 400

    code = raw_code.strip().upper()
    if not _valid_battle_code(code):
        return jsonify({"error": "battle_code must be a valid 4-character code"}), 400

    user_id = _get_obj_field(g.user, "id")
    token = _extract_bearer_token()

    try:
        result = (
            get_authenticated_client(token)
            .rpc("join_online_waiting_battle", {"p_battle_code": code})
            .execute()
        )
    except PostgrestAPIError as exc:
        return _join_rpc_error(exc)
    except Exception:
        _log_redacted("Online battle join failed unexpectedly")
        return jsonify(_INTERNAL_ERROR), 500

    rows = getattr(result, "data", None) or []
    if not rows:
        return jsonify(_INTERNAL_ERROR), 500

    claimed = rows[0]
    player1_id = str(_get_obj_field(claimed, "player1_id"))

    # The RPC atomically claimed this battle for the caller. Now -- and only
    # now, as the authoritative player2_id -- replace the placeholder waiting
    # state with the real setup from battle_setup.py. The map/rounds were stored
    # in the placeholder at creation time so the join body stays just battle_code.
    map_key, rounds = _waiting_parameters(_get_obj_field(claimed, "battle_state"))
    battle_state = build_initial_battle_state(
        player1_id, str(user_id), map_key=map_key, rounds=rounds
    )

    battle_id = str(_get_obj_field(claimed, "battle_id"))
    try:
        update_result = (
            get_authenticated_client(token)
            .table("battle")
            .update({"battle_state": battle_state})
            .eq("battle_id", battle_id)
            .eq("status", "IN_PROGRESS")
            .eq("player2_id", str(user_id))
            .execute()
        )
    except PostgrestAPIError:
        # The RPC claim already committed; only state initialization failed. The
        # battle is IN_PROGRESS with the placeholder state and the caller owns
        # player2_id, so report an explicit error instead of silently entering
        # the game without an authoritative setup.
        _log_redacted("Online battle setup initialization failed")
        return jsonify({"error": "Battle could not be initialized"}), 500
    except Exception:
        _log_redacted("Online battle setup initialization failed unexpectedly")
        return jsonify({"error": "Battle could not be initialized"}), 500

    updated_rows = getattr(update_result, "data", None) or []
    if not updated_rows:
        return jsonify({"error": "Battle not found"}), 404

    return jsonify({"battle": _battle_payload(updated_rows[0])}), 200


def _generate_battle_code():
    return "".join(
        secrets.choice(_BATTLE_CODE_ALPHABET) for _ in range(_BATTLE_CODE_LENGTH)
    )


def _valid_battle_code(value):
    return bool(re.fullmatch(_BATTLE_CODE_FORMAT, value))


def _waiting_battle_state(player1_id, map_key, rounds):
    return {
        "version": 2,
        "waiting": True,
        "setup": {"map": map_key, "rounds": rounds},
        "damage_dealt": {},
    }


def _waiting_parameters(state):
    if not isinstance(state, dict):
        return None, None
    setup = state.get("setup")
    if not isinstance(setup, dict):
        return None, None
    return setup.get("map"), setup.get("rounds")


def _join_rpc_error(exc):
    code = _get_obj_field(exc, "code")
    message = (_get_obj_field(exc, "message") or "").strip()
    if code == "23503":
        return jsonify({"error": "Player not found"}), 404
    if isinstance(code, str) and code.startswith("PGRST"):
        return jsonify({"error": "Invalid request"}), 400
    if code == "P0001":
        if "Authentication required" in message:
            return jsonify({"error": "Authentication required"}), 401
        if "Invalid battle code" in message:
            return jsonify({"error": "battle_code must be a valid 4-character code"}), 400
        if "not found or is no longer joinable" in message:
            return jsonify({"error": "Battle not found or is no longer joinable"}), 404
    _log_redacted("Online battle join failed")
    return jsonify(_INTERNAL_ERROR), 500


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


@battle_bp.post("/api/battles/<battle_id>/actions/fire/resolve")
@require_auth
def resolve_fire_action(battle_id):
    data = _read_json_body()
    if isinstance(data, dict) and data:
        supplied = _BATTLE_CONTROL_FIELDS.intersection(data)
        if supplied:
            return jsonify(
                {"error": "Identity and battle control fields must not be supplied by the client"}
            ), 400
        return jsonify({"error": "Resolving a shot requires no request body"}), 400

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
    pending_fire = state.get("pending_fire")
    if not isinstance(pending_fire, dict):
        return jsonify({"error": "A shot is not in flight"}), 409

    pending_player = pending_fire.get("player_id")
    if not isinstance(pending_player, str) or str(pending_player) != str(user_id):
        return jsonify({"error": "Not your turn"}), 409

    if not _validate_pending_fire(pending_fire):
        return jsonify({"error": "Stored pending_fire is malformed"}), 400

    player1_id = str(_get_obj_field(battle, "player1_id"))
    player2_id = str(_get_obj_field(battle, "player2_id"))
    outcome = resolve_shot(state, player1_id, player2_id)

    updates = {"battle_state": outcome["battle_state"]}
    if outcome["current_turn"] is not None:
        updates["current_turn"] = outcome["current_turn"]
    if outcome["status"] == "COMPLETED":
        updates["status"] = "COMPLETED"
        updates["winner_player_id"] = outcome["round_winner_player_id"]
        updates["defeated_player_id"] = outcome["defeated_player_id"]
        updates["ended_at"] = datetime.now(timezone.utc).isoformat()

    battle_uuid = _parse_uuid(battle_id)
    token = _extract_bearer_token()

    try:
        client = get_authenticated_client(token)
        update_result = (
            client.table("battle")
            .update(updates)
            .eq("battle_id", str(battle_uuid))
            .eq("status", "IN_PROGRESS")
            .eq("current_turn", str(user_id))
            .or_(f"player1_id.eq.{user_id},player2_id.eq.{user_id}")
            .contains("battle_state", {"pending_fire": pending_fire})
            .execute()
        )
    except PostgrestAPIError:
        _log_redacted("Battle resolve action failed")
        return jsonify(_INTERNAL_ERROR), 500
    except Exception:
        _log_redacted("Battle resolve action failed unexpectedly")
        return jsonify(_INTERNAL_ERROR), 500

    rows = getattr(update_result, "data", None) or []
    if not rows:
        return _resolve_contention_response(battle_id, user_id)

    if outcome["status"] == "COMPLETED":
        try:
            apply_completed_battle_statistics(client, rows[0])
        except (PostgrestAPIError, Exception):
            _log_redacted("Battle statistics persistence failed")

    return jsonify({"battle": _battle_payload(rows[0]), "shot": outcome["shot"]}), 200


def _resolve_contention_response(battle_id, user_id):
    """Classify a resolve UPDATE that affected zero rows.

    A zero-row result means another request consumed the same ``pending_fire``
    first (or the battle otherwise changed) between our read and the atomic
    UPDATE. Re-read to distinguish an already-resolved shot from a battle that
    ended or disappeared. Returns a ``(response, status)`` Flask tuple.
    """
    battle_uuid = _parse_uuid(battle_id)
    token = _extract_bearer_token()

    try:
        response = (
            get_authenticated_client(token)
            .table("battle")
            .select(_BATTLES_STATE_COLUMNS)
            .eq("battle_id", str(battle_uuid))
            .or_(f"player1_id.eq.{user_id},player2_id.eq.{user_id}")
            .execute()
        )
    except (PostgrestAPIError, Exception):
        _log_redacted("Battle resolve contention re-read failed")
        return jsonify(_INTERNAL_ERROR), 500

    rows = getattr(response, "data", None) or []
    if not rows:
        return jsonify({"error": "Battle not found"}), 404

    stale = rows[0]
    if _get_obj_field(stale, "status") != "IN_PROGRESS":
        return jsonify({"error": "Battle is not in progress"}), 409

    stale_state = _get_obj_field(stale, "battle_state")
    if not isinstance(stale_state, dict) or stale_state.get("pending_fire") is None:
        return jsonify({"error": "Shot already resolved"}), 409

    return jsonify({"error": "A shot is already in flight"}), 409


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
        "damage_dealt": {player1_id: 0, player2_id: 0},
    }


def _validate_pending_fire(pending_fire):
    """Structural validation for a stored (server-written) ``pending_fire``.

    The values were written by the fire endpoint, so bounds already pass the
    same checks as ``_validate_shot_input``. Returns ``True`` when the payload
    is well-formed (dict with integer-ish angle/power), ``False`` otherwise.
    """
    if not isinstance(pending_fire, dict):
        return False
    if not isinstance(pending_fire.get("player_id"), str):
        return False
    angle = _as_number(pending_fire.get("angle"))
    power = _as_number(pending_fire.get("power"))
    if angle is None or power is None:
        return False
    if angle < _ANGLE_MIN or angle > _ANGLE_MAX:
        return False
    if power < _POWER_MIN or power > _POWER_MAX:
        return False
    return True


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