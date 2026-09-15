# Pocket Tanks — Backend

Flask + Supabase backend for Pocket Tanks.

## Setup

Create a `.env` file in this directory (see `.env.example`):

```
SUPABASE_URL=...
SUPABASE_KEY=...
```

Install dependencies with `uv`:

```
uv sync
```

## Running locally

```
uv run python main.py
```

The server runs on http://127.0.0.1:5000.

Enable Flask debug mode (auto-reload) with:

```
FLASK_DEBUG=1 uv run python main.py
```

## Health endpoints

- `GET /api/health` — backend is running
- `GET /api/health/supabase` — backend can reach Supabase

## Authentication

Authentication is handled by Supabase Auth. The backend never stores or sees
passwords in plain text.

### Signup

```
POST /api/auth/signup
Content-Type: application/json
```

```json
{ "email": "user@example.com", "password": "password", "username": "TankPlayer" }
```

`username` is required and limited to 50 characters. On success a `public.player`
row is created for the new Supabase user, and a `201` response is returned:

```json
{
  "user": { "id": "...", "email": "user@example.com" },
  "session": { "access_token": "...", "refresh_token": "..." }
}
```

### Login

```
POST /api/auth/login
Content-Type: application/json
```

```json
{ "email": "user@example.com", "password": "password" }
```

Returns the user and session (access + refresh token) on success:

```json
{
  "user": { "id": "...", "email": "user@example.com" },
  "session": { "access_token": "...", "refresh_token": "..." }
}
```

Invalid credentials return `401`.

### Current user

Protected endpoint. Requires an `Authorization` header:

```
GET /api/auth/me
Authorization: Bearer <access_token>
```

```json
{ "user": { "id": "...", "email": "user@example.com" } }
```

Missing or invalid tokens return `401`.

### Logout

```
POST /api/auth/logout
Content-Type: application/json
```

Optionally include `Authorization: Bearer <access_token>`. Returns:

```json
{ "message": "Logged out successfully" }
```

### Testing authentication locally

With the server running, sign up via:

```
curl -X POST http://127.0.0.1:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password","username":"TankPlayer"}'
```

Then call a protected endpoint with the returned access token:

```
curl http://127.0.0.1:5000/api/auth/me \
  -H "Authorization: Bearer <access_token>"
```

## Player profile

Protected endpoints for the currently authenticated user's own player profile.
Require `Authorization: Bearer <access_token>`.

### Get current player profile

```
GET /api/player/me
Authorization: Bearer <access_token>
```

Returns the profile of the authenticated user:

```json
{
  "player": {
    "player_id": "...",
    "username": "TankPlayer",
    "created_at": "2026-09-14T11:52:38.671343+00:00",
    "updated_at": "2026-09-14T11:52:38.671343+00:00"
  }
}
```

`404` is returned if the authenticated user has no `public.player` row
(player rows are created at signup).

### Update current player profile

```
PATCH /api/player/me
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{ "username": "NewUsername" }
```

Only `username` can be changed (max 50 characters, must be non-empty).
`player_id`, `created_at`, and `updated_at` are never accepted from the
client; the authenticated user's ID always comes from the validated JWT, and
`updated_at` is updated automatically by the database trigger.

Returns the updated profile:

```json
{
  "player": {
    "player_id": "...",
    "username": "NewUsername",
    "created_at": "2026-09-14T11:52:38.671343+00:00",
    "updated_at": "2026-09-14T11:53:34.807462+00:00"
  }
}
```

Errors: `400` for a missing/invalid body or invalid `username`,
`404` if the player row does not exist, `409` if the username is already taken.

### Get current player statistics

Read-only. Returns the currently authenticated player's statistics.

```
GET /api/player/stats
Authorization: Bearer <access_token>
```

```json
{
  "statistics": {
    "player_id": "...",
    "battles_played": 0,
    "battles_won": 0,
    "battles_lost": 0,
    "total_damage": 0,
    "updated_at": "2026-09-14T11:52:38.671343+00:00"
  }
}
```

The authenticated player is determined by the validated JWT only; client-supplied
`player_id` values (body, query, or URL) are ignored.

