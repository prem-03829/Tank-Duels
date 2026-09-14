from supabase import create_client

from app.config import Config

_supabase_client = None


def get_supabase():
    global _supabase_client
    if _supabase_client is None:
        if not Config.SUPABASE_URL or not Config.SUPABASE_KEY:
            raise RuntimeError(
                "Missing required environment variables: SUPABASE_URL and SUPABASE_KEY "
                "must be set in the backend .env file."
            )
        _supabase_client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)
    return _supabase_client