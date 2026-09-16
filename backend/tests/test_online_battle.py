"""Offline tests for online 1v1 battle creation + join-by-code.

Exercises ``POST /api/battles`` (ONLINE mode) and
``POST /api/battles/join`` with no database, no network and no live Supabase.
A stateful in-memory fake emulates the PostgREST/Postgres semantics the
endpoints rely on:

- INSERT of a WAITING ONLINE battle with a server-generated unique join code
  (unique ``battle_code`` index simulated with a 23505 raise).
- The ``public.join_online_waiting_battle(text)`` SECURITY DEFINER RPC, which
  atomically claims a waiting battle for the calling authenticated user
  (normalized code, rejects non-ONLINE/non-WAITING/already-filled rows, and
  rejects the creator joining their own battle). The schema change and RPC are
  documented in ``docs/migrations/13a-online-waiting-battle-migration.md`` and
  are presumed already applied; nothing here executes SQL.
- SELECT (equality + ``or_`` filters) and UPDATE for state initialization.

Run with:  backend/.venv/Scripts/python.exe -m unittest discover -s backend/tests
"""

import os

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_KEY", "test-key")

import re
import threading
import unittest
import uuid
from unittest import mock

from app import create_app
from postgrest.exceptions import APIError as PostgrestAPIError

P1 = "11111111-1111-1111-1111-111111111111"
P2 = "22222222-2222-2222-2222-222222222222"
P3 = "33333333-3333-3333-3333-333333333333"

BATTLE_CODE_FORMAT = r"^[A-HJ-NP-Z2-9]{4}$"
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _rpc_error(message, code="P0001"):
    return PostgrestAPIError(
        {"code": code, "message": message, "details": None, "hint": None}
    )


def waiting_state(map_key="valley", rounds=3):
    return {
        "version": 2,
        "waiting": True,
        "setup": {"map": map_key, "rounds": rounds},
        "damage_dealt": {},
    }


class Result:
    def __init__(self, data):
        self.data = data


class Store:
    """In-memory ``battle`` table + simulated join RPC."""

    def __init__(self):
        self.lock = threading.Lock()
        self.battles = {}
        self.last_rpc = None
        self.rpc_missing_player = False
        self.fail_update = False
        self.noop_update = False

    def next_id(self):
        return str(uuid.uuid4())

    def add(self, battle):
        self.battles[battle["battle_id"]] = battle

    def insert(self, payload):
        with self.lock:
            code = payload.get("battle_code")
            if code is not None:
                for battle in self.battles.values():
                    if battle.get("battle_code") == code:
                        raise _rpc_error(
                            'duplicate key value violates unique constraint '
                            '"battle_code_unique_idx"',
                            code="23505",
                        )
            battle = dict(payload)
            battle["battle_id"] = self.next_id()
            battle["created_at"] = "2026-09-01T00:00:00.000Z"
            for column in (
                "winner_player_id",
                "defeated_player_id",
                "started_at",
                "ended_at",
                "battle_code",
            ):
                if column not in battle:
                    battle[column] = None
            self.battles[battle["battle_id"]] = battle
            return [dict(battle)]

    def select(self, params):
        eq = params.get("eq", {})
        or_expr = params.get("or")
        columns = params.get("columns", "")
        col_list = [c.strip() for c in columns.split(",") if c.strip()]
        rows = []
        for battle in self.battles.values():
            if any(battle.get(key) != value for key, value in eq.items()):
                continue
            if or_expr and not self._or_matches(or_expr, battle):
                continue
            rows.append({c: battle[c] for c in col_list if c in battle})
        return rows

    def update(self, params):
        eq = params.get("eq", {})
        or_expr = params.get("or")
        payload = params.get("update", {})
        with self.lock:
            if self.fail_update:
                self.fail_update = False
                raise _rpc_error("nullable column", code="PGRST100")
            if self.noop_update:
                self.noop_update = False
                return []
            updated = []
            for battle in self.battles.values():
                if any(battle.get(key) != value for key, value in eq.items()):
                    continue
                if or_expr and not self._or_matches(or_expr, battle):
                    continue
                battle.update(payload)
                updated.append(dict(battle))
            return updated

    def rpc_join(self, fn, params, joiner):
        self.last_rpc = {"fn": fn, "params": dict(params)}
        code = params.get("p_battle_code")
        with self.lock:
            if self.rpc_missing_player:
                self.rpc_missing_player = False
                raise _rpc_error('insert or update on table "battle" violates '
                                 'foreign key constraint "battle_player2_id_fkey"',
                                 code="23503")
            match = None
            for battle in self.battles.values():
                if battle.get("battle_code") == code:
                    match = battle
                    break
            if match is None:
                raise _rpc_error("Battle not found or is no longer joinable")
            if (
                match["game_mode"] != "ONLINE"
                or match["status"] != "WAITING"
                or match["player2_id"] is not None
            ):
                raise _rpc_error("Battle not found or is no longer joinable")
            if str(match["player1_id"]) == str(joiner):
                raise _rpc_error("Battle not found or is no longer joinable")
            match["player2_id"] = joiner
            match["status"] = "IN_PROGRESS"
            match["current_turn"] = match["player1_id"]
            match["started_at"] = "2026-09-01T00:00:00.000Z"
            return [dict(match)]

    @staticmethod
    def _or_matches(or_expr, battle):
        for predicate in or_expr.split(","):
            parts = predicate.partition(".eq.")
            if len(parts) != 3 or not parts[1]:
                continue
            column, _, value = parts
            if battle.get(column) == value:
                return True
        return False


