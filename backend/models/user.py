"""users collection.
{ _id, name, username, password_hash (local accounts only), role: STUDENT|STAFF|ADMIN,
  email, auth_provider: local|google|local+google, google_id, profile_image,
  date_of_birth: 'YYYY-MM-DD'|None, reward_points, is_subscribed, last_spin_date, created_at }
Optional fields (email, google_id, password_hash) are omitted rather than stored as null so the
unique sparse indexes on email / google_id allow many accounts without them."""
from datetime import date
from utils.auth import hash_password
from utils.helpers import now

ROLES = ["STUDENT", "STAFF", "ADMIN"]


def new_user(name, username, password, role="STUDENT", dob=None, points=0, subscribed=False, email=None):
    u = {
        "name": name, "username": username.lower(), "password_hash": hash_password(password), "role": role,
        "auth_provider": "local", "date_of_birth": dob, "reward_points": points, "is_subscribed": subscribed,
        "last_spin_date": None, "created_at": now(),
    }
    if email:
        u["email"] = email.lower()
    return u


def new_google_user(name, username, email, google_id, picture=None):
    """Self-created Google accounts are always STUDENT and have no password."""
    return {
        "name": name, "username": username, "role": "STUDENT", "email": email.lower(), "google_id": google_id,
        "auth_provider": "google", "profile_image": picture, "date_of_birth": None, "reward_points": 0,
        "is_subscribed": False, "last_spin_date": None, "created_at": now(),
    }


def is_birthday(user, today=None):
    dob = user.get("date_of_birth")
    if not dob:
        return False
    t = today or date.today()
    return dob[5:] == t.isoformat()[5:]  # compare MM-DD


def public(user):
    """User document without secrets (serialize() also strips password_hash)."""
    return {k: v for k, v in user.items() if k not in ("password_hash", "google_id")}
