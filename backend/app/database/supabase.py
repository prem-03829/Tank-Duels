from supabase import create_client
from app.config import Config


supabase = create_client(
    Config.SUPABASE_URL,
    Config.SUPABASE_KEY
)