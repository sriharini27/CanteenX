"""College Canteen Operations (SMT) — Flask REST API entry point."""
from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from config import Config
from db import init_db
from utils.helpers import ApiError
from routes import (auth_routes, food_routes, order_routes, payment_routes, reward_routes, admin_routes,
                    queue_routes, waste_routes, simulation_routes, upload_routes)
from services import image_service


def create_app(cfg=Config):
    app = Flask(__name__)
    app.config.from_object(cfg)
    app.json.sort_keys = False
    CORS(app, origins=cfg.CORS_ORIGINS, supports_credentials=False)
    db = init_db(cfg)
    if cfg.AUTO_SEED and db.users.count_documents({}) == 0:
        from seed import seed
        seed(db)
    image_service.upload_dir(app.config)          # make sure backend/uploads/foods exists
    image_service.migrate_image_urls(app.config)  # old /images/... paths -> Flask-served /uploads/...
    image_service.start_background_fetch(app.config)

    for m in (auth_routes, food_routes, order_routes, payment_routes, reward_routes, admin_routes,
              queue_routes, waste_routes, simulation_routes, upload_routes):
        app.register_blueprint(m.bp)

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", database=cfg.DB_NAME, mock=cfg.USE_MOCK_DB)

    @app.errorhandler(ApiError)
    def api_error(e):
        return jsonify(error=e.message), e.status

    @app.errorhandler(413)
    def too_large(e):
        return jsonify(error="Image is too large (max 5 MB)"), 413

    @app.errorhandler(HTTPException)
    def http_error(e):
        return jsonify(error=e.description), e.code

    @app.errorhandler(Exception)
    def server_error(e):
        app.logger.exception(e)
        return jsonify(error="Internal server error"), 500

    return app


if __name__ == "__main__":
    application = create_app()
    application.run(host="0.0.0.0", port=Config.PORT, debug=Config.DEBUG, use_reloader=False)
