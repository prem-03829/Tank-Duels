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

## CORS

Local frontend development origins are allowed by default. To configure origins for a
production frontend domain, set `CORS_ALLOWED_ORIGINS` to a comma-separated list of
origins, e.g.:

```
CORS_ALLOWED_ORIGINS=https://tank-duels.example.com
```