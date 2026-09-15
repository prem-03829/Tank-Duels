"""Server-authoritative shot resolution.

This module reproduces the browser game's projectile physics, terrain
destruction, damage and round/turn flow (frontend/js/game/projectile.js,
frontend/js/game/tank.js, frontend/js/game/terrain.js destroy/getHeight and
frontend/js/game/engine.js) so the server can resolve a stored ``pending_fire``
into an authoritative outcome.

The simulation consumes only values already stored in the authoritative
``battle_state`` (angles, powers, the current wind, terrain heights and tank
positions/health). It never draws randomness of its own: even wind regeneration
for the *next* turn is metadata applied after the shot is resolved, using the
same seeded distribution as battle_setup.derive_wind so the source stays
server-controlled and reproducible.
"""

import math
import secrets

from app.battle_setup import (
    TERRAIN_H,
    TERRAIN_W,
    TERRAIN_STEP,
    _js_round,
    derive_wind,
    generate_setup,
)

GRAVITY = 0.09
PROJECTILE_SPEED_CAP = 10

EXPLOSION_RADIUS = 26
MAX_DAMAGE = 40
MIN_DAMAGE = 5
BODY_H = 8

TANK_TRACK_H = 5
TANK_BODY_H = 8
TANK_TURRET_H = 6
TANK_CANNON_LENGTH = 20
TANK_Y_OFFSET = TANK_TRACK_H + TANK_BODY_H + 1

HITBOX_HALF_W = 14
HITBOX_TOP = 7
HITBOX_W = 28
HITBOX_H = TANK_TURRET_H + TANK_BODY_H + TANK_TRACK_H + 2

_MISS_LEFT = -30
_MISS_RIGHT = TERRAIN_W + 30
_MISS_BOTTOM = TERRAIN_H + 30

_MAX_SIMULATION_STEPS = 20000


def _get_height(heights, x):
    ix = _js_round(x)
    if ix < 0 or ix >= TERRAIN_W:
        return TERRAIN_H
    return heights[ix]


def _destroy(heights, cx, cy, radius):
    r = math.ceil(radius)
    x0 = max(0, math.floor(cx - r))
    x1 = min(TERRAIN_W - 1, math.ceil(cx + r))

    for x in range(x0, x1 + 1):
        dx = x - cx
        if math.fabs(dx) > r:
            continue
        crater_depth = math.sqrt(r * r - dx * dx) * 0.6
        crater_bottom = cy + crater_depth
        if heights[x] < crater_bottom:
            heights[x] = min(TERRAIN_H, _js_round(crater_bottom / TERRAIN_STEP) * TERRAIN_STEP)


def _take_damage(tank, amount):
    tank["health"] = max(0, tank["health"] - _js_round(amount))
    if tank["health"] <= 0:
        tank["alive"] = False


def _sync_tank(tank, heights):
    tank["y"] = _get_height(heights, tank["x"]) - TANK_Y_OFFSET


def _point_in_tank(x, y, tank):
    if not tank["alive"]:
        return False
    hx = tank["x"] - HITBOX_HALF_W
    hy = tank["y"] - HITBOX_TOP
    return hx <= x <= hx + HITBOX_W and hy <= y <= hy + HITBOX_H


def _run_flight(tanks, heights, wind, angle, power, firing_index):
    """Mirror engine.js FLYING: per-frame projectile update then collision.

    ``tanks`` holds the two tanks in fixed engine order (index 0 = player1,
    index 1 = player2) and ``firing_index`` selects the shooter whose cannon is
    the launch origin. Returns ``(hit_type, impact, damage_by_index)`` where
    ``hit_type`` is one of ``'terrain'``, ``'tank'`` or ``'miss'`` and
    ``damage_by_index`` maps the same tank indices to the damage each takes.
    """
    rad = angle * math.pi / 180
    speed = (power / 100) * PROJECTILE_SPEED_CAP

    firing = tanks[firing_index]
    x = firing["x"] + math.cos(rad) * TANK_CANNON_LENGTH
    y = (firing["y"] - 1) - math.sin(rad) * TANK_CANNON_LENGTH
    vx = math.cos(rad) * speed
    vy = -math.sin(rad) * speed

    damage = {0: 0, 1: 0}

    for _ in range(_MAX_SIMULATION_STEPS):
        prev_x, prev_y = x, y
        vx += wind * 0.008
        vy += GRAVITY
        x += vx
        y += vy

        if x < _MISS_LEFT or x > _MISS_RIGHT or y > _MISS_BOTTOM:
            return "miss", {"x": prev_x, "y": prev_y}, damage

        ix = _js_round(x)
        if 0 <= ix < TERRAIN_W and y >= heights[ix]:
            iy = heights[ix]
            _destroy(heights, ix, iy, EXPLOSION_RADIUS)

            for i, tank in enumerate(tanks):
                if not tank["alive"]:
                    continue
                dx = tank["x"] - ix
                dy = (tank["y"] + BODY_H / 2) - iy
                dist = math.sqrt(dx * dx + dy * dy)
                if dist < EXPLOSION_RADIUS:
                    dmg = MAX_DAMAGE * (1 - dist / EXPLOSION_RADIUS)
                    dmg = max(MIN_DAMAGE, _js_round(dmg))
                    _take_damage(tank, dmg)
                    damage[i] += dmg
            return "terrain", {"x": ix, "y": iy}, damage

        for i, tank in enumerate(tanks):
            if _point_in_tank(x, y, tank):
                _take_damage(tank, MAX_DAMAGE)
                _destroy(heights, x, y, EXPLOSION_RADIUS * 0.6)
                damage[i] += MAX_DAMAGE
                return "tank", {"x": x, "y": y}, damage

    return "miss", {"x": prev_x, "y": prev_y}, damage


