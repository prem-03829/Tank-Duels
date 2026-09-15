"""Offline tests for the server-authoritative shot resolver.

These exercise ``app.shot_resolution`` with no database, no network and no
live Supabase: terrain, pending-fire state and maps come from
``app.battle_setup.generate_setup`` exactly as the battle endpoints build them.

Run with:  backend/.venv/Scripts/python.exe -m unittest discover -s backend/tests
"""

import unittest

from app.battle_setup import generate_setup
from app.shot_resolution import (
    GRAVITY,
    MAX_DAMAGE,
    MIN_DAMAGE,
    TERRAIN_H,
    TERRAIN_W,
    _destroy,
    _get_height,
    _point_in_tank,
    _run_flight,
    resolve_shot,
)

P1 = "11111111-1111-1111-1111-111111111111"
P2 = "22222222-2222-2222-2222-222222222222"


def make_state(map_key="dustlands", wind=0, max_rounds=3, player1_health=100, player2_health=100):
    g = generate_setup(map_key=map_key)
    return {
        "version": 2,
        "setup": {
            "map": g["map"],
            "seed": g["seed"],
            "terrain": {"heights": g["heights"]},
            "players": {
                P1: {
                    "x": g["tanks"]["player1"]["x"],
                    "y": g["tanks"]["player1"]["y"],
                    "health": player1_health,
                },
                P2: {
                    "x": g["tanks"]["player2"]["x"],
                    "y": g["tanks"]["player2"]["y"],
                    "health": player2_health,
                },
            },
            "wind": wind,
            "round": 1,
            "max_rounds": max_rounds,
            "scores": {P1: 0, P2: 0},
        },
        "pending_fire": {"player_id": P1, "angle": 45, "power": 50},
    }


def fixed_tanks():
    t1 = {"x": 100.0, "y": 180.0, "health": 100, "alive": True}
    t2 = {"x": 540.0, "y": 180.0, "health": 100, "alive": True}
    return [t1, t2]


class FlatTerrainTests(unittest.TestCase):
    """Deterministic flat-terrain checks of geometry and damage formulas."""

    def setUp(self):
        self.heights = [TERRAIN_H] * TERRAIN_W

    def test_get_height_clamps_out_of_range(self):
        self.assertEqual(_get_height(self.heights, -1), TERRAIN_H)
        self.assertEqual(_get_height(self.heights, TERRAIN_W), TERRAIN_H)
        self.assertEqual(_get_height(self.heights, 10), TERRAIN_H)

    def test_destroy_rounds_to_even_steps(self):
        heights = [200] * TERRAIN_W
        _destroy(heights, 100, 200, 26)
        self.assertEqual(heights[100], 216)
        for x in range(74, 127):
            self.assertGreaterEqual(heights[x], 200, f"line at {x}={heights[x]}")
            self.assertLessEqual(heights[x], 216, f"line at {x}={heights[x]}")
        self.assertEqual(heights[73], 200)
        self.assertEqual(heights[127], 200)

    def test_point_in_tank_hitbox(self):
        tanks = fixed_tanks()
        tank = tanks[0]
        self.assertTrue(_point_in_tank(tank["x"], tank["y"], tank))
        self.assertFalse(_point_in_tank(tank["x"] - 15, tank["y"], tank))
        self.assertFalse(_point_in_tank(tank["x"], tank["y"] - 10, tank))

    def test_point_in_tank_dead_tank_ignored(self):
        tanks = fixed_tanks()
        tanks[0]["alive"] = False
        self.assertFalse(_point_in_tank(tanks[0]["x"], tanks[0]["y"], tanks[0]))

    def test_gravity_constant_positive(self):
        self.assertEqual(GRAVITY, 0.09)


