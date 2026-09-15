"""Authenticated same-device (LOCAL match mode) history persistence.

Completed same-device matches are recorded here as the authenticated player's
persistent local history (``public.local_battle``). Semantics follow db.md:

- ``player_id`` is the authenticated account that *owns* the history. It does
  NOT mean this player participated in the match; it is always derived from the
  validated JWT (``g.user``) and never accepted from the request body.
- ``player1_name`` / ``player2_name`` are name snapshots captured when the
  match ends; the two people on the same device do not need accounts.
- Only *completed* same-device results reach this endpoint. The frontend calls
  it from the exact one-shot match-completion path (the same path that records
  guest history) and never for abandoned, interrupted, refreshed, or quit
  matches.
- These rows never update ``public.player_statistics`` and never create rows in
  ``public.battle`` (LOCAL/LAN constraints and online battle codes are
  untouched).
- ``created_at`` and ``ended_at`` are written by the server from a single
  timestamp so the ``ended_at >= created_at`` constraint always holds.
- Duplicates are avoided: before inserting, a small recent-window scan for the
  same owner + identical match fields returns the existing row instead (200)
  instead of recording the match twice.
"""

import traceback
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify
from postgrest.exceptions import APIError as PostgrestAPIError

from app.auth import (
    _extract_bearer_token,
    _get_obj_field,
    _read_json_body,
    require_auth,
)
from app.logging_utils import redact_log_message
from app.supabase import get_authenticated_client

local_battle_bp = Blueprint("local_battle", __name__)

_LOCAL_BATTLE_FIELDS = [
    "local_battle_id",
    "player_id",
    "player1_name",
    "player2_name",
    "winner",
    "player1_score",
    "player2_score",
    "map",
    "rounds",
    "created_at",
    "ended_at",
]
_LOCAL_BATTLE_COLUMNS = ",".join(_LOCAL_BATTLE_FIELDS)

_INTERNAL_ERROR = {"error": "Internal server error"}

_MAX_NAME_LENGTH = 50
_MAX_MAP_LENGTH = 20
_VALID_WINNERS = ("PLAYER1", "PLAYER2")
_DEDUP_WINDOW_SECONDS = 10
_DEDUP_FIELDS = (
    "player1_name",
    "player2_name",
    "winner",
    "player1_score",
    "player2_score",
    "map",
    "rounds",
)


@local_battle_bp.post("/api/local-battles")
@require_auth
def create_local_battle():
    data = _read_json_body()
    if data is None:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    if "player_id" in data:
        return jsonify({"error": "player_id must not be supplied by the client"}), 400

    player1_name = _require_string(data, "player1_name", "player1_name is required")
    player2_name = _require_string(data, "player2_name", "player2_name is required")
    winner = data.get("winner")
    player1_score = data.get("player1_score")
    player2_score = data.get("player2_score")
    map_key = data.get("map")
    rounds = data.get("rounds")

    if player1_name is None:
        return jsonify({"error": "player1_name is required"}), 400
    if player2_name is None:
        return jsonify({"error": "player2_name is required"}), 400
    if len(player1_name) > _MAX_NAME_LENGTH:
        return jsonify({"error": "player1_name must be 50 characters or fewer"}), 400
    if len(player2_name) > _MAX_NAME_LENGTH:
        return jsonify({"error": "player2_name must be 50 characters or fewer"}), 400
    if winner not in _VALID_WINNERS:
        return jsonify({"error": "winner must be PLAYER1 or PLAYER2"}), 400
    if not _valid_score(player1_score):
        return jsonify({"error": "player1_score must be a non-negative integer"}), 400
    if not _valid_score(player2_score):
        return jsonify({"error": "player2_score must be a non-negative integer"}), 400
    if not isinstance(map_key, str) or not map_key.strip():
        return jsonify({"error": "map is required"}), 400
    if len(map_key) > _MAX_MAP_LENGTH:
        return jsonify({"error": "map must be 20 characters or fewer"}), 400
    if not isinstance(rounds, int) or isinstance(rounds, bool) or rounds < 1:
        return jsonify({"error": "rounds must be a positive integer"}), 400

    user_id = _get_obj_field(g.user, "id")

    # A single server timestamp keeps created_at == ended_at, satisfying the
    # database's ended_at >= created_at constraint without trusting client
    # clocks. The completion time is effectively "now" because the frontend
    # calls this immediately when the match completes.
    now_iso = datetime.now(timezone.utc).isoformat()

    payload = {
        "player_id": str(user_id),
        "player1_name": player1_name,
        "player2_name": player2_name,
        "winner": winner,
        "player1_score": player1_score,
        "player2_score": player2_score,
        "map": map_key,
        "rounds": rounds,
        "created_at": now_iso,
        "ended_at": now_iso,
    }

    token = _extract_bearer_token()

    try:
        client = get_authenticated_client(token)

        dedup_start = (
            datetime.now(timezone.utc) - timedelta(seconds=_DEDUP_WINDOW_SECONDS)
        ).isoformat()
        recent = (
            client.table("local_battle")
            .select(_LOCAL_BATTLE_COLUMNS)
            .eq("player_id", str(user_id))
            .gte("created_at", dedup_start)
            .execute()
        )
        for row in getattr(recent, "data", None) or []:
            if _matches(row, payload):
                return jsonify({"local_battle": _local_battle_payload(row)}), 200

        result = client.table("local_battle").insert(payload).execute()
    except PostgrestAPIError:
        _log_redacted("Local battle creation failed")
        return jsonify(_INTERNAL_ERROR), 500
    except Exception:
        _log_redacted("Local battle creation failed unexpectedly")
        return jsonify(_INTERNAL_ERROR), 500

    rows = getattr(result, "data", None) or []
    if not rows:
        return jsonify(_INTERNAL_ERROR), 500

    return jsonify({"local_battle": _local_battle_payload(rows[0])}), 201


@local_battle_bp.get("/api/local-battles")
@require_auth
def list_local_battles():
    user_id = _get_obj_field(g.user, "id")
    token = _extract_bearer_token()

    try:
        response = (
            get_authenticated_client(token)
            .table("local_battle")
            .select(_LOCAL_BATTLE_COLUMNS)
            .eq("player_id", str(user_id))
            .order("created_at", desc=True)
            .execute()
        )
    except PostgrestAPIError:
        _log_redacted("Local battle history fetch failed")
        return jsonify(_INTERNAL_ERROR), 500
    except Exception:
        _log_redacted("Local battle history fetch failed unexpectedly")
        return jsonify(_INTERNAL_ERROR), 500

    rows = getattr(response, "data", None) or []
    return (
        jsonify(
            {"local_battles": [_local_battle_payload(row) for row in rows]}
        ),
        200,
    )


def _require_string(data, name, error_message):
    value = data.get(name)
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value:
        return None
    return value


def _valid_score(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _matches(row, payload):
    return all(_get_obj_field(row, field) == payload[field] for field in _DEDUP_FIELDS)


def _local_battle_payload(row):
    return {field: _get_obj_field(row, field) for field in _LOCAL_BATTLE_FIELDS}


def _log_redacted(context):
    current_app.logger.error(
        "%s:\n%s",
        context,
        redact_log_message(traceback.format_exc()),
    )