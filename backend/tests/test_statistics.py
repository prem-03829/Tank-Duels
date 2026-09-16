"""Offline tests for server-authoritative battle statistics.

The write path is the idempotent ``public.record_battle_statistics`` RPC
through the caller's authenticated client (see
``docs/migrations/13c-record-battle-statistics.md``). Two layers are tested
fully offline with in-memory fakes that mirror the documented SQL semantics:

Wrapper contract (``apply_completed_battle_statistics``):
- a COMPLETED battle triggers exactly one RPC invocation with the battle id
- non-completed battles and battles without an id are rejected before any RPC
- a failing RPC propagates so the resolve endpoint keeps its best-effort 200

RPC semantics (the emulated SECURITY DEFINER function):
- the first call records BOTH players' deltas from the authoritative row
- a second call for the same battle is a no-op: the
  ``battle_state.statistics_recorded`` marker, written in the same transaction
  as the upserts, short-circuits the function
- a failed upsert leaves neither the marker nor the statistics behind
  (all-or-nothing) and a retry records cleanly
- anonymous and non-participant callers are rejected
- non-completed battles are rejected

The endpoint-level contract (game-over resolve fires the RPC once, and the
endpoint still returns 200 when the RPC fails) lives in
``test_resolve_endpoint.py``.
"""

import unittest

from app.statistics import apply_completed_battle_statistics

from test_resolve_endpoint import (
    BATTLE_ID,
    P1,
    P2,
    build_battle,
)

OUTSIDER = "33333333-3333-3333-3333-333333333333"


def _completed_battle(**overrides):
    battle = build_battle(status="COMPLETED")
    battle["winner_player_id"] = P1
    battle["defeated_player_id"] = P2
    battle["ended_at"] = "2026-01-01T00:00:00+00:00"
    battle.update(overrides)
    return battle


class _RpcResult:
    def __init__(self):
        self.data = []


class _RpcInvocation:
    def __init__(self, error):
        self._error = error

    def execute(self):
        if self._error is not None:
            raise self._error
        return _RpcResult()


class _RpcRecorder:
    """Fake authenticated client recording every rpc() invocation."""

    def __init__(self, error=None):
        self.calls = []
        self._error = error

    def rpc(self, name, params):
        self.calls.append((name, params))
        return _RpcInvocation(self._error)


class _DatabaseError(Exception):
    """Stands in for a server-side database failure (e.g. PostgrestAPIError)."""


class StatisticsWrapperTests(unittest.TestCase):
    def test_completed_battle_invokes_rpc_exactly_once(self):
        recorder = _RpcRecorder()
        apply_completed_battle_statistics(recorder, _completed_battle())
        self.assertEqual(
            recorder.calls,
            [("record_battle_statistics", {"p_battle_id": BATTLE_ID})],
        )

    def test_in_progress_battle_rejected_before_any_rpc(self):
        recorder = _RpcRecorder()
        with self.assertRaises(ValueError):
            apply_completed_battle_statistics(
                recorder, build_battle(status="IN_PROGRESS")
            )
        self.assertEqual(recorder.calls, [])

    def test_missing_status_rejected_before_any_rpc(self):
        recorder = _RpcRecorder()
        battle = _completed_battle()
        del battle["status"]
        with self.assertRaises(ValueError):
            apply_completed_battle_statistics(recorder, battle)
        self.assertEqual(recorder.calls, [])

    def test_missing_battle_id_rejected_before_any_rpc(self):
        recorder = _RpcRecorder()
        battle = _completed_battle()
        del battle["battle_id"]
        with self.assertRaises(ValueError):
            apply_completed_battle_statistics(recorder, battle)
        self.assertEqual(recorder.calls, [])

    def test_database_error_propagates(self):
        recorder = _RpcRecorder(error=_DatabaseError("stats write failed"))
        with self.assertRaises(_DatabaseError):
            apply_completed_battle_statistics(recorder, _completed_battle())
        self.assertEqual(len(recorder.calls), 1)


class _RpcBattleError(Exception):
    """Stands in for a RAISE EXCEPTION surfacing from the RPC to the client."""


class _StatsStore:
    """In-memory ``battle`` + ``player_statistics`` tables."""

    def __init__(self):
        self.battles = {}
        self.statistics = {}

    def add_battle(self, battle):
        self.battles[battle["battle_id"]] = battle

    def seed(self, player_id, **values):
        self.statistics[player_id] = {
            "player_id": player_id,
            "battles_played": 0,
            "battles_won": 0,
            "battles_lost": 0,
            "total_damage": 0,
            "updated_at": "2026-01-01T00:00:00+00:00",
            **values,
        }