Errors: `401` if authentication is missing/invalid, `404`
(`{"error": "Player statistics not found"}`) if the player has no statistics row.
Statistics rows are created later by battle-completion logic; this endpoint never
modifies statistics.

## Battles

Protected endpoints for creating and retrieving battles. Require
`Authorization: Bearer <access_token>`.

### Create a battle

```
POST /api/battles
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "player2_id": "uuid-of-the-opponent-player",
  "game_mode": "LAN",
  "map": "desert",
  "rounds": 3
}
```

`player1_id` is never accepted from the client (a `400` is returned if it is
supplied); the authenticated user's ID from the validated JWT is used as
`player1_id`. `game_mode` must be exactly one of `LOCAL`, `LAN`, or `ONLINE`
(no normalization). `map` and `rounds` are client *choices*; every generated
value is owned by the server:

- `map` — optional canonical map key (`dustlands`, `valley`, `frostbite`,
  `ashhill`, `moonbase`, `canyon`) or a frontend alias (`desert` ->
  `dustlands`, `hills` -> `valley`). Unknown values resolve to `dustlands`,
  exactly like the frontend's `Terrain.generate`. Defaults to `dustlands`.
- `rounds` — optional integer 1-3 (the frontend offers 1 and 3). Defaults to 1.

The battle is created with `status: "IN_PROGRESS"`, the authenticated player as
the first `current_turn`, and a server-authoritative initial `battle_state`
(version 2) that includes the full battle setup. Nothing randomized — seed,
terrain heights, tank positions, initial wind, or scores — is ever accepted
from the client.

```json
{
  "battle": {
    "battle_id": "...",
    "player1_id": "...",
    "player2_id": "...",
    "winner_player_id": null,
    "defeated_player_id": null,
    "current_turn": "...",
    "game_mode": "LAN",
    "status": "IN_PROGRESS",
    "battle_state": {
      "version": 2,
      "setup": {
        "map": "dustlands",
        "seed": -123456,
        "terrain": { "heights": [ 277, 277, 276, 276, 276, 275, 275, 274, ... ] },
        "players": {
          "<player1_id>": { "x": 125, "y": 263, "health": 100 },
          "<player2_id>": { "x": 522, "y": 265, "health": 100 }
        },
        "wind": -2,
        "round": 1,
        "max_rounds": 3,
        "scores": {
          "<player1_id>": 0,
          "<player2_id>": 0
        }
      }
    },
    "created_at": "2026-09-14T11:52:38.671343+00:00",
    "started_at": null,
    "ended_at": null
  }
}
```

### Authoritative battle setup

The setup inside `battle_state.setup` is generated by the backend and is a
faithful port of the browser's terrain and tank-placement logic
(`frontend/js/game/terrain.js`, `frontend/js/game/engine.js`):

- `map` — the resolved map key.
- `seed` — a signed 32-bit integer generated server-side (the frontend uses
  `Date.now() | 0`; the server uses a cryptographic RNG).
- `terrain.heights` — the 640 terrain height values produced by the same
  mulberry32 generator and layered-sine height function the browser uses.
- `players.<id>.x/.y` — tank coordinates reproduced from the frontend's
  round-1 placement (flatness search included). Tank `y` is
  `height[x] - 14` (track 5 + body 8 + 1).
- `wind` — the same distribution as the frontend (`round((rand*2-1)*4)` with
  `+/-1` clamp) but derived from a seeded stream. The frontend uses
  `Math.random()` for wind, which cannot be reproduced; an authenticated
  client must consume this server value instead of generating its own.
- `round`/`max_rounds`/`scores` — round tracking; the current turn is the
  authoritative `current_turn` column, not this JSON.
- `round` is fixed at 1 here (initial setup). Round 2+ setup regeneration and
  shot resolution are handled by `app/shot_resolution.py` when a shot resolves
  (see "Resolve a shot").

Because tanks must sit on the exact heights the server stores, the entire
RNG consumption order (heights, stars, clouds, background mountains, hills,
decorations, details, then two placement draws) is reproduced exactly. This
module (`app/battle_setup.py`) was verified against a browser-authentic
execution of `terrain.js` for all six biomes.

