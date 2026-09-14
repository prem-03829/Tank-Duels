"""Server-authoritative battle setup generation.

This module reproduces the browser game's terrain and tank-placement logic
(frontend/js/game/terrain.js and frontend/js/game/engine.js) so the backend can
generate the exact same world the frontend would render for a given map and
seed, without ever trusting a client-side value.

The mulberry32 PRNG used by terrain.js is ported with JavaScript 32-bit
integer semantics (unsigned 32-bit state; ``Math.imul`` as low-32-bit product).
Initial wind uses the same distribution formula as the frontend
(`Math.round((rand()*2-1)*WIND_ABS_MAX)` clamped to +/-1) but is derived from a
distinct seeded stream instead of ``Math.random``, which cannot be reproduced.
An authenticated client must therefore consume the server-provided ``wind``
value rather than generate its own.
"""

import math
import secrets

TERRAIN_W = 640
TERRAIN_H = 360
TERRAIN_STEP = 2
WIND_ABS_MAX = 4
MIN_HEIGHT = 80
MAX_HEIGHT = TERRAIN_H - 10
TANK_PLACEMENT_RANGE = 20

MAP_KEYS = ("dustlands", "valley", "frostbite", "ashhill", "moonbase", "canyon")
MAP_ALIASES = {"desert": "dustlands", "hills": "valley"}
DEFAULT_MAP = "dustlands"

_MASK32 = 0xFFFFFFFF
_HEARTBEAT = 0x6D2B79F5
_WIND_SALT = 0x1C886FAE

_HEIGHT_PROFILES = {
    "dustlands": (0.77, ((14, 0.008), (7, 0.022), (3, 0.055), (1, 0.12))),
    "valley": (0.76, ((16, 0.012), (9, 0.028), (4, 0.06), (2, 0.14))),
    "frostbite": (0.78, ((12, 0.01), (6, 0.025), (3, 0.06), (1, 0.13))),
    "ashhill": (0.75, ((12, 0.015), (8, 0.035), (5, 0.07), (2, 0.15))),
    "moonbase": (0.78, ((10, 0.01), (5, 0.03), (3, 0.07), (2, 0.16))),
    "canyon": (0.74, ((14, 0.014), (10, 0.032), (6, 0.065), (3, 0.14))),
}

_DECO_COUNTS = {
    "dustlands": (12, 8),
    "valley": (18, 10),
    "frostbite": (10, 6),
    "ashhill": (14, 8),
    "moonbase": (8, 6),
    "canyon": (10, 7),
}


def _uint32(value):
    return value & _MASK32


def _int32(value):
    """Coerce to a signed 32-bit integer (JavaScript ``| 0``)."""
    value &= _MASK32
    return value - 0x100000000 if value >= 0x80000000 else value


def _imul32(a, b):
    """Low 32 bits of the integer product (JavaScript ``Math.imul``)."""
    return (a * b) & _MASK32


def _js_round(x):
    """JavaScript ``Math.round`` for non-negative x (rounds .5 up)."""
    return math.floor(x + 0.5)


def resolve_map(value):
    """Resolve a map choice to a canonical map key, defaulting to dustlands."""
    if not isinstance(value, str):
        return DEFAULT_MAP
    key = MAP_ALIASES.get(value, value)
    if key not in MAP_KEYS:
        return DEFAULT_MAP
    return key


class Mulberry32:
    """Faithful mulberry32 port (terrain.js ``seed``/``rng``).

    State is stored as an unsigned 32-bit integer; every operation preserves
    JavaScript bit-level semantics, so this produces bit-identical floats to
    the browser RNG.
    """

    __slots__ = ("_state",)

    def __init__(self, seed):
        self._state = _uint32(seed)

    def reseed(self, seed):
        self._state = _uint32(seed)

    def next_float(self):
        """Return the next float in [0, 1), identical to terrain.js ``rng``."""
        state = (self._state + _HEARTBEAT) & _MASK32
        self._state = state

        t = _imul32(state ^ (state >> 15), 1 | state)
        t = ((t + _imul32(t ^ (t >> 7), 61 | t)) & _MASK32) ^ t

        outcome = (t ^ (t >> 14)) & _MASK32
        return outcome / 4294967296.0


def _generate_heights(biome, rng):
    """Mirror terrain.js ``_generateHeights`` exactly (incl. RNG order)."""
    base_ratio, layers = _HEIGHT_PROFILES[biome]
    base_y = _js_round(TERRAIN_H * base_ratio)
    phases = [rng.next_float() * 6.28 for _ in layers]

    heights = []
    for x in range(TERRAIN_W):
        y = base_y
        for (amp, freq), phase in zip(layers, phases):
            y += amp * math.sin(freq * x + phase)
        y = _js_round(y / TERRAIN_STEP) * TERRAIN_STEP
        y = max(MIN_HEIGHT, min(MAX_HEIGHT, y))
        heights.append(int(y))
    return heights


def _consume_stars(rng):
    rng.reseed((rng._state + 7) & _MASK32)
    count = 25 + math.floor(rng.next_float() * 20)
    for _ in range(count):
        rng.next_float()
        rng.next_float()
        rng.next_float()
        rng.next_float()