class _RpcExec:
    """Returned by rpc(); execute() runs the emulated function body."""

    def __init__(self, client, name, params):
        self._client = client
        self._name = name
        self._params = params

    def execute(self):
        if self._name != "record_battle_statistics":
            raise AssertionError(f"unexpected rpc: {self._name}")
        self._client._record_battle_statistics(self._params.get("p_battle_id"))
        return _RpcResult()


class _RpcStatsClient:
    """Fake authenticated client whose rpc() emulates record_battle_statistics.

    Mirrors migration 13C exactly: anonymous/participant + COMPLETED + outcome
    guards, the ``statistics_recorded`` idempotency short-circuit, and an
    all-or-nothing commit point -- player upserts and the marker are applied
    together or not at all.
    """

    def __init__(self, store, caller_id, fail_upsert=False):
        self.store = store
        self.caller_id = caller_id
        self.fail_upsert = fail_upsert

    def rpc(self, name, params):
        return _RpcExec(self, name, params)

    def _record_battle_statistics(self, battle_id):
        battle = self.store.battles.get(battle_id)
        if battle is None:
            raise _RpcBattleError("Battle not found")
        if self.caller_id is None:
            raise _RpcBattleError("Authentication required")
        if self.caller_id not in (battle["player1_id"], battle["player2_id"]):
            raise _RpcBattleError("Not a participant of this battle")
        if battle["status"] != "COMPLETED":
            raise _RpcBattleError("Battle is not completed")
        if battle["winner_player_id"] is None or battle["defeated_player_id"] is None:
            raise _RpcBattleError("Completed battle is missing outcome")

        if battle["battle_state"].get("statistics_recorded") is True:
            return

        damage = battle["battle_state"].get("damage_dealt") or {}
        deltas = {}
        for player_id in (battle["player1_id"], battle["player2_id"]):
            deltas[player_id] = {
                "battles_played": 1,
                "battles_won": 1 if player_id == battle["winner_player_id"] else 0,
                "battles_lost": 1 if player_id == battle["defeated_player_id"] else 0,
                "total_damage": int(damage.get(player_id, 0) or 0),
            }

        if self.fail_upsert:
            raise _RpcBattleError("statistics upsert failed")

        for player_id, delta in deltas.items():
            row = self.store.statistics.setdefault(
                player_id,
                {
                    "player_id": player_id,
                    "battles_played": 0,
                    "battles_won": 0,
                    "battles_lost": 0,
                    "total_damage": 0,
                    "updated_at": "2026-01-01T00:00:00+00:00",
                },
            )
            row["battles_played"] += delta["battles_played"]
            row["battles_won"] += delta["battles_won"]
            row["battles_lost"] += delta["battles_lost"]
            row["total_damage"] += delta["total_damage"]
            row["updated_at"] = "2026-02-02T00:00:00+00:00"

        battle["battle_state"] = dict(
            battle["battle_state"], statistics_recorded=True
        )


