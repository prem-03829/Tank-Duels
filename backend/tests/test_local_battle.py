"""Offline tests for authenticated same-device history persistence.

Exercises ``POST /api/local-battles`` (create + dedup) and
``GET /api/local-battles`` with no database, no network and no live Supabase:
a stateful in-memory fake emulates the PostgREST/Postgres semantics the
endpoints rely on (SELECT with equality/gte filters + ordering, and INSERT).

Scenario context (db.md lines 318-419):

- ``public.local_battle`` rows are owned by an authenticated ``player_id`` (the
  JWT subject) that is NEVER accepted from the client.
- ``player1_name``/``player2_name`` are name snapshots; ``winner`` is
  PLAYER1/PLAYER2; scores are non-negative; ``rounds >= 1``.
- These rows never touch ``player_statistics`` or ``public.battle``.
- ``created_at == ended_at`` (a single server timestamp) satisfies the
  database's ``ended_at >= created_at`` constraint.
- A duplicate POST returns the existing row (200) instead of inserting again.

Run with:  backend/.venv/Scripts/python.exe -m unittest discover -s backend/tests
"""

import os

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_KEY", "test-key")

import threading
import unittest
from unittest import mock

from app import create_app

PLAYER = "11111111-1111-1111-1111-111111111111"
OTHER = "22222222-2222-2222-2222-222222222222"

VALID_PAYLOAD = {
    "player1_name": "Player One",
    "player2_name": "Player Two",
    "winner": "PLAYER1",
    "player1_score": 3,
    "player2_score": 1,
    "map": "dustlands",
    "rounds": 3,
}


class Result:
    def __init__(self, data):
        self.data = data


class Store:
    """In-memory ``local_battle`` table with SELECT/INSERT semantics."""

    def __init__(self):
        self.lock = threading.Lock()
        self.rows = {}
        self.seq = 0
        self.insert_count = 0

    def next_id(self):
        self.seq += 1
        return f"local-{self.seq:08d}-00000000-0000-0000-0000-000000000000"

    def select(self, params):
        eq = params.get("eq", {})
        gte = params.get("gte", {})
        columns = params.get("columns", "")
        col_list = [c.strip() for c in columns.split(",") if c.strip()]
        order_desc = params.get("order_desc", False)
        with self.lock:
            rows = [
                {c: row[c] for c in col_list if c in row}
                for row in self.rows.values()
                if all(row.get(k) == v for k, v in eq.items())
                and all(row.get(k) >= v for k, v in gte.items())
            ]
        rows.sort(key=lambda r: r.get("created_at", ""), reverse=order_desc)
        return rows

    def insert(self, payload):
        row = dict(payload)
        row["local_battle_id"] = self.next_id()
        with self.lock:
            self.rows[row["local_battle_id"]] = row
            self.insert_count += 1
        return [dict(row)]


class Query:
    def __init__(self, store, params):
        self.store = store
        self.params = params

    def eq(self, column, value):
        self.params.setdefault("eq", {})[column] = value
        return self

    def gte(self, column, value):
        self.params.setdefault("gte", {})[column] = value
        return self

    def order(self, column, desc=False):
        self.params["order_column"] = column
        self.params["order_desc"] = bool(desc)
        return self

    def select(self, columns):
        self.params["mode"] = "select"
        self.params["columns"] = columns
        return self

    def insert(self, payload):
        self.params["mode"] = "insert"
        self.params["insert"] = payload
        return self

    def execute(self):
        if self.params.get("mode") == "select":
            return Result(self.store.select(self.params))
        return Result(self.store.insert(self.params["insert"]))


class Table:
    def __init__(self, store):
        self.store = store

    def select(self, columns):
        return Query(self.store, {"mode": "select", "columns": columns})

    def insert(self, payload):
        return Query(self.store, {"mode": "insert", "insert": payload})


class Client:
    def __init__(self, store):
        self.store = store

    def table(self, table_name):
        return Table(self.store)


class Auth:
    def __init__(self, user_id):
        self.user_id = user_id

    def get_user(self, jwt=None):
        return {"user": {"id": self.user_id}}


class Supabase:
    def __init__(self, user_id):
        self.auth = Auth(user_id)