class FakeQuery:
    def __init__(self, store, mode, params):
        self.store = store
        self.mode = mode
        self.params = params

    def eq(self, column, value):
        self.params.setdefault("eq", {})[column] = value
        return self

    def or_(self, expression):
        self.params["or"] = expression
        return self

    def select(self, columns):
        self.params["columns"] = columns
        return self

    def update(self, data):
        self.params["update"] = data
        return self

    def insert(self, payload):
        self.params["mode"] = "insert"
        self.params["insert"] = payload
        return self

    def execute(self):
        if self.params.get("mode") == "insert":
            return Result(self.store.insert(self.params["insert"]))
        if self.mode == "select":
            return Result(self.store.select(self.params))
        return Result(self.store.update(self.params))


class FakeTable:
    def __init__(self, store):
        self.store = store

    def select(self, columns):
        return FakeQuery(self.store, "select", {"columns": columns})

    def update(self, data):
        return FakeQuery(self.store, "update", {"update": data})

    def insert(self, payload):
        return FakeQuery(self.store, "insert", {"mode": "insert", "insert": payload})


class FakeRPC:
    def __init__(self, store, user_id, fn, params):
        self.store = store
        self.user_id = user_id
        self.fn = fn
        self.params = params

    def execute(self):
        return Result(self.store.rpc_join(self.fn, self.params, self.user_id))


class FakeClient:
    def __init__(self, store, user_id):
        self.store = store
        self.user_id = user_id

    def table(self, table_name):
        return FakeTable(self.store)

    def rpc(self, fn, params=None):
        return FakeRPC(self.store, self.user_id, fn, params or {})


class FakeAuth:
    def __init__(self, user_id):
        self.user_id = user_id

    def get_user(self, jwt=None):
        return {"user": {"id": self.user_id}}


class FakeSupabase:
    def __init__(self, user_id):
        self.auth = FakeAuth(user_id)