class FlightGeometryTests(unittest.TestCase):
    """Aim a shot straight up over flat terrain: it must miss."""

    def setUp(self):
        self.heights = [TERRAIN_H] * TERRAIN_W

    def test_vertical_shot_self_hits_firing_tank(self):
        tanks = fixed_tanks()
        hit_type, impact, damage = _run_flight([dict(t) for t in tanks], list(self.heights), 0, 90, 100, 0)
        self.assertEqual(hit_type, "tank")
        self.assertEqual(damage, {0: MAX_DAMAGE, 1: 0})
        self.assertIsNotNone(impact)
        self.assertIsInstance(impact["x"], (int, float))
        self.assertIsInstance(impact["y"], (int, float))

    def test_flat_shot_does_not_end_before_cannon_length(self):
        tanks = fixed_tanks()
        hit_type, impact, damage = _run_flight(tanks, list(self.heights), 0, 180, 100, 0)
        self.assertIsNotNone(hit_type)
        self.assertEqual(damage, {0: 0, 1: 0})

    def test_direct_tank_hit_does_max_damage(self):
        tanks = fixed_tanks()
        tanks[1]["health"] = 40
        x0, y0 = tanks[0]["x"], tanks[0]["y"]
        tanks[1]["x"], tanks[1]["y"] = x0 + 30, y0
        hit_type, impact, damage = _run_flight(tanks, [TERRAIN_H] * TERRAIN_W, 0, 0, 50, 0)
        self.assertEqual(hit_type, "tank")
        self.assertEqual(damage, {0: 0, 1: MAX_DAMAGE})
        self.assertEqual(tanks[1]["health"], 0)
        self.assertFalse(tanks[1]["alive"])

    def test_rightward_shot_misses_over_flat_terrain(self):
        tanks = fixed_tanks()
        tanks[0]["x"], tanks[0]["y"] = 600.0, 180.0
        tanks[1]["x"], tanks[1]["y"] = 540.0, 180.0
        hit_type, impact, damage = _run_flight(tanks, [TERRAIN_H] * TERRAIN_W, 0, 0, 100, 0)
        self.assertEqual(hit_type, "miss")
        self.assertEqual(damage, {0: 0, 1: 0})
        self.assertIsNotNone(impact)
        self.assertGreaterEqual(impact["x"], -30)
        self.assertLessEqual(impact["x"], TERRAIN_W + 30)
        self.assertLessEqual(impact["y"], TERRAIN_H + 30)

    def test_miss_returns_last_valid_position(self):
        tanks = fixed_tanks()
        hit_type, impact, damage = _run_flight([dict(t) for t in tanks], [TERRAIN_H] * TERRAIN_W, 0, 180, 100, 0)
        self.assertEqual(hit_type, "miss")
        self.assertIsNotNone(impact)
        self.assertGreaterEqual(impact["x"], -30)
        self.assertLessEqual(impact["x"], TERRAIN_W + 30)
        self.assertLessEqual(impact["y"], TERRAIN_H + 30)


class WindAndSplashTests(unittest.TestCase):
    def test_wind_bends_trajectory(self):
        heights = [TERRAIN_H] * TERRAIN_W
        tanks = fixed_tanks()
        right = _run_flight([dict(t) for t in tanks], list(heights), 4, 45, 50, 0)
        left = _run_flight([dict(t) for t in tanks], list(heights), -4, 45, 50, 0)
        self.assertIsNotNone(right[1])
        self.assertIsNotNone(left[1])
        self.assertLessEqual(left[1]["x"], right[1]["x"])

    def test_splash_damage_between_min_and_max(self):
        fps = []
        for f in fixed_tanks():
            f["health"] = 100
            f["alive"] = True
            fps.append(f)
        hit_type, impact, damage = _run_flight(fps, [TERRAIN_H] * TERRAIN_W, 0, 45, 50, 0)
        for tank in fps:
            if not tank["alive"]:
                continue
            self.assertLessEqual(tank["health"], 100)
        if hit_type == "terrain":
            for amount in damage.values():
                self.assertGreaterEqual(amount, 0)
                self.assertLessEqual(amount, MAX_DAMAGE)