`battle_state` is always generated and controlled by the server. A
client-supplied `battle_state` is never stored, and there is no generic
state-update endpoint.

Errors: `400` for missing/invalid `player2_id` or `game_mode`, a malformed
`player2_id`, a client-supplied `player1_id`, an unsupported `game_mode`,
`player2_id` equal to the authenticated player, a non-string `map`, or a
`rounds` value outside 1-3; `404` if the opponent has no `public.player` row;
`401` if authentication is missing/invalid.

### Retrieve a battle

```
GET /api/battles/<battle_id>
Authorization: Bearer <access_token>
```

Returns the battle only if the authenticated player participates in it (as
`player1_id` or `player2_id`); the participant filter runs in the Supabase
query, with the database RLS as an additional layer.

```json
{ "battle": { "battle_id": "...", "player1_id": "...", "player2_id": "...", "winner_player_id": null, "defeated_player_id": null, "current_turn": "...", "game_mode": "LAN", "status": "IN_PROGRESS", "battle_state": { "version": 2, "setup": { "map": "dustlands", "seed": -123456, "terrain": { "heights": [ 277, ... ] }, "players": { "<player1_id>": { "x": 125, "y": 263, "health": 100 }, "<player2_id>": { "x": 522, "y": 265, "health": 100 } }, "wind": -2, "round": 1, "max_rounds": 1, "scores": { "<player1_id>": 0, "<player2_id>": 0 } } }, "created_at": "...", "started_at": null, "ended_at": null } }
```

Errors: `400` for a malformed `battle_id`; `404` (`{"error": "Battle not found"}`)
if the battle does not exist or the authenticated player is not a participant
(participants and non-participants are indistinguishable); `401` if
authentication is missing/invalid.

### Check current turn

Validation-only endpoint for establishing whose turn it is. Never modifies
`current_turn`, `battle_state`, `status`, or any other battle field.

```
POST /api/battles/<battle_id>/turn/check
Authorization: Bearer <access_token>
```

The request body is not used to determine identity. Supplying `player_id`,
`current_turn`, `battle_state`, `status`, `winner_player_id`, or
`defeated_player_id` in the body returns `400`.

The authenticated player (from the validated JWT) must be a participant, the
battle must be `IN_PROGRESS`, and the authenticated player's ID must equal the
battle's `current_turn`. Response when it is the caller's turn:

```json
{
  "turn": {
    "battle_id": "...",
    "player_id": "...",
    "is_current_turn": true
  }
}
```

Errors (the participant/nonexistent check is done inside the database query,
so non-participants are indistinguishable from nonexistent battles):

- `400` — malformed `battle_id`, or identity/battle control fields supplied in the body
- `401` — authentication missing/invalid
- `404` — `{"error": "Battle not found"}` — battle does not exist or the
  authenticated player is not a participant
- `409` — `{"error": "Battle is not in progress"}` — participant, but the
  battle is `WAITING`, `COMPLETED`, or `CANCELLED`
- `409` — `{"error": "Not your turn"}` — participant, `IN_PROGRESS`, but the
  authenticated player is not `current_turn`

### Fire a shot

The first server-side gameplay action. Records an authorized shot from the
current turn owner into `battle_state` and nothing else.

```
POST /api/battles/<battle_id>/actions/fire
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "angle": 45,
  "power": 60
}
```

The acting player is always the authenticated user from the validated JWT —
never a value from the body. `angle` must be between 0 and 360 and `power`
between 0 and 100 (the exact bounds used by the existing frontend engine).
Supplying `player_id`, `current_turn`, `battle_state`, `status`,
`winner_player_id`, or `defeated_player_id` in the body returns `400`.

When it is the caller's turn and no shot is already in flight, the shot is
persisted as `battle_state.pending_fire`:

