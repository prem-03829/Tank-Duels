"""Server-authoritative player statistics for completed battles.

A battle's outcome is persisted at most once: only the single request that wins
the battle's compare-and-swap transition ``IN_PROGRESS -> COMPLETED`` (matching
the frontend rule that statistics change only when a match truly finishes, never
on quit, refresh or interruption) reaches this module. Every later resolve
attempt is rejected with a 409 before any statistics code runs, so a completed
match can never be counted twice.

Persistence happens entirely inside the database through the ``SECURITY
DEFINER`` RPC ``public.record_battle_statistics(p_battle_id uuid)`` (see
``docs/migrations/13c-record-battle-statistics.md``). The function is the only
writer of ``player_statistics``:

- It validates that the caller (``auth.uid()``) is a participant of the battle
  and that the battle is ``COMPLETED`` with a winner and defeated player.
- It reads the authoritative ``battle_state`` from the battle row itself and
  computes both players' deltas there -- a client can never supply fabricated
  values.
- It registers each battle **at most once**: the marker
  ``battle_state.statistics_recorded = true`` is written in the same
  transaction as both player upserts, and a repeated call for the same battle
  short-circuits on the marker (idempotent, no double count). If the upsert
  fails, the whole transaction rolls back and the marker is never left behind.
- It upserts both players' rows atomically (``ON CONFLICT (player_id)``),
  stamping ``updated_at`` with the database clock (``now()``).

Direct table INSERT/UPDATE is deliberately not used: ``player_statistics`` has
row-level security enabled with only a SELECT-self policy, and a battle is
written by a single resolver's token on behalf of BOTH players, so no per-user
RLS write policy could authorize the opponent's row.
"""

from app.auth import _get_obj_field


def apply_completed_battle_statistics(client, battle):
    """Record ``player_statistics`` for both participants of a completed battle.

    ``client`` must be the caller's authenticated (RLS) client and ``battle`` a
    COMPLETED battle row. Delegates to the ``public.record_battle_statistics``
    RPC, which validates the caller and computes + upserts both players' deltas.
    Raises on database errors; callers decide whether the failure is fatal.
    """
    status = _get_obj_field(battle, "status")
    if str(status) != "COMPLETED":
        raise ValueError("statistics persistence requires a COMPLETED battle")
    battle_id = _get_obj_field(battle, "battle_id")
    if battle_id is None:
        raise ValueError("Completed battle is missing battle_id")
    client.rpc(
        "record_battle_statistics", {"p_battle_id": str(battle_id)}
    ).execute()