def resolve_shot(battle_state, player1_id, player2_id):
    """Resolve a battle's stored ``pending_fire`` into a new authoritative state.

    ``battle_state`` must be a version-2 state whose top-level ``pending_fire``
    is a dict ``{player_id, angle, power}`` owned by one of the two players.
    Returns a dict describing the shot outcome and the resulting state:

    - ``hit_type`` / ``impact`` / ``damage`` — the shot's collision result
    - ``round_winner_player_id`` / ``defeated_player_id`` — when a round ends
    - ``game_over`` — when the match ends via the score threshold
    - ``status`` — ``'IN_PROGRESS'`` or ``'COMPLETED'``
    - ``current_turn`` — the new turn owner (unchanged when the match ends)
    - ``battle_state`` — the new authoritative state (``pending_fire`` consumed,
      health/terrain/wind/scores updated, round setup regenerated if needed)
    """
    setup = battle_state["setup"]
    pending_fire = battle_state["pending_fire"]

    p1 = setup["players"][player1_id]
    p2 = setup["players"][player2_id]
    tanks = [
        {"x": p1["x"], "y": p1["y"], "health": p1["health"], "alive": p1["health"] > 0},
        {"x": p2["x"], "y": p2["y"], "health": p2["health"], "alive": p2["health"] > 0},
    ]

    firing_index = 0 if pending_fire["player_id"] == player1_id else 1

    heights = list(setup["terrain"]["heights"])
    hit_type, impact, damage_by_index = _run_flight(
        tanks, heights, setup["wind"], pending_fire["angle"], pending_fire["power"], firing_index
    )

    for tank in tanks:
        _sync_tank(tank, heights)

    dead = None
    for i, tank in enumerate(tanks):
        if not tank["alive"]:
            dead = i
            break

    new_state = dict(battle_state)
    setup = dict(setup)
    setup["terrain"] = {"heights": heights}
    setup["scores"] = dict(setup["scores"])
    setup["players"] = {
        player1_id: {"x": tanks[0]["x"], "y": tanks[0]["y"], "health": tanks[0]["health"]},
        player2_id: {"x": tanks[1]["x"], "y": tanks[1]["y"], "health": tanks[1]["health"]},
    }
    new_state["setup"] = setup
    new_state.pop("pending_fire", None)

    shot = {
        "player_id": pending_fire["player_id"],
        "angle": pending_fire["angle"],
        "power": pending_fire["power"],
        "hit_type": hit_type,
        "impact": impact,
        "damage": {
            pid: dmg
            for pid, dmg in (
                (player1_id, damage_by_index[0]),
                (player2_id, damage_by_index[1]),
            )
            if dmg > 0
        },
    }
    new_state["last_shot"] = shot

    status = "IN_PROGRESS"
    round_winner = None
    defeated = None
    current_turn = None

    if dead is None:
        current_turn = player2_id if firing_index == 0 else player1_id
        setup["wind"] = derive_wind(_random_seed())
    else:
        both_dead = not tanks[0]["alive"] and not tanks[1]["alive"]
        winner_index = firing_index if both_dead else (1 if dead == 0 else 0)
        round_winner = player1_id if winner_index == 0 else player2_id
        defeated = player2_id if winner_index == 0 else player1_id

        setup["scores"][round_winner] += 1
        if setup["scores"][player1_id] > setup["max_rounds"] / 2 or setup["scores"][
            player2_id
        ] > setup["max_rounds"] / 2:
            status = "COMPLETED"
        else:
            setup["round"] += 1
            fresh = generate_setup(map_key=setup["map"])
            setup["map"] = fresh["map"]
            setup["seed"] = fresh["seed"]
            setup["terrain"] = {"heights": fresh["heights"]}
            setup["wind"] = fresh["wind"]
            setup["players"] = {
                player1_id: {
                    "x": fresh["tanks"]["player1"]["x"],
                    "y": fresh["tanks"]["player1"]["y"],
                    "health": 100,
                },
                player2_id: {
                    "x": fresh["tanks"]["player2"]["x"],
                    "y": fresh["tanks"]["player2"]["y"],
                    "health": 100,
                },
            }
            current_turn = player1_id

    return {
        "hit_type": hit_type,
        "impact": impact,
        "damage": shot["damage"],
        "round_winner_player_id": round_winner,
        "defeated_player_id": defeated,
        "game_over": status == "COMPLETED",
        "status": status,
        "current_turn": current_turn,
        "battle_state": new_state,
        "shot": shot,
    }


def _random_seed():
    return secrets.randbits(32)