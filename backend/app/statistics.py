"""Server-authoritative player statistics for completed battles.

A battle's outcome is persisted at most once: only the single request that wins
the battle's compare-and-swap transition ``IN_PROGRESS -> COMPLETED`` (matching
the frontend rule that statistics change only when a match truly finishes, never
on quit, refresh or interruption) reaches this module. Every later resolve
attempt is rejected with a 409 before any statistics code runs, so a completed
match can never be counted twice.

Each participant's ``player_statistics`` row is upserted from the battle row the
CAS request just wrote:

- ``battles_played`` = +1 for both players
- ``battles_won`` = +1 for ``winner_player_id``
- ``battles_lost`` = +1 for ``defeated_player_id``
- ``total_damage`` += the player's running ``damage_dealt`` total that the
  server accumulated on the opponent across every round
  (``battle_state.damage_dealt``)

Persistence model (see module docstring limitations at the bottom of the
``db.md`` topic this backend targets):

- Rows are selected with the caller's authenticated (RLS) client.
- An existing row is updated with a *literal* computed total, because PostgREST
  cannot express ``SET col = col + K``.
- A missing row is inserted.
- If the insert races another completion and fails on the unique key (23505),
  the row is re-selected and updated instead.
"""

from datetime import datetime, timezone

from postgrest.exceptions import APIError as PostgrestAPIError

from app.auth import _get_obj_field

_COLUMNS = "player_id,battles_played,battles_won,battles_lost,total_damage,updated_at"


def statistics_deltas(battle):
    """Return per-player statistics deltas for a completed battle.

    ``battle`` must be the authoritative completed row (``status == COMPLETED``
    with a winner, a defeated player and both player ids). Returns a dict
    mapping each participant's id to ``{battles_played, battles_won,
    battles_lost, total_damage}``. Raises ``ValueError`` when the battle is not
    completed or misses any participant/outcome field.
    """
    status = _get_obj_field(battle, "status")
    if str(status) != "COMPLETED":
        raise ValueError("statistics_deltas requires a COMPLETED battle")

    player1_id = _get_obj_field(battle, "player1_id")
    player2_id = _get_obj_field(battle, "player2_id")
    winner = _get_obj_field(battle, "winner_player_id")
    defeated = _get_obj_field(battle, "defeated_player_id")
    if None in (player1_id, player2_id, winner, defeated):
        raise ValueError("Completed battle is missing participant or outcome ids")

    battle_state = _get_obj_field(battle, "battle_state") or {}
    damage_dealt = battle_state.get("damage_dealt") or {}
    player1_id, player2_id = str(player1_id), str(player2_id)

    def _delta_for(player_id):
        return {
            "battles_played": 1,
            "battles_won": 1 if player_id == str(winner) else 0,
            "battles_lost": 1 if player_id == str(defeated) else 0,
            "total_damage": int(damage_dealt.get(player_id, 0) or 0),
        }

    return {
        player1_id: _delta_for(player1_id),
        player2_id: _delta_for(player2_id),
    }


def apply_completed_battle_statistics(client, battle):
    """Upsert ``player_statistics`` for both participants of a completed battle.

    ``client`` must be the caller's authenticated (RLS) client and ``battle`` a
    COMPLETED row. Runs once per player: existing rows are updated with literal
    merges and missing rows are inserted. Raises on database errors; callers
    decide whether the failure is fatal.
    """
    for player_id, delta in statistics_deltas(battle).items():
        _upsert_statistics(client, player_id, delta)


def _upsert_statistics(client, player_id, delta):
    rows = _select_statistics(client, player_id)
    if rows:
        _update_statistics(client, player_id, _merge_row(rows[0], delta))
        return

    try:
        _insert_statistics(client, player_id, delta)
    except PostgrestAPIError as exc:
        if _get_obj_field(exc, "code") != "23505":
            raise
        rows = _select_statistics(client, player_id)
        if not rows:
            raise
        _update_statistics(client, player_id, _merge_row(rows[0], delta))


def _select_statistics(client, player_id):
    response = (
        client.table("player_statistics")
        .select(_COLUMNS)
        .eq("player_id", str(player_id))
        .execute()
    )
    return getattr(response, "data", None) or []


def _update_statistics(client, player_id, payload):
    client.table("player_statistics").update(payload).eq("player_id", str(player_id)).execute()


def _insert_statistics(client, player_id, delta):
    payload = {
        "player_id": str(player_id),
        "battles_played": delta["battles_played"],
        "battles_won": delta["battles_won"],
        "battles_lost": delta["battles_lost"],
        "total_damage": delta["total_damage"],
        "updated_at": _now_iso(),
    }
    client.table("player_statistics").insert(payload).execute()


def _merge_row(row, delta):
    return {
        "battles_played": int(_get_obj_field(row, "battles_played") or 0) + delta["battles_played"],
        "battles_won": int(_get_obj_field(row, "battles_won") or 0) + delta["battles_won"],
        "battles_lost": int(_get_obj_field(row, "battles_lost") or 0) + delta["battles_lost"],
        "total_damage": int(_get_obj_field(row, "total_damage") or 0) + delta["total_damage"],
        "updated_at": _now_iso(),
    }


def _now_iso():
    return datetime.now(timezone.utc).isoformat()