def _consume_clouds(rng):
    rng.reseed((rng._state + 13) & _MASK32)
    count = 3 + math.floor(rng.next_float() * 4)
    for _ in range(count):
        rng.next_float()
        rng.next_float()
        rng.next_float()
        rng.next_float()


def _consume_bg_mountains(rng):
    rng.reseed((rng._state + 31) & _MASK32)
    peaks = 4 + math.floor(rng.next_float() * 4)
    rng.next_float()  # maxH = 50 + floor(rng() * 35)
    for _ in range(peaks * 4 + 1):
        rng.next_float()  # Math.sin(i * 0.8 + rng() * 2)
        rng.next_float()  # 0.5 + rng() * 0.5


def _consume_bg_hills(rng):
    rng.reseed((rng._state + 47) & _MASK32)
    count = 6 + math.floor(rng.next_float() * 5)
    for _ in range(count):
        rng.next_float()  # cx
        rng.next_float()  # w
        rng.next_float()  # h


def _consume_decorations(biome, rng):
    rng.reseed((rng._state + 61) & _MASK32)
    base, span = _DECO_COUNTS[biome]
    count = base + math.floor(rng.next_float() * span)
    for _ in range(count):
        rng.next_float()  # x
        rng.next_float()  # _pickDeco
        rng.next_float()  # size


def _consume_details(biome, heights, rng):
    """Advance the RNG through terrain.js ``_generateDetails``.

    Each entry draws x, then r, then the branch-specific offset draw where the
    frontend makes one. Heights are always within [MIN_HEIGHT, MAX_HEIGHT], so
    the ``h <= 0 || h >= H`` skip can never trigger for generated values, but
    the guard is kept for parity.
    """
    rng.reseed((rng._state + 77) & _MASK32)
    count = 50 + math.floor(rng.next_float() * 30)
    for _ in range(count):
        x = math.floor(rng.next_float() * TERRAIN_W)
        h = heights[x]
        if h <= 0 or h >= TERRAIN_H:
            continue
        r = rng.next_float()

        if biome == "dustlands":
            if r < 0.25:
                rng.next_float()
            elif r < 0.6:
                pass
            else:
                rng.next_float()
        elif biome == "valley":
            if not r < 0.7:
                rng.next_float()
        elif biome == "frostbite":
            if not r < 0.75:
                rng.next_float()
        elif biome == "ashhill":
            if 0.55 <= r < 0.7:
                rng.next_float()
        elif biome == "moonbase":
            if 0.55 <= r < 0.7:
                rng.next_float()
        elif biome == "canyon":
            if 0.4 <= r < 0.55:
                rng.next_float()
            elif r >= 0.7:
                rng.next_float()
        else:
            rng.next_float()


def _find_flat_spot(heights, x):
    """Mirror engine.js ``_findFlatSpot(x, 20)``."""
    best_x = x
    best_variance = float("inf")
    for ox in range(-15, 16):
        cx = x + ox
        if cx < 25 or cx >= TERRAIN_W - 25:
            continue
        variance = 0
        count = 0
        for dx in range(-TANK_PLACEMENT_RANGE, TANK_PLACEMENT_RANGE + 1):
            index = cx + dx
            if index < 0 or index >= TERRAIN_W:
                continue
            diff = heights[index] - heights[cx]
            variance += diff * diff
            count += 1
        if count:
            variance /= count
        if variance < best_variance:
            best_variance = variance
            best_x = cx
    return best_x


def _place_tanks(heights, rng):
    """Mirror engine.js ``_placeTanks`` (two placement draws, then flat spots)."""
    p1x = _js_round(TERRAIN_W * (0.12 + rng.next_float() * 0.1))
    p2x = _js_round(TERRAIN_W * (0.78 + rng.next_float() * 0.1))
    p1x = _find_flat_spot(heights, p1x)
    p2x = _find_flat_spot(heights, p2x)
    return {
        "player1": {"x": p1x, "y": heights[p1x] - 14},
        "player2": {"x": p2x, "y": heights[p2x] - 14},
    }


def derive_wind(seed):
    """Seeded wind matching the frontend's distribution (but reproducible)."""
    rng = Mulberry32((_uint32(seed) ^ _WIND_SALT) & _MASK32)
    wind = _js_round((rng.next_float() * 2 - 1) * WIND_ABS_MAX)
    if abs(wind) < 1:
        wind = 1 if rng.next_float() > 0.5 else -1
    return wind


def generate_setup(map_key=None, seed=None):
    """Generate the authoritative setup for an initial round.

    ``seed`` must be an integer and is coerced to a signed 32-bit value, exactly
    as the frontend does with ``Date.now() | 0``. When omitted a cryptographically
    random seed is produced. Returns a dict containing the resolved map, seed,
    terrain heights, initial wind, and both tank positions.
    """
    biome = resolve_map(map_key)
    if seed is None:
        seed = _int32(secrets.randbits(32))
    seed = _int32(seed)

    rng = Mulberry32(seed)
    heights = _generate_heights(biome, rng)
    _consume_stars(rng)
    _consume_clouds(rng)
    _consume_bg_mountains(rng)
    _consume_bg_hills(rng)
    _consume_decorations(biome, rng)
    _consume_details(biome, heights, rng)
    tanks = _place_tanks(heights, rng)

    return {
        "map": biome,
        "seed": seed,
        "heights": heights,
        "wind": derive_wind(seed),
        "tanks": tanks,
    }