```json
{
  "battle": {
    "battle_id": "...",
    "player1_id": "...",
    "player2_id": "...",
    "current_turn": "...",
    "game_mode": "LAN",
    "status": "IN_PROGRESS",
    "battle_state": {
      "version": 2,
      "setup": {
        "map": "dustlands",
        "seed": -123456,
        "terrain": { "heights": [ 277, ... ] },
        "players": {
          "<player1_id>": { "x": 125, "y": 263, "health": 100 },
          "<player2_id>": { "x": 522, "y": 265, "health": 100 }
        },
        "wind": -2,
        "round": 1,
        "max_rounds": 1,
        "scores": {
          "<player1_id>": 0,
          "<player2_id>": 0
        }
      },
      "pending_fire": {
        "player_id": "<firing player id>",
        "angle": 45,
        "power": 60
      }
    }
  }
}
```

Scope of this endpoint (Stage-8 boundary):

- It authenticates and authorizes the shot, validates the input, and stores the
  shot server-side. It never accepts `battle_state`, `current_turn`, damage,
  health, or winner data from the client.
- `current_turn` is **not** switched here. In the existing frontend, the turn
  only changes after the shot resolves (explosion/damage outcome), and that
  resolution is not implemented server-side yet.
- Damage and win/lose are **not** computed here. The current frontend derives
  them from browser-side randomized terrain, tank placement, and per-frame
  projectile physics that cannot yet be reproduced authoritatively; this is
  documented in the step report rather than faked.
- Firing twice before the shot resolves is rejected because
  `battle_state.pending_fire` is set.

Errors:

- `400` — malformed request body, missing/non-numeric/out-of-range `angle` or
  `power`, or identity/battle control fields supplied in the body
- `401` — authentication missing/invalid
- `404` — `{"error": "Battle not found"}` — battle does not exist or the
  authenticated player is not a participant
- `409` — `{"error": "Battle is not in progress"}` — participant, but the
  battle is `WAITING`, `COMPLETED`, or `CANCELLED`
- `409` — `{"error": "Not your turn"}` — participant, `IN_PROGRESS`, but the
  authenticated player is not `current_turn`
- `409` — `{"error": "A shot is already in flight"}` — a shot is pending

### Resolve a shot

The second server-side gameplay action. Consumes the stored `pending_fire` and
resolves it **authoritatively** on the server into an outcome: projectile
flight, collision, terrain destruction, damage, turn switching, and round /
game-over transitions.

```
POST /api/battles/<battle_id>/actions/fire/resolve
Authorization: Bearer <access_token>
```

No request body is used or required. Submitting any body returns `400`
(bodies that contain identity/battle control fields get the standard control
field message). The acting player is the authenticated user from the validated
JWT, and the shot comes entirely from the server-stored
`battle_state.pending_fire` written by the fire endpoint — the client does not
(and cannot) supply position, velocity, collision, damage, health, scores,
terrain, wind, winner, or any other battle state.

Rules enforced in order:

- `400` — malformed `battle_id`, a non-empty request body, or a structurally
  malformed stored `pending_fire`.
- `401` — authentication missing/invalid.
- `404` — battle does not exist or the authenticated player is not a
  participant (indistinguishable, done inside the database query).
- `409` — battle not `IN_PROGRESS`, "Not your turn",
  `{"error": "A shot is not in flight"}` when there is no `pending_fire`, or the
  stored `pending_fire.player_id` is not the authenticated user.

On success the shot is resolved and the battle is updated atomically:

- `battle_state.pending_fire` is consumed (removed).
- Health, terrain (cratered `heights`), and tank positions are updated.
- No death: `current_turn` switches to the other player and `setup.wind` is
  regenerated server-side.
- A death with more rounds to play: the round advances (`round + 1`), both
  tanks are restored to 100 health on a freshly generated setup for the same
  map, and `current_turn` returns to player 1.
- A death that reaches the score threshold (`score > max_rounds/2`): the battle
  is marked `COMPLETED` with `winner_player_id`, `defeated_player_id` and
  `ended_at` (ISO 8601 UTC) set; `current_turn` is **not** changed.

The last resolution is also stored as `battle_state.last_shot`:

