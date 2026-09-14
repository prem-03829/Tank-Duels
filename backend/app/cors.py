from flask import request


def init_cors(app):
    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin")
        if origin and origin in app.config["CORS_ALLOWED_ORIGINS"]:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Headers"] = "Content-Type"
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            )
            response.headers["Vary"] = "Origin"
        return response