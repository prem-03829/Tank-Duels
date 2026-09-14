from supabase import create_client

from app.config import Config

_supabase_client = None


def get_supabase():
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = _new_client()
    return _supabase_client


def get_auth_client():
    return _new_client()


def get_authenticated_client(access_token, refresh_token=None):
    client = _new_client()
    client.auth.set_session(access_token, refresh_token or "")
    return client


def _new_client():
    if not Config.SUPABASE_URL or not Config.SUPABASE_KEY:
        raise RuntimeError(
            "Missing required environment variables: SUPABASE_URL and SUPABASE_KEY "
            "must be set in the backend .env file."
        )
    return create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)