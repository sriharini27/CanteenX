"""Password hashing, JWT creation and role-based route protection."""
from datetime import datetime, timedelta, timezone
from functools import wraps
import jwt
from flask import request, g, current_app
from werkzeug.security import generate_password_hash, check_password_hash
from utils.helpers import ApiError


def hash_password(p):
    return generate_password_hash(p)


def verify_password(hashed, p):
    return check_password_hash(hashed, p)


def create_token(user):
    payload = {
        "sub": str(user["_id"]), "role": user["role"], "name": user["name"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=current_app.config["JWT_HOURS"]),
    }
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


def auth_required(*roles):
    """@auth_required() -> any logged-in user; @auth_required("ADMIN", "STAFF") -> only those roles."""
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                raise ApiError("Authentication required", 401)
            try:
                payload = jwt.decode(header[7:], current_app.config["JWT_SECRET"], algorithms=["HS256"])
            except jwt.ExpiredSignatureError:
                raise ApiError("Session expired, please log in again", 401)
            except jwt.InvalidTokenError:
                raise ApiError("Invalid token", 401)
            if roles and payload["role"] not in roles:
                raise ApiError("You do not have permission for this action", 403)
            g.user_id, g.role, g.name = payload["sub"], payload["role"], payload["name"]
            return fn(*args, **kwargs)
        return wrapper
    return deco
