import traceback

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException, NotFound

from app.auth import auth_bp
from app.config import Config
from app.cors import init_cors
from app.health import health_bp
from app.logging_utils import redact_log_message
from app.player import player_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    app.register_blueprint(health_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(player_bp)
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
        app.logger.error(
            "Unhandled exception %s %s:\n%s",
            request.method,
            request.path,
            redact_log_message(traceback.format_exc()),
        )
        return jsonify({"error": "Internal server error"}), 500