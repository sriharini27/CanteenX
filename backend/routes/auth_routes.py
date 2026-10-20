import re
from flask import Blueprint, jsonify, g, current_app
from pymongo.errors import DuplicateKeyError
from db import get_db
from models.user import new_user, new_google_user, public
from utils.auth import create_token, verify_password, auth_required
from utils.helpers import ApiError, body, text, serialize, oid, parse_date

bp = Blueprint("auth", __name__, url_prefix="/api/auth")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _session(user, status=200):
    return jsonify(token=create_token(user), user=serialize(public(user))), status


@bp.get("/config")
def auth_config():
    """Public settings the login page needs (the Google client ID is not a secret)."""
    return jsonify(google_client_id=current_app.config.get("GOOGLE_CLIENT_ID") or None)


@bp.post("/register")
def register():
    d = body()
    name, username, password = text(d, "name", maxlen=60), text(d, "username", maxlen=30).lower(), text(d, "password", maxlen=100)
    if not re.fullmatch(r"[a-z0-9_.]{3,30}", username):
        raise ApiError("Username must be 3-30 characters: letters, digits, _ or .")
    if len(password) < 6:
        raise ApiError("Password must be at least 6 characters")
    email = text(d, "email", required=False, maxlen=120).lower() or None
    if email and not EMAIL_RE.match(email):
        raise ApiError("Enter a valid email address")
    if email and get_db().users.find_one({"email": email}):
        raise ApiError("An account with this email already exists", 409)
    dob = d.get("date_of_birth") or None
    if dob: dob = parse_date(dob).isoformat()
    user = new_user(name, username, password, "STUDENT", dob, email=email)   # self-registration is always STUDENT
    try:
        user["_id"] = get_db().users.insert_one(user).inserted_id
    except DuplicateKeyError:
        raise ApiError("Username already exists", 409)
    return _session(user, 201)


@bp.post("/login")
def login():
    d = body()
    ident = text(d, "username").lower()
    users = get_db().users
    user = users.find_one({"username": ident}) or (users.find_one({"email": ident}) if "@" in ident else None)
    if user and not user.get("password_hash"):
        raise ApiError("This account uses Google sign-in. Please use 'Continue with Google'.", 401)
    if not user or not verify_password(user["password_hash"], text(d, "password")):
        raise ApiError("Invalid username or password", 401)
    return _session(user)


def verify_google_credential(credential, client_id):
    """Verify a Google Identity Services ID token (signature, expiry, issuer, audience)."""
    from google.oauth2 import id_token
    from google.auth.transport import requests as grequests
    info = id_token.verify_oauth2_token(credential, grequests.Request(), client_id)
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise ValueError("Wrong issuer")
    return info


def _unique_username(email):
    base = re.sub(r"[^a-z0-9_.]", "", email.split("@")[0].lower())[:24] or "student"
    name, i = base if len(base) >= 3 else f"{base}_g", 1
    while get_db().users.find_one({"username": name}):
        i += 1
        name = f"{base}{i}"
    return name


@bp.post("/google")
def google_login():
    """React sends the Google ID token; we verify it, then find, link or create the user."""
    client_id = current_app.config.get("GOOGLE_CLIENT_ID")
    if not client_id:
        raise ApiError("Google sign-in is not configured on the server (set GOOGLE_CLIENT_ID)", 503)
    credential = text(body(), "credential", maxlen=5000)
    try:
        info = verify_google_credential(credential, client_id)
    except Exception:
        raise ApiError("Google sign-in could not be verified. Please try again.", 401)
    if not info.get("email") or not info.get("email_verified"):
        raise ApiError("Your Google account email is not verified", 401)

    users, email, gid = get_db().users, info["email"].lower(), info["sub"]
    profile = {"profile_image": info.get("picture")}
    user = users.find_one({"google_id": gid})                      # 1. returning Google user
    if not user:
        user = users.find_one({"email": email})                     # 2. existing account with the same verified email
        if user:
            if user["role"] != "STUDENT":
                # never let a Google login take over a staff/admin account
                raise ApiError("Staff and admin accounts must sign in with username and password", 403)
            provider = "local+google" if user.get("password_hash") else "google"
            users.update_one({"_id": user["_id"]}, {"$set": {"google_id": gid, "auth_provider": provider, **profile}})
        else:                                                       # 3. brand-new STUDENT
            user = new_google_user(info.get("name") or email.split("@")[0], _unique_username(email), email, gid, info.get("picture"))
            try:
                user["_id"] = users.insert_one(user).inserted_id
            except DuplicateKeyError:
                raise ApiError("Account already exists, please try again", 409)
    else:
        users.update_one({"_id": user["_id"]}, {"$set": profile})
    return _session(users.find_one({"_id": user["_id"]}))


@bp.get("/me")
@auth_required()
def me():
    user = get_db().users.find_one({"_id": oid(g.user_id)})
    if not user:
        raise ApiError("User not found", 404)
    return jsonify(serialize(public(user)))