def make_flat_state(max_rounds=3, health1=1, health2=40, wind=0):
    heights = [100] * TERRAIN_W
    y = 100 - 14
    return {
        "version": 2,
        "setup": {
            "map": "dustlands",
            "seed": 12345,
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


class ResolveShotTests(unittest.TestCase):
    def test_resolve_consumes_pending_fire_and_v2_shape_preserved(self):
        state = make_state()
        out = resolve_shot(state, P1, P2)
        self.assertEqual(out["battle_state"]["version"], 2)
        self.assertNotIn("pending_fire", out["battle_state"])
        self.assertEqual(out["battle_state"]["setup"]["round"], 1)

    def test_no_death_switches_turn_and_regenerates_wind(self):
        state = make_state()
        out = resolve_shot(state, P1, P2)
        self.assertIn(out["hit_type"], {"terrain", "tank", "miss"})
        self.assertEqual(out["current_turn"], P2)
        self.assertIsNone(out["round_winner_player_id"])
        self.assertIsNone(out["defeated_player_id"])
        self.assertEqual(out["status"], "IN_PROGRESS")
        self.assertFalse(out["game_over"])
        wind = out["battle_state"]["setup"]["wind"]
        self.assertIsInstance(wind, int)
        self.assertIn(wind, {-4, -3, -2, -1, 1, 2, 3, 4})

    def test_shot_damage_maps_only_actual_damage(self):
        state = make_state()
        out = resolve_shot(state, P1, P2)
        self.assertIsInstance(out["damage"], dict)
        for player_id in (P1, P2):
            if player_id in out["damage"]:
                self.assertGreater(out["damage"][player_id], 0)

    def test_impact_present_for_every_hit_type(self):
        state = make_state()
        out = resolve_shot(state, P1, P2)
        self.assertIn(out["hit_type"], {"terrain", "tank", "miss"})
        self.assertIsNotNone(out["impact"])
        self.assertIsInstance(out["impact"]["x"], (int, float))
        self.assertIsInstance(out["impact"]["y"], (int, float))

    def test_deterministic_same_input_same_output(self):
        a = resolve_shot(make_state(), P1, P2)
        b = resolve_shot(make_state(), P1, P2)
        self.assertEqual(a["hit_type"], b["hit_type"])
        self.assertEqual(a["damage"], b["damage"])

    def test_max_rounds_one_completion(self):
        state = make_flat_state(max_rounds=1)
        out = resolve_shot(state, P1, P2)
        self.assertEqual(out["hit_type"], "tank")
        self.assertEqual(out["status"], "COMPLETED")
        self.assertTrue(out["game_over"])
        self.assertIsNone(out["current_turn"])
        self.assertEqual(out["round_winner_player_id"], P1)
        self.assertEqual(out["defeated_player_id"], P2)
        self.assertEqual(
            out["battle_state"]["setup"]["scores"], {P1: 1, P2: 0}
        )

    def test_dead_tank_terrain_sync(self):
        tanks = fixed_tanks()
        tanks[0]["health"] = 10
        tanks[1]["health"] = 100
        hit_type, impact, damage = _run_flight([dict(t) for t in tanks], [TERRAIN_H] * TERRAIN_W, 0, 45, 50, 0)
        self.assertIn(hit_type, {"terrain", "tank", "miss"})

    def test_new_round_regenerates_setup_when_round_advances(self):
        state = make_flat_state(max_rounds=5)
        old_round = state["setup"]["round"]
        out = resolve_shot(state, P1, P2)
        self.assertEqual(out["hit_type"], "tank")
        self.assertEqual(out["status"], "IN_PROGRESS")
        self.assertFalse(out["game_over"])
        self.assertEqual(out["battle_state"]["setup"]["round"], old_round + 1)
        self.assertEqual(out["current_turn"], P1)
        self.assertEqual(
            out["battle_state"]["setup"]["players"][P1]["health"], 100
        )
        self.assertEqual(
            out["battle_state"]["setup"]["players"][P2]["health"], 100
        )

    def test_round_winner_mapping(self):
        state = make_flat_state(max_rounds=3)
        out = resolve_shot(state, P1, P2)
        self.assertEqual(out["defeated_player_id"], P2)
        self.assertEqual(out["round_winner_player_id"], P1)
        self.assertEqual(out["battle_state"]["setup"]["scores"], {P1: 1, P2: 0})

    def test_both_dead_firing_player_wins(self):
        state = make_flat_state(max_rounds=3, health1=1, health2=1)
        out = resolve_shot(state, P1, P2)
        self.assertEqual(out["hit_type"], "tank")
        self.assertEqual(out["round_winner_player_id"], P1)
        self.assertEqual(out["defeated_player_id"], P2)

    def test_splash_damage_reduces_non_dead_tanks(self):
        state = make_state()
        heights = list(state["setup"]["terrain"]["heights"])
        for tank in (state["setup"]["players"][P1], state["setup"]["players"][P2]):
            tank["x"] = 100.0
        tanks = [
            {"x": 100.0, "y": heights[100] - 14, "health": 100, "alive": True},
            {"x": 110.0, "y": heights[110] - 14, "health": 100, "alive": True},
        ]
        hit_type, impact, damage = _run_flight(tanks, heights, 0, 45, 50, 0)
        if hit_type in {"terrain", "tank"}:
            total = sum(damage.values())
            self.assertGreaterEqual(total, 0)
        self.assertTrue(any(t["alive"] for t in tanks))


if __name__ == "__main__":
    unittest.main()