class RecordStatisticsRPCTests(unittest.TestCase):
    def setUp(self):
        self.store = _StatsStore()

    def _battle(self, status="COMPLETED", damage=None, recorded=False):
        battle = build_battle(status=status)
        battle["winner_player_id"] = P1
        battle["defeated_player_id"] = P2
        battle["ended_at"] = "2026-01-01T00:00:00+00:00"
        if damage is not None:
            battle["battle_state"]["damage_dealt"] = damage
        if recorded:
            battle["battle_state"]["statistics_recorded"] = True
        self.store.add_battle(battle)
        return battle

    def _client(self, caller_id=P1, fail_upsert=False):
        return _RpcStatsClient(self.store, caller_id, fail_upsert=fail_upsert)

    def _record(self, client):
        client.rpc(
            "record_battle_statistics", {"p_battle_id": BATTLE_ID}
        ).execute()

    def test_first_call_records_both_players(self):
        self._battle(damage={P1: 40, P2: 15})
        self._record(self._client())

        self.assertIn(P1, self.store.statistics)
        self.assertIn(P2, self.store.statistics)
        self.assertEqual(self.store.statistics[P1]["battles_played"], 1)
        self.assertEqual(self.store.statistics[P1]["battles_won"], 1)
        self.assertEqual(self.store.statistics[P1]["battles_lost"], 0)
        self.assertEqual(self.store.statistics[P1]["total_damage"], 40)
        self.assertEqual(self.store.statistics[P2]["battles_played"], 1)
        self.assertEqual(self.store.statistics[P2]["battles_won"], 0)
        self.assertEqual(self.store.statistics[P2]["battles_lost"], 1)
        self.assertEqual(self.store.statistics[P2]["total_damage"], 15)
        self.assertIs(
            self.store.battles[BATTLE_ID]["battle_state"].get(
                "statistics_recorded"
            ),
            True,
        )

    def test_second_call_does_not_increment_either_player(self):
        self._battle(damage={P1: 40, P2: 15})
        self.store.seed(
            P1, battles_played=3, battles_won=2, battles_lost=1, total_damage=50
        )
        self.store.seed(
            P2, battles_played=3, battles_won=3, battles_lost=0, total_damage=25
        )
        client = self._client()

        self._record(client)
        self._record(client)

        self.assertEqual(self.store.statistics[P1]["battles_played"], 4)
        self.assertEqual(self.store.statistics[P1]["battles_won"], 3)
        self.assertEqual(self.store.statistics[P1]["battles_lost"], 1)
        self.assertEqual(self.store.statistics[P1]["total_damage"], 90)
        self.assertEqual(self.store.statistics[P2]["battles_played"], 4)
        self.assertEqual(self.store.statistics[P2]["battles_won"], 3)
        self.assertEqual(self.store.statistics[P2]["battles_lost"], 1)
        self.assertEqual(self.store.statistics[P2]["total_damage"], 40)
        self.assertIs(
            self.store.battles[BATTLE_ID]["battle_state"].get(
                "statistics_recorded"
            ),
            True,
        )

    def test_already_recorded_battle_returns_without_changes(self):
        self._battle(damage={P1: 40, P2: 15}, recorded=True)
        self.store.seed(P1, battles_played=7)
        self.store.seed(P2, battles_played=7)
        self._record(self._client())
        self.assertEqual(self.store.statistics[P1]["battles_played"], 7)
        self.assertEqual(self.store.statistics[P2]["battles_played"], 7)

    def test_failed_upsert_marks_nothing_and_changes_nothing(self):
        self._battle(damage={P1: 40, P2: 15})
        with self.assertRaises(_RpcBattleError):
            self._record(self._client(fail_upsert=True))

        self.assertEqual(self.store.statistics, {})
        self.assertNotIn(
            "statistics_recorded",
            self.store.battles[BATTLE_ID]["battle_state"],
        )

    def test_retry_after_failure_records_cleanly(self):
        self._battle(damage={P1: 40, P2: 15})
        with self.assertRaises(_RpcBattleError):
            self._record(self._client(fail_upsert=True))

        self._record(self._client())

        self.assertEqual(self.store.statistics[P1]["battles_played"], 1)
        self.assertEqual(self.store.statistics[P2]["battles_played"], 1)
        self.assertEqual(self.store.statistics[P1]["total_damage"], 40)
        self.assertEqual(self.store.statistics[P2]["total_damage"], 15)

    def test_non_participant_caller_rejected(self):
        self._battle(damage={P1: 40, P2: 15})
        with self.assertRaises(_RpcBattleError):
            self._record(self._client(caller_id=OUTSIDER))
        self.assertEqual(self.store.statistics, {})
        self.assertNotIn(
            "statistics_recorded",
            self.store.battles[BATTLE_ID]["battle_state"],
        )

    def test_anonymous_caller_rejected(self):
        self._battle()
        with self.assertRaises(_RpcBattleError) as caught:
            self._record(self._client(caller_id=None))
        self.assertIn("Authentication required", str(caught.exception))
        self.assertEqual(self.store.statistics, {})
        self.assertNotIn(
            "statistics_recorded",
            self.store.battles[BATTLE_ID]["battle_state"],
        )

    def test_unknown_battle_rejected(self):
        with self.assertRaises(_RpcBattleError):
            self._record(_RpcStatsClient(self.store, P1))
        self.assertEqual(self.store.statistics, {})

    def test_non_completed_battle_rejected(self):
        self._battle(status="IN_PROGRESS")
        with self.assertRaises(_RpcBattleError):
            self._record(self._client())
        self.assertEqual(self.store.statistics, {})
        self.assertNotIn(
            "statistics_recorded",
            self.store.battles[BATTLE_ID]["battle_state"],
        )


if __name__ == "__main__":
    unittest.main()