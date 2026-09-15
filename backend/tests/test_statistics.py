"""Offline tests for server-authoritative battle statistics.

Scenario context (db.md lines 302-312 and their inline notes):

- ``player_statistics`` rows are *owned and written by the backend*; the
  `authenticated` RLS role only gets ``SELECT`` on the table (db.md lines
  306-312 show the anon/authenticated grants are SELECT-only), while the
  server writes through the caller's *authenticated* client exactly like the
  battle CAS resolves do.
- Statistics are recorded **at most once per completed battle**: the write is
  triggered only by the resolve CAS that actually flips a battle to
  COMPLETED, never by quit/refresh/interruption, and the endpoint's happy path
  continues to return 200 even if the statistics upsert itself races with
  another process (unique-constraint contention) or is best-effort.

These tests run fully offline against an in-memory fake replicating PostgREST
CAS-UPDATE semantics for ``battle`` plus SELECT/UPDATE/INSERT (with
unique-constraint contention) for ``player_statistics``.
"""

import json
import threading
import unittest
from unittest import mock

from app import create_app

from test_resolve_endpoint import (
    BATTLE_ID,
    P1,
    P2,
    build_battle,
    build_flat_state,
)

# Local copy of the non-participant id used by the resolve contention tests.
OUTSIDER = "33333333-3333-3333-3333-333333333333"

P1 = "11111111-1111-1111-1111-111111111111"
P2 = "22222222-2222-2222-2222-222222222222"
OUTSIDER = "33333333-3333-3333-3333-333333333333"


class _UniqueViolationError(Exception):
    """Mimics the PostgREST 23505 duplicate-key payload."""

    def __init__(self, payload):
        super().__init__("duplicate key value violates unique constraint")
        self.code = "23505"
        self.payload = payload


class _FakeRow:
    def __init__(self, payload):
        self.payload = payload

    def asdict(self):
        return dict(self.payload)


class _FakeResult:
    def __init__(self, rows):
        self.data = rows
        self.rowcount = len(rows)


class _FakeStatQuery:
    def __init__(self, store, table_name, params):
        self.store = store
        self.table_name = table_name
        self.params = params

    def eq(self, column, value):
        self.params.setdefault("eq", {})[column] = value
        return self

    def or_(self, expression):
        self.params["or"] = expression
        return self

    def contains(self, column, value):
        self.params.setdefault("contains", {})[column] = value
        return self

    def select(self, columns="*"):
        self.params["mode"] = "select"
        self.params["columns"] = columns
        return self

    def update(self, payload):
        self.params["mode"] = "update"
        self.params["update"] = payload
        return self

    def insert(self, payload):
        self.params["mode"] = "insert"
        self.params["insert"] = payload
        return self

    def execute(self):
        if self.table_name == "player_statistics":
            return self._execute_statistics()
        return self._execute_battle()

    def _execute_statistics(self):
        mode = self.params.get("mode")
        if mode == "select":
            columns = [c.strip() for c in self.params.get("columns", "*").split(",") if c.strip()]
            eq = self.params.get("eq", {})
            with self.store.lock:
                rows = [
                    {c: dict(row)[c] for c in columns if c in row}
                    for row in self.store.statistics.values()
                    if not eq or all(row.get(k) == v for k, v in eq.items())
                ]
            return _FakeResult(rows)
        if mode == "update":
            eq = self.params.get("eq", {})
            payload = self.params.get("update", {})
            with self.store.lock:
                for player_id, row in self.store.statistics.items():
                    if not eq or all(row.get(k) == v for k, v in eq.items()):
                        row.update(payload)
                        return _FakeResult([dict(row)])
            return _FakeResult([])
        if mode == "insert":
            payload = self.params.get("insert", {})
            player_id = payload.get("player_id")
            with self.store.lock:
                if player_id in self.store.statistics:
                    raise _UniqueViolationError(payload)
                self.store.statistics[player_id] = dict(payload)
            self.store.insert_count += 1
            return _FakeResult([dict(payload)])
        raise AssertionError(f"unexpected statistics mode: {mode}")

    def _execute_battle(self):
        return _FakeResult([])


class _FakeStatClient:
    def __init__(self, store):
        self.store = store

    def table(self, table_name):
        return _FakeStatQuery(self.store, table_name, {})


class _StatStore:
    def __init__(self):
        self.lock = threading.Lock()
        self.statistics = {}
        self.insert_count = 0

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


class _StubbingClient(_FakeStatClient):
    """A statistics client that can be switched to fail persistence, to
    confirm the endpoint still returns 200 when the upsert is best-effort."""

    def __init__(self, store):
        super().__init__(store)
        self.fail_writes = False

    def table(self, table_name):
        if table_name == "player_statistics" and self.fail_writes:
            return _FakeStatQuery(self.store, table_name, {"mode": "boom"})
        return super().table(table_name)


class StatisticsEndToEndTests(unittest.TestCase):
    """Server-authoritative statistics through an in-memory PostgREST fake."""

    def setUp(self):
        self.store = _StatStore()

        self.client = _StubbingClient(self.store)

    def _completed_battle(self, state=None):
        return build_battle(
            status="COMPLETED",
            current_turn=P1,
            state=state or build_flat_state(),
        )

    def _battle_payload(self):
        battle = self._completed_battle()
        # Establish the CAS-consumed result of a completed resolve.
        battle["winner_player_id"] = P1
        battle["defeated_player_id"] = P2
        battle["status"] = "COMPLETED"
        battle["ended_at"] = "2026-01-01T00:00:00+00:00"
        return battle


import threading as _t

# (kept lower to keep the top-of-file helpers collocated with the real ones)
