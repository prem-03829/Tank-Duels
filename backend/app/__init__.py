from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException, NotFound

from app.config import Config
from app.cors import init_cors
from app.health import health_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    app.register_blueprint(health_bp)
    init_cors(app)

    _register_error_handlers(app)
    _validate_config()

    return app


def _validate_config():
    if not Config.SUPABASE_URL or not Config.SUPABASE_KEY:
        raise RuntimeError(
            "Missing required environment variables: SUPABASE_URL and SUPABASE_KEY "
            "must be set in the backend .env file."
        )


def _register_error_handlers(app):
    @app.errorhandler(NotFound)
    def handle_not_found(error):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        return jsonify({"error": error.name}), error.code or 500

    @app.errorhandler(Exception)
    def handle_unhandled_exception(error):
        return jsonify({"error": "Internal server error"}), 500