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
  "game_mode": "LAN"
}
```

Only `player2_id` and `game_mode` are honored. `player1_id` is never accepted
from the client (a `400` is returned if it is supplied); the authenticated
user's ID from the validated JWT is used as `player1_id`. `game_mode` must be
exactly one of `LOCAL`, `LAN`, or `ONLINE` (no normalization). The battle is
created with `status: "IN_PROGRESS"` and the authenticated player as the first
`current_turn`.

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
    "battle_state": {},
    "created_at": "2026-09-14T11:52:38.671343+00:00",
    "started_at": null,
    "ended_at": null
  }
}
```

Errors: `400` for missing/invalid `player2_id` or `game_mode`, a malformed
`player2_id`, a client-supplied `player1_id`, an unsupported `game_mode`, or
`player2_id` equal to the authenticated player; `404` if the opponent has no
`public.player` row; `401` if authentication is missing/invalid.

### Retrieve a battle

```
GET /api/battles/<battle_id>
Authorization: Bearer <access_token>
```

Returns the battle only if the authenticated player participates in it (as
`player1_id` or `player2_id`); the participant filter runs in the Supabase
query, with the database RLS as an additional layer.

```json
{ "battle": { "battle_id": "...", "player1_id": "...", "player2_id": "...", "winner_player_id": null, "defeated_player_id": null, "current_turn": "...", "game_mode": "LAN", "status": "IN_PROGRESS", "battle_state": {}, "created_at": "...", "started_at": null, "ended_at": null } }
```

Errors: `400` for a malformed `battle_id`; `404` (`{"error": "Battle not found"}`)
if the battle does not exist or the authenticated player is not a participant
(participants and non-participants are indistinguishable); `401` if
authentication is missing/invalid.

## CORS

Local frontend development origins are allowed by default. To configure origins for a
production frontend domain, set `CORS_ALLOWED_ORIGINS` to a comma-separated list of
origins, e.g.:

```
CORS_ALLOWED_ORIGINS=https://tank-duels.example.com
```