```json
{
  "battle": {
    "battle_id": "...",
    "status": "IN_PROGRESS",
    "current_turn": "...",
    "battle_state": {
      "version": 2,
      "setup": { "map": "dustlands", "seed": -123456, "terrain": { "heights": [ 277, ... ] }, "players": { "<player1_id>": { "x": 125, "y": 263, "health": 100 }, "<player2_id>": { "x": 522, "y": 265, "health": 100 } }, "wind": 3, "round": 1, "max_rounds": 1, "scores": { "<player1_id>": 0, "<player2_id>": 0 } },
      "last_shot": {
        "player_id": "<firing player id>",
        "angle": 45,
        "power": 60,
        "hit_type": "terrain",
        "impact": { "x": 192, "y": 270 },
        "damage": {}
      }
    }
  },
  "shot": {
    "player_id": "<firing player id>",
    "angle": 45,
    "power": 60,
    "hit_type": "terrain",
    "impact": { "x": 192, "y": 270 },
    "damage": {}
  }
}
```

`shot` (and `last_shot`) fields:

- `hit_type` — one of `terrain` (the projectile hit the terrain at
  `(round(x), height(round(x)))` and the explosion cratered it), `tank` (the
  projectile entered a tank hitbox and dealt full `MAX_DAMAGE`), or `miss`
  (the projectile left the arena).
- `impact` — `{"x", "y"}` pixel position of the collision. For a `miss` it is
  the last valid (still in-bounds) projectile position; both coordinates are
  always meaningful for a fired projectile, so `impact` is never `null` in
  practice.
- `damage` — an object mapping each **damaged** player's id to the damage they
  took. Direct tank hit: `{"<hit player>": 40}`. Terrain splash
  (`dist < 26`): `max(5, round(40 * (1 - dist/26)))` per tank. A shot that
  damages no one (including most misses) returns `{}`. Zero-damage players are
  never included.

Authoritative resolution:

The resolution is a faithful port of the browser's own mechanics
(`frontend/js/game/projectile.js`, `tank.js`, `terrain.js`, `engine.js`):
gravity 0.09, `speed = (power/100) * 10`, per-frame `wind * 0.008`, tank hitbox
`x-14, y-7, w 28, h 21`, explosion radius 26 (15.6 on a tank hit), the crater
formula `min(H, round((cy + sqrt(r^2 - dx^2) * 0.6) / 2) * 2)`, health clamped
at 0, the first-dead / both-dead winner mapping, and the
`scores > max_rounds/2` game-over threshold. The server resolves from values it
already owns; the client supplies nothing.

Concurrency:

Resolving is a single atomic database operation. The UPDATE is filtered with
a PostgREST JSONB containment predicate on the exact stored shot —
`battle_state=cs.{ "pending_fire": { ... } }` (`@>` under the hood) in addition
to `battle_id`, `status = IN_PROGRESS`, `current_turn` and the participant
filter. The predicate is evaluated against the row as it exists at UPDATE time,
so when two requests race to consume the same `pending_fire`, exactly one
succeeds and the other matches zero rows and receives `409` —
`{"error": "Shot already resolved"}` (or "Battle is not in progress"/"A shot is
already in flight" if the re-read shows a different state). No read-modify-write
window remains.

Errors:

- `400` — malformed `battle_id`, a non-empty request body, identity/battle
  control fields supplied in the body, or a malformed stored `pending_fire`
- `401` — authentication missing/invalid
- `404` — `{"error": "Battle not found"}` — battle does not exist or the
  authenticated player is not a participant
- `409` — `{"error": "Battle is not in progress"}` — the battle is not
  `IN_PROGRESS`
- `409` — `{"error": "Not your turn"}` — `current_turn` is not the
  authenticated player, or the stored `pending_fire.player_id` is
- `409` — `{"error": "A shot is not in flight"}` — no `pending_fire` to resolve
- `409` — `{"error": "Shot already resolved"}` — another request consumed the
  same `pending_fire` first

## CORS

Local frontend development origins are allowed by default. To configure origins for a
production frontend domain, set `CORS_ALLOWED_ORIGINS` to a comma-separated list of
origins, e.g.:

```
CORS_ALLOWED_ORIGINS=https://tank-duels.example.com
```