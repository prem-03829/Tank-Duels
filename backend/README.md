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

## CORS

Local frontend development origins are allowed by default. To configure origins for a
production frontend domain, set `CORS_ALLOWED_ORIGINS` to a comma-separated list of
origins, e.g.:

```
CORS_ALLOWED_ORIGINS=https://tank-duels.example.com
```