class LocalBattleEndpointTests(unittest.TestCase):
    def setUp(self):
        self.store = Store()
        self.token = "test-access-token"

        auth_patcher = mock.patch("app.auth.get_supabase", return_value=Supabase(PLAYER))
        client_patcher = mock.patch(
            "app.local_battle.get_authenticated_client", return_value=Client(self.store)
        )
        auth_patcher.start()
        client_patcher.start()
        self.addCleanup(auth_patcher.stop)
        self.addCleanup(client_patcher.stop)

        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def _headers(self, token=None):
        return {"Authorization": f"Bearer {token or self.token}"}

    def _post(self, body=None, headers=None):
        return self.client.post(
            "/api/local-battles",
            json=body,
            headers=self._headers() if headers is None else headers,
        )

    def _get(self, headers=None):
        return self.client.get(
            "/api/local-battles",
            headers=self._headers() if headers is None else headers,
        )

    # ---- auth ----------------------------------------------------------

    def test_post_requires_auth(self):
        response = self._post(body=VALID_PAYLOAD, headers={})
        self.assertEqual(response.status_code, 401)

    def test_get_requires_auth(self):
        response = self._get(headers={})
        self.assertEqual(response.status_code, 401)

    # ---- POST validation ------------------------------------------------

    def test_post_rejects_client_supplied_player_id(self):
        body = dict(VALID_PAYLOAD, player_id=OTHER)
        response = self._post(body=body)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json()["error"], "player_id must not be supplied by the client"
        )

    def test_post_requires_names(self):
        for field in ("player1_name", "player2_name"):
            body = dict(VALID_PAYLOAD)
            body[field] = ""
            response = self._post(body=body)
            self.assertEqual(response.status_code, 400)

    def test_post_validates_winner(self):
        body = dict(VALID_PAYLOAD, winner="PLAYER3")
        response = self._post(body=body)
        self.assertEqual(response.status_code, 400)

    def test_post_validates_scores(self):
        for field in ("player1_score", "player2_score"):
            body = dict(VALID_PAYLOAD)
            body[field] = -1
            response = self._post(body=body)
            self.assertEqual(response.status_code, 400)

    def test_post_validates_rounds(self):
        body = dict(VALID_PAYLOAD, rounds=0)
        response = self._post(body=body)
        self.assertEqual(response.status_code, 400)

    # ---- POST create ----------------------------------------------------

    def test_post_creates_record(self):
        response = self._post(body=VALID_PAYLOAD)
        self.assertEqual(response.status_code, 201)

        payload = response.get_json()
        battle = payload["local_battle"]
        self.assertEqual(battle["player_id"], PLAYER)
        self.assertEqual(battle["player1_name"], "Player One")
        self.assertEqual(battle["player2_name"], "Player Two")
        self.assertEqual(battle["winner"], "PLAYER1")
        self.assertEqual(battle["player1_score"], 3)
        self.assertEqual(battle["player2_score"], 1)
        self.assertEqual(battle["map"], "dustlands")
        self.assertEqual(battle["rounds"], 3)
        self.assertEqual(battle["created_at"], battle["ended_at"])
        self.assertEqual(self.store.insert_count, 1)

    def test_post_does_not_touch_statistics_or_battles(self):
        response = self._post(body=VALID_PAYLOAD)
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("statistics", response.get_json())
        self.assertEqual(len(self.store.rows), 1)

    # ---- POST dedup -----------------------------------------------------

    def test_post_dedupes_identical_recent_match(self):
        first = self._post(body=VALID_PAYLOAD)
        second = self._post(body=VALID_PAYLOAD)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(self.store.insert_count, 1)
        self.assertEqual(
            first.get_json()["local_battle"]["local_battle_id"],
            second.get_json()["local_battle"]["local_battle_id"],
        )

    # ---- GET ------------------------------------------------------------

    def test_get_empty_history(self):
        response = self._get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"local_battles": []})

    def test_get_returns_only_own_records_newest_first(self):
        older = dict(VALID_PAYLOAD, created_at="2026-09-01T10:00:00+00:00",
                     ended_at="2026-09-01T10:00:00+00:00",
                     player_id=PLAYER, player1_name="Old Match")
        newer = dict(VALID_PAYLOAD, winner="PLAYER2", player1_name="New Match",
                     created_at="2026-09-15T10:00:00+00:00",
                     ended_at="2026-09-15T10:00:00+00:00",
                     player_id=PLAYER)
        other = dict(VALID_PAYLOAD, player1_name="Someone Else",
                     created_at="2026-09-10T10:00:00+00:00",
                     ended_at="2026-09-10T10:00:00+00:00",
                     player_id=OTHER)

        # Seed directly so ordering/timestamping does not depend on the clock.
        for row in (older, newer, other):
            self.store.insert(row)

        response = self._get()
        self.assertEqual(response.status_code, 200)
        battles = response.get_json()["local_battles"]
        self.assertEqual(len(battles), 2)
        self.assertEqual(battles[0]["player1_name"], "New Match")
        self.assertEqual(battles[1]["player1_name"], "Old Match")
        for battle in battles:
            self.assertEqual(battle["player_id"], PLAYER)


if __name__ == "__main__":
    unittest.main()