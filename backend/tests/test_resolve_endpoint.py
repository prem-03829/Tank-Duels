"""Offline endpoint tests for ``POST /api/battles/<battle_id>/actions/fire/resolve``.

No database, no network and no live Supabase: a stateful fake backend emulates
the PostgREST/Postgres semantics the endpoint relies on, most importantly the
atomic single-consumption guarantee of ``contains(battle_state, pending_fire)``
(JSONB ``@>`` in the UPDATE's WHERE clause).

One test also builds the *real* postgrest query builder offline and asserts the
exact filter parameters the resolve UPDATE produces, including
``battle_state=cs.{...}``.

Run with:  backend/.venv/Scripts/python.exe -m unittest discover -s backend/tests
"""

import os

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_KEY", "test-key")

import threading
import unittest
from unittest import mock

from app import create_app
from app.battle_setup import generate_setup

P1 = "11111111-1111-1111-1111-111111111111"
P2 = "22222222-2222-2222-2222-222222222222"
BATTLE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

TERRAIN_W = 640


def build_flat_state(max_rounds=3, health1=1, health2=40, map_key="dustlands", wind=0, seed=12345):
    heights = [100] * TERRAIN_W
    y = 100 - 14
    return {
        "version": 2,
        "setup": {
            "map": map_key,
            "seed": seed,
            "terrain": {"heights": heights},
            "players": {
                P1: {"x": 100.0, "y": float(y), "health": health1},
                P2: {"x": 30.0, "y": float(y), "health": health2},
            },
            "wind": wind,
            "round": 1,
            "max_rounds": max_rounds,
            "scores": {P1: 0, P2: 0},
        },
        "pending_fire": {"player_id": P1, "angle": 180, "power": 100},
    }


def build_battle(max_rounds=3, status="IN_PROGRESS", current_turn=P1, state=None):
    if state is None:
        state = build_flat_state(max_rounds=max_rounds)
    return {
        "battle_id": BATTLE_ID,
        "player1_id": P1,
        "player2_id": P2,
        "winner_player_id": None,
        "defeated_player_id": None,
        "current_turn": current_turn,
        "game_mode": "ONLINE",
        "status": status,
        "battle_state": state,
        "created_at": "2026-01-01T00:00:00.000Z",
        "started_at": "2026-01-01T00:00:00.000Z",
        "ended_at": None,
    }


class Result:
    def __init__(self, data):
        self.data = data


class FakeStore:
    """In-memory battles table with Postgres-like UPDATE/CAS semantics."""

    def __init__(self):
        self.lock = threading.Lock()
        self.battles = {}
        self.last_update_payload = None
        # Emulates public.battle BEFORE UPDATE trigger trg_set_battle_ended_at
        # (migration 13b): a COMPLETED transition that omits ended_at receives
        # a timestamp from the database clock instead of the Python/web-server
        # clock.
        self.ended_at_now = "2026-02-02T00:00:00+00:00"
        # Records rpc() invocations (migration 13c: record_battle_statistics).
        self.rpc_calls = []
        self.fail_rpc = False

    def add(self, battle):
        self.battles[battle["battle_id"]] = battle

    def select(self, params):
        eq = params.get("eq", {})
        or_expr = params.get("or")
        columns = params.get("columns", "")
        col_list = [c.strip() for c in columns.split(",") if c.strip()]
        rows = []
        for battle in self.battles.values():
            if "battle_id" in eq and battle["battle_id"] != eq["battle_id"]:
                continue
            if or_expr and not self._or_matches(or_expr, battle):
                continue
            row = {}
            for key in col_list:
                if key in battle:
                    row[key] = battle[key]
            rows.append(row)
        return rows

    def update(self, params):
        eq = params.get("eq", {})
        or_expr = params.get("or")
        contains = params.get("contains", {})
        payload = params.get("update", {})
        with self.lock:
            for battle_id, battle in self.battles.items():
                if "battle_id" in eq and battle["battle_id"] != eq["battle_id"]:
                    continue
                if eq.get("status") and battle["status"] != eq["status"]:
                    continue
                if eq.get("current_turn") and battle["current_turn"] != eq["current_turn"]:
                    continue
                if or_expr and not self._or_matches(or_expr, battle):
                    continue
                for column, wanted in contains.items():
                    stored = battle.get(column)
                    if stored is None or not _jsonb_contains(stored, wanted):
                        continue
                    battle.update(payload)
                    if "ended_at" not in payload and battle.get("status") == "COMPLETED":
                        battle["ended_at"] = self.ended_at_now
                    self.last_update_payload = payload
                    return [dict(battle)]
            return []

    @staticmethod
    def _or_matches(or_expr, battle):
        for predicate in or_expr.split(","):
            parts = predicate.partition(".eq.")
            if len(parts) != 3 or not parts[1]:
                continue
            column, _, value = parts
            if battle.get(column) == value:
                return True
        if or_expr.strip() == "":
            return True
        return False


