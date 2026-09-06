from flask import Flask
from app.database.supabase import supabase


def create_app():
    app = Flask(__name__)

    @app.route("/")
    def home():
        return "Tank Duels Backend is running!"

    @app.route("/api/test-supabase")
    def test_supabase():
        try:
            response = supabase.table("users").select("*").limit(1).execute()

            return {
                "success": True,
                "message": "Supabase connection successful"
            }

        except Exception as e:
            return {
                "success": False,
                "message": str(e)
            }, 500

    return app