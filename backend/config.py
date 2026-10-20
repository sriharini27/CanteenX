import os
from dotenv import load_dotenv

load_dotenv()


def _bool(name, default="false"):
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes")


class Config:
    MONGO_URI = os.getenv("MONGO_URI") or "mongodb://localhost:27017"
    DB_NAME = os.getenv("DB_NAME") or "canteen_smt"
    JWT_SECRET = os.getenv("JWT_SECRET") or "dev-only-secret-change-me-0123456789abcdef"
    JWT_HOURS = int(os.getenv("JWT_HOURS") or 12)
    FLASK_ENV = os.getenv("FLASK_ENV") or "development"
    DEBUG = FLASK_ENV == "development"
    PORT = int(os.getenv("PORT") or 5000)
    CORS_ORIGINS = (os.getenv("CORS_ORIGINS") or "http://localhost:5173,http://127.0.0.1:5173").split(",")
    AUTO_SEED = _bool("AUTO_SEED", "true")      # seed demo data when the DB is empty
    USE_MOCK_DB = _bool("USE_MOCK_DB")          # in-memory MongoDB (mongomock) for quick demos/tests
    GOOGLE_CLIENT_ID = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()   # OAuth 2.0 Web client ID from Google Cloud Console
    UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024        # 5 MB max upload (Flask rejects bigger requests with 413)
    FETCH_FOOD_IMAGES = _bool("FETCH_FOOD_IMAGES", "true")  # download default dish photos on first start