def _jsonb_contains(container, wanted):
    if not isinstance(container, dict) or not isinstance(wanted, dict):
        return False
    return all(
        key in container and container[key] == value for key, value in wanted.items()
    )


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

    def contains(self, column, value):
        self.params.setdefault("contains", {})[column] = value
        return self

    def select(self, columns):
        self.params["columns"] = columns
        return self

    def update(self, data):
        self.params["update"] = data
        return self

    def execute(self):
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


class _FakeRpcQuery:
    def __init__(self, store, name, params):
        self.store = store
        self.name = name
        self.params = params

    def execute(self):
        self.store.rpc_calls.append((self.name, self.params))
        if self.store.fail_rpc:
            raise RuntimeError("statistics rpc failed")
        return Result([])


class FakeClient:
    def __init__(self, store):
        self.store = store

    def table(self, table_name):
        return FakeTable(self.store)

    def rpc(self, name, params):
        return _FakeRpcQuery(self.store, name, params)


class FakeAuth:
    def __init__(self, user_id):
        self.user_id = user_id

    def get_user(self, jwt=None):
        return {"user": {"id": self.user_id}}


class FakeSupabase:
    def __init__(self, user_id):
        self.auth = FakeAuth(user_id)


class ResolveEndpointTests(unittest.TestCase):
    def setUp(self):
        self.store = FakeStore()
        self.token = "test-access-token"

        auth_patcher = mock.patch(
            "app.auth.get_supabase", return_value=FakeSupabase(P1)
        )
        client_patcher = mock.patch(
            "app.battle.get_authenticated_client", return_value=FakeClient(self.store)
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

    def _resolve(self, battle=None, body=None, as_user=None):
        if battle is not None:
            self.store.add(battle)
        headers = self._headers()
        if as_user is not None:
            headers["Authorization"] = f"Bearer {self.token + as_user}"

        auth = FakeSupabase(as_user or P1)
        with mock.patch("app.auth.get_supabase", return_value=auth):
            return self.client.post(
                f"/api/battles/{BATTLE_ID}/actions/fire/resolve",
                json=body,
                headers=self._headers(),
            )

    def test_valid_resolve_consumes_pending_fire_and_switches_turn(self):
        battle = build_battle(max_rounds=5)
        response = self._resolve(battle=battle)

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIn("battle", payload)
        self.assertIn("shot", payload)

        battle_state = payload["battle"]["battle_state"]
        self.assertEqual(battle_state["version"], 2)
        self.assertNotIn("pending_fire", battle_state)
        self.assertEqual(battle_state["setup"]["round"], 2)
        self.assertEqual(payload["battle"]["current_turn"], P1)
        self.assertEqual(payload["shot"]["hit_type"], "tank")
        self.assertEqual(payload["shot"]["damage"], {P2: 40})
        self.assertEqual(payload["shot"]["impact"]["x"], 40.0)
        self.assertEqual(
            battle_state["setup"]["players"][P1]["health"], 100)
        self.assertEqual(
            battle_state["setup"]["players"][P2]["health"], 100)

        final = self.store.battles[BATTLE_ID]
        self.assertNotIn("pending_fire", final["battle_state"])
        self.assertEqual(final["current_turn"], P1)
        self.assertEqual(final["status"], "IN_PROGRESS")

    def test_update_payload_never_touches_control_columns_beyond_allowed(self):
        battle = build_battle(max_rounds=5)
        self._resolve(battle=battle)
        allowed = {"battle_state", "current_turn", "status", "winner_player_id",
                   "defeated_player_id"}
        self.assertLessEqual(set(self.store.last_update_payload), allowed)
        self.assertNotIn("pending_fire", self.store.last_update_payload["battle_state"])
        self.assertNotIn("ended_at", self.store.last_update_payload)

    def test_game_over_sets_winner_defeated_and_ended_at(self):
        battle = build_battle(max_rounds=1)
        response = self._resolve(battle=battle)

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["battle"]["status"], "COMPLETED")
        self.assertEqual(payload["battle"]["winner_player_id"], P1)
        self.assertEqual(payload["battle"]["defeated_player_id"], P2)
        self.assertIsInstance(payload["battle"]["ended_at"], str)
        self.assertEqual(payload["battle"]["current_turn"], P1)
        self.assertTrue(payload["shot"]["damage"])

        final = self.store.battles[BATTLE_ID]
        self.assertEqual(final["status"], "COMPLETED")
        self.assertEqual(final["winner_player_id"], P1)
        self.assertNotIn("pending_fire", final["battle_state"])

    def test_game_over_update_omits_ended_at_for_database_default(self):
        battle = build_battle(max_rounds=1)
        self._resolve(battle=battle)

        payload = self.store.last_update_payload
        self.assertEqual(payload["status"], "COMPLETED")
        self.assertIn("battle_state", payload)
        self.assertIn("winner_player_id", payload)
        self.assertIn("defeated_player_id", payload)
        self.assertNotIn("ended_at", payload)
        self.assertNotIn("current_turn", payload)

        final = self.store.battles[BATTLE_ID]
        self.assertEqual(final["ended_at"], self.store.ended_at_now)
        self.assertEqual(final["started_at"], battle["started_at"])

    def test_non_game_over_update_leaves_ended_at_untouched(self):
        battle = build_battle(max_rounds=5)
        response = self._resolve(battle=battle)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.store.battles[BATTLE_ID]["status"], "IN_PROGRESS")
        self.assertNotIn("ended_at", self.store.last_update_payload)
        self.assertIn("current_turn", self.store.last_update_payload)
        self.assertIn("battle_state", self.store.last_update_payload)

    def test_game_over_triggers_statistics_rpc_once(self):
        battle = build_battle(max_rounds=1)
        response = self._resolve(battle=battle)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.store.rpc_calls,
            [("record_battle_statistics", {"p_battle_id": BATTLE_ID})],
        )

    def test_valid_resolve_does_not_record_statistics(self):
        battle = build_battle(max_rounds=5)
        response = self._resolve(battle=battle)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.store.rpc_calls, [])

    def test_statistics_rpc_failure_keeps_resolve_200(self):
        battle = build_battle(max_rounds=1)
        self.store.fail_rpc = True
        response = self._resolve(battle=battle)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["battle"]["status"], "COMPLETED")
        self.assertEqual(len(self.store.rpc_calls), 1)

    def test_resolve_without_pending_fire_is_conflict(self):
        state = build_flat_state()
        state.pop("pending_fire")
        battle = build_battle(state=state)
        response = self._resolve(battle=battle)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["error"], "A shot is not in flight")

    def test_resolve_not_your_turn(self):
        battle = build_battle(current_turn=P2)
        response = self._resolve(battle=battle)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["error"], "Not your turn")

    def test_resolve_not_a_participant(self):
        battle = build_battle()
        auth = FakeSupabase("33333333-3333-3333-3333-333333333333")
        with mock.patch("app.auth.get_supabase", return_value=auth):
            self.store.add(battle)
            response = self.client.post(
                f"/api/battles/{BATTLE_ID}/actions/fire/resolve",
                headers={"Authorization": f"Bearer {self.token}"},
            )
        self.assertEqual(response.status_code, 404)

    def test_resolve_finished_battle(self):
        battle = build_battle(status="COMPLETED")
        response = self._resolve(battle=battle)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["error"], "Battle is not in progress")

    def test_resolve_pending_fire_player_mismatch(self):
        state = build_flat_state()
        state["pending_fire"] = {"player_id": P2, "angle": 180, "power": 100}
        battle = build_battle(state=state)
        response = self._resolve(battle=battle)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["error"], "Not your turn")

    def test_resolve_malformed_pending_fire(self):
        state = build_flat_state()
        state["pending_fire"] = {"player_id": P1, "angle": 999, "power": 100}
        battle = build_battle(state=state)
        response = self._resolve(battle=battle)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "Stored pending_fire is malformed")

    def test_resolve_rejects_control_field_body(self):
        battle = build_battle(max_rounds=5)
        response = self._resolve(battle=battle, body={"player_id": P2})
        self.assertEqual(response.status_code, 400)

    def test_resolve_rejects_any_body(self):
        battle = build_battle(max_rounds=5)
        response = self._resolve(battle=battle, body={"note": "anything"})
        self.assertEqual(response.status_code, 400)

    def test_resolve_invalid_battle_id(self):
        response = self.client.post(
            "/api/battles/not-a-uuid/actions/fire/resolve",
            headers=self._headers(),
        )
        self.assertEqual(response.status_code, 400)

    def test_double_resolve_second_is_conflict(self):
        battle = build_battle(max_rounds=5)
        first = self._resolve(battle=battle)
        self.assertEqual(first.status_code, 200)
        second = self._resolve()
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.get_json()["error"], "A shot is not in flight")

    def test_cas_consumes_pending_fire_exactly_once(self):
        battle = build_battle(max_rounds=5)
        self.store.add(battle)
        pending = battle["battle_state"]["pending_fire"]
        updates_a = {"battle_state": {"version": 2}, "current_turn": P2}
        updates_b = {"battle_state": {"version": 9}, "current_turn": P1}

        qa = FakeQuery(self.store, "update", {"update": updates_a})
        qa.eq("battle_id", BATTLE_ID).eq("status", "IN_PROGRESS").eq(
            "current_turn", P1
        ).or_(f"player1_id.eq.{P1},player2_id.eq.{P1}").contains(
            "battle_state", {"pending_fire": pending}
        )
        qb = FakeQuery(self.store, "update", {"update": updates_b})
        qb.eq("battle_id", BATTLE_ID).eq("status", "IN_PROGRESS").eq(
            "current_turn", P1
        ).or_(f"player1_id.eq.{P1},player2_id.eq.{P1}").contains(
            "battle_state", {"pending_fire": pending}
        )

        first = qa.execute().data
        second = qb.execute().data
        self.assertEqual(len(first), 1)
        self.assertEqual(len(second), 0)
        self.assertNotIn(
            "pending_fire", self.store.battles[BATTLE_ID]["battle_state"]
        )

    def test_contains_filter_builds_jsonb_containment_query(self):
        import httpx
        from httpx import Headers, QueryParams, URL
        from postgrest.base_request_builder import RequestConfig
        from postgrest._async.request_builder import AsyncFilterRequestBuilder

        pending = {"player_id": P1, "angle": 45, "power": 50}
        config = RequestConfig(
            session=httpx.AsyncClient(),
            path=URL("http://localhost/rest/v1/battle"),
            http_method="PATCH",
            headers=Headers(),
            params=QueryParams(),
            auth=None,
            json={},
        )
        builder = AsyncFilterRequestBuilder(config)
        builder.eq("battle_id", BATTLE_ID).eq("status", "IN_PROGRESS").eq(
            "current_turn", P1
        ).or_(f"player1_id.eq.{P1},player2_id.eq.{P1}").contains(
            "battle_state", {"pending_fire": pending}
        )
        params = dict(builder.request.params.multi_items())
        self.assertEqual(params["battle_id"], f"eq.{BATTLE_ID}")
        self.assertEqual(params["status"], "eq.IN_PROGRESS")
        self.assertEqual(params["current_turn"], f"eq.{P1}")
        expected_prefix = 'cs.{"pending_fire": {"player_id": "'
        self.assertTrue(params["battle_state"].startswith(expected_prefix))
        self.assertIn(f'"angle": 45', params["battle_state"])
        self.assertIn(f'"power": 50}}', params["battle_state"])


if __name__ == "__main__":
    unittest.main()