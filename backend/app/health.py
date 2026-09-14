from flask import Blueprint, jsonify
from postgrest.exceptions import APIError

from app.supabase import get_supabase

health_bp = Blueprint("health", __name__)


@health_bp.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@health_bp.get("/api/health/supabase")
def supabase_health():
    try:
        get_supabase().table("player_statistics").select("player_id").limit(1).execute()
    except APIError:
        return jsonify({"status": "ok", "supabase": "connected"})
    except Exception:
        return jsonify({"status": "error", "supabase": "unreachable"}), 503
    return jsonify({"status": "ok", "supabase": "connected"})