import os

from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv())

LOCAL_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]


class Config:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    _cors_override = os.getenv("CORS_ALLOWED_ORIGINS")
    CORS_ALLOWED_ORIGINS = (
        [origin.strip() for origin in _cors_override.split(",") if origin.strip()]
        if _cors_override
        else LOCAL_DEV_ORIGINS
    )