class OnlineBattleTests(unittest.TestCase):
    def setUp(self):
        self.store = Store()
        self.token = "test-access-token"
        self._use_user(P1)
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def _use_user(self, user_id):
        auth_patcher = mock.patch(
            "app.auth.get_supabase", return_value=FakeSupabase(user_id)
        )
        client_patcher = mock.patch(
            "app.battle.get_authenticated_client",
            return_value=FakeClient(self.store, user_id),
        )
        auth_patcher.start()
        client_patcher.start()
        self.addCleanup(auth_patcher.stop)
        self.addCleanup(client_patcher.stop)

    def _headers(self, token=None):
        return {"Authorization": f"Bearer {token or self.token}"}

    def _create(self, body=None, headers=None):
        return self.client.post(
            "/api/battles",
            json=body if body is not None else {"game_mode": "ONLINE"},
            headers=self._headers() if headers is None else headers,
        )

    def _join(self, body=None, headers=None):
        return self.client.post(
            "/api/battles/join",
            json=body,
            headers=self._headers() if headers is None else headers,
        )

    def _get(self, battle_id, headers=None):
        return self.client.get(
            f"/api/battles/{battle_id}",
            headers=self._headers() if headers is None else headers,
        )

    def _seed_waiting(self, code="A234", map_key="valley", rounds=3, player1=P1):
        battle = {
            "battle_id": str(uuid.uuid4()),
            "player1_id": player1,
            "player2_id": None,
            "winner_player_id": None,
            "defeated_player_id": None,
            "current_turn": player1,
            "game_mode": "ONLINE",
            "status": "WAITING",
            "battle_state": waiting_state(map_key=map_key, rounds=rounds),
            "battle_code": code,
            "created_at": "2026-09-01T00:00:00.000Z",
            "started_at": None,
            "ended_at": None,
        }
        self.store.add(battle)
        return battle

    # ---- create ---------------------------------------------------------

    def test_online_create_requires_auth(self):
        response = self._create(headers={})
        self.assertEqual(response.status_code, 401)

    def test_online_create_waiting(self):
        response = self._create()
        self.assertEqual(response.status_code, 201)

        battle = response.get_json()["battle"]
        self.assertEqual(battle["player1_id"], P1)
        self.assertIsNone(battle["player2_id"])
        self.assertEqual(battle["game_mode"], "ONLINE")
        self.assertEqual(battle["status"], "WAITING")
        self.assertEqual(battle["current_turn"], P1)
        self.assertIsNone(battle["winner_player_id"])
        self.assertIsNone(battle["defeated_player_id"])
        self.assertIsNone(battle["started_at"])
        self.assertIsNone(battle["ended_at"])
        self.assertTrue(battle["battle_code"])

        stored = self.store.battles[battle["battle_id"]]
        self.assertEqual(stored["player2_id"], None)
        self.assertEqual(stored["status"], "WAITING")

    def test_online_create_code_uses_server_alphabet(self):
        for _ in range(20):
            response = self._create()
            code = response.get_json()["battle"]["battle_code"]
            self.assertIsInstance(code, str)
            self.assertEqual(len(code), 4)
            self.assertRegex(code, BATTLE_CODE_FORMAT)
            self.assertEqual(set(code), set(code) & set(ALPHABET))
            self.assertNotIn("0", code)
            self.assertNotIn("1", code)
            self.assertNotIn("I", code)
            self.assertNotIn("O", code)

    def test_online_create_default_placeholder(self):
        response = self._create()
        battle = response.get_json()["battle"]
        self.assertEqual(battle["battle_state"]["version"], 2)
        self.assertIs(battle["battle_state"]["waiting"], True)
        self.assertEqual(battle["battle_state"]["setup"]["map"], "dustlands")
        self.assertEqual(battle["battle_state"]["setup"]["rounds"], 1)
        self.assertEqual(battle["battle_state"]["damage_dealt"], {})

    def test_online_create_stores_chosen_map_rounds_in_placeholder(self):
        response = self._create(body={"game_mode": "ONLINE", "map": "valley", "rounds": 3})
        self.assertEqual(response.status_code, 201)
        battle = response.get_json()["battle"]
        self.assertEqual(battle["battle_state"]["setup"]["map"], "valley")
        self.assertEqual(battle["battle_state"]["setup"]["rounds"], 3)

    def test_online_create_never_accepts_client_player_ids(self):
        response = self._create(
            body={"game_mode": "ONLINE", "player1_id": P2, "player2_id": P3}
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json()["error"], "player1_id must not be supplied by the client"
        )

        response = self._create(body={"game_mode": "ONLINE", "player2_id": P2})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.get_json()["error"],
            "player2_id must not be supplied for ONLINE battles",
        )

    def test_online_create_collision_retries_with_fresh_code(self):
        self._seed_waiting(code="AAAA")
        with mock.patch(
            "app.battle._generate_battle_code", side_effect=["AAAA", "BBBB"]
        ):
            response = self._create()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["battle"]["battle_code"], "BBBB")
        codes = [b["battle_code"] for b in self.store.battles.values()]
        self.assertEqual(sorted(codes), ["AAAA", "BBBB"])

    def test_online_create_collision_exhaustion_returns_500(self):
        self._seed_waiting(code="AAAA")
        with mock.patch("app.battle._generate_battle_code", return_value="AAAA"):
            response = self._create()
        self.assertEqual(response.status_code, 500)

    def test_local_and_lan_create_unaffected(self):
        for mode in ("LOCAL", "LAN"):
            self.store = Store()
            self._use_user(P1)
            response = self._create(body={"game_mode": mode, "player2_id": P2})
            self.assertEqual(response.status_code, 201)
            battle = response.get_json()["battle"]
            self.assertEqual(battle["game_mode"], mode)
            self.assertEqual(battle["status"], "IN_PROGRESS")
            self.assertEqual(battle["player2_id"], P2)
            self.assertEqual(battle["current_turn"], P1)
            self.assertIsNone(battle["battle_code"])
            state = battle["battle_state"]
            self.assertEqual(state["version"], 2)
            self.assertIn(P1, state["setup"]["players"])
            self.assertIn(P2, state["setup"]["players"])
            self.assertEqual(state["setup"]["players"][P1]["health"], 100)
            self.assertEqual(state["setup"]["players"][P2]["health"], 100)

    # ---- join: validation and auth -------------------------------------

    def test_join_requires_auth(self):
        response = self._join(body={"battle_code": "A234"}, headers={})
        self.assertEqual(response.status_code, 401)

    def test_join_requires_battle_code(self):
        self._seed_waiting()
        for body in (None, {}, {"battle_code": 1234}, {"battle_code": None}, ""):
            response = self._join(body=body)
            self.assertEqual(response.status_code, 400)

    def test_join_rejects_invalid_codes(self):
        self._seed_waiting()
        for bad in ("1234", "abc", "ABC", "ABCDE", "A0BC", "AIJK", "AB*D", " a2 4 "):
            response = self._join(body={"battle_code": bad})
            self.assertEqual(response.status_code, 400)
            self.assertIn("valid 4-character code", response.get_json()["error"])

    # ---- join: success --------------------------------------------------

    def test_join_normalizes_code_and_claims_battle(self):
        seeded = self._seed_waiting(code="A234")
        self._use_user(P2)

        response = self._join(body={"battle_code": "  a234 \n"})
        self.assertEqual(response.status_code, 200)

        self.assertEqual(
            self.store.last_rpc,
            {"fn": "join_online_waiting_battle", "params": {"p_battle_code": "A234"}},
        )

        battle = response.get_json()["battle"]
        self.assertEqual(battle["battle_id"], seeded["battle_id"])
        self.assertEqual(battle["player1_id"], P1)
        self.assertEqual(battle["player2_id"], P2)
        self.assertEqual(battle["game_mode"], "ONLINE")
        self.assertEqual(battle["status"], "IN_PROGRESS")
        self.assertEqual(battle["current_turn"], P1)
        self.assertEqual(battle["battle_code"], "A234")
        self.assertIsNotNone(battle["started_at"])
        self.assertIsNone(battle["winner_player_id"])
        self.assertIsNone(battle["defeated_player_id"])
        self.assertIsNone(battle["ended_at"])

        state = battle["battle_state"]
        self.assertEqual(state["version"], 2)
        self.assertEqual(state["setup"]["map"], "valley")
        self.assertEqual(state["setup"]["max_rounds"], 3)
        self.assertIn(P1, state["setup"]["players"])
        self.assertIn(P2, state["setup"]["players"])
        self.assertEqual(state["setup"]["players"][P1]["health"], 100)
        self.assertEqual(state["setup"]["players"][P2]["health"], 100)
        self.assertEqual(state["setup"]["scores"], {P1: 0, P2: 0})

    def test_join_builds_setup_from_stored_rounds_and_default_map(self):
        seeded = self._seed_waiting(code="A234", map_key="dustlands", rounds=1)
        self._use_user(P2)

        response = self._join(body={"battle_code": "A234"})
        self.assertEqual(response.status_code, 200)
        battle = response.get_json()["battle"]
        self.assertEqual(battle["battle_id"], seeded["battle_id"])
        self.assertEqual(battle["battle_state"]["setup"]["map"], "dustlands")
        self.assertEqual(battle["battle_state"]["setup"]["max_rounds"], 1)

    # ---- join: failure cases -------------------------------------------

    def test_join_unknown_code_404(self):
        self._use_user(P2)
        response = self._join(body={"battle_code": "ZZZZ"})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.get_json()["error"], "Battle not found or is no longer joinable"
        )

    def test_join_player_profile_missing_404(self):
        self._seed_waiting(code="A234")
        self._use_user(P2)
        self.store.rpc_missing_player = True
        response = self._join(body={"battle_code": "A234"})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()["error"], "Player not found")

    def test_join_creator_cannot_join_own_battle_404(self):
        self._seed_waiting(code="A234")
        response = self._join(body={"battle_code": "A234"})
        self.assertEqual(response.status_code, 404)

    def test_join_double_join_second_rejected_404(self):
        self._seed_waiting(code="A234")
        self._use_user(P2)
        first = self._join(body={"battle_code": "A234"})
        self.assertEqual(first.status_code, 200)

        self._use_user(P3)
        second = self._join(body={"battle_code": "A234"})
        self.assertEqual(second.status_code, 404)
        self.assertEqual(
            second.get_json()["error"], "Battle not found or is no longer joinable"
        )
        self.assertEqual(self.store.battles[first.get_json()["battle"]["battle_id"]]["player2_id"], P2)

    def test_join_non_online_battle_404(self):
        lan = self._seed_waiting(code="A234")
        lan["game_mode"] = "LAN"
        lan["status"] = "IN_PROGRESS"
        lan["player2_id"] = P3
        self._use_user(P2)
        response = self._join(body={"battle_code": "A234"})
        self.assertEqual(response.status_code, 404)

    def test_join_setup_init_update_failure_500(self):
        self._seed_waiting(code="A234")
        self._use_user(P2)
        self.store.fail_update = True
        response = self._join(body={"battle_code": "A234"})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.get_json()["error"], "Battle could not be initialized")

    def test_join_setup_init_no_rows_404(self):
        self._seed_waiting(code="A234")
        self._use_user(P2)
        self.store.noop_update = True
        response = self._join(body={"battle_code": "A234"})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()["error"], "Battle not found")

    # ---- get ------------------------------------------------------------

    def test_get_waiting_battle_as_creator(self):
        seeded = self._seed_waiting(code="A234")
        response = self._get(seeded["battle_id"])
        self.assertEqual(response.status_code, 200)
        battle = response.get_json()["battle"]
        self.assertEqual(battle["status"], "WAITING")
        self.assertEqual(battle["game_mode"], "ONLINE")
        self.assertEqual(battle["player1_id"], P1)
        self.assertEqual(battle["battle_code"], "A234")

    def test_get_joined_battle_as_joiner(self):
        seeded = self._seed_waiting(code="A234")
        join_response = self._join(body={"battle_code": "A234"})
        self.assertEqual(join_response.status_code, 404)  # P1 cannot join own battle

        self._use_user(P2)
        joined = self._join(body={"battle_code": "A234"})
        self.assertEqual(joined.status_code, 200)

        response = self._get(joined.get_json()["battle"]["battle_id"])
        self.assertEqual(response.status_code, 200)
        battle = response.get_json()["battle"]
        self.assertEqual(battle["battle_id"], seeded["battle_id"])
        self.assertEqual(battle["player2_id"], P2)
        self.assertEqual(battle["status"], "IN_PROGRESS")

    def test_get_nonexistent_battle_404(self):
        response = self._get(str(uuid.uuid4()))
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()