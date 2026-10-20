"""Rewards preserved from the Java app: points, daily spin & win, mess subscription, birthday discount."""
import random
from datetime import date
from flask import Blueprint, jsonify, g
from db import get_db
from models.user import is_birthday
from services.order_service import BIRTHDAY_OFF, SUBSCRIPTION_RATE, POINTS_PER_RUPEE, EARN_PER_RUPEES
from utils.auth import auth_required
from utils.helpers import ApiError, oid, serialize, now

bp = Blueprint("rewards", __name__, url_prefix="/api/rewards")


def _user():
    return get_db().users.find_one({"_id": oid(g.user_id)})


@bp.get("")
@auth_required("STUDENT")
def summary():
    u = _user()
    hist = list(get_db().rewards.find({"user_id": u["_id"]}).sort("created_at", -1).limit(30))
    return jsonify(serialize({
        "points": u.get("reward_points", 0), "points_value": round(u.get("reward_points", 0) / POINTS_PER_RUPEE, 2),
        "is_subscribed": u.get("is_subscribed", False), "birthday_today": is_birthday(u), "date_of_birth": u.get("date_of_birth"),
        "can_spin": u.get("last_spin_date") != date.today().isoformat(), "history": hist,
        "rules": {"birthday_off": BIRTHDAY_OFF, "subscription_pct": SUBSCRIPTION_RATE * 100,
                  "points_per_rupee": POINTS_PER_RUPEE, "earn_per_rupees": EARN_PER_RUPEES},
    }))


@bp.post("/spin")
@auth_required("STUDENT")
def spin():
    u, today = _user(), date.today().isoformat()
    if u.get("last_spin_date") == today:
        raise ApiError("You have already spun the wheel today!")
    won = random.randint(1, 10) * 10   # 10..100 points, as in the original app
    get_db().users.update_one({"_id": u["_id"]}, {"$inc": {"reward_points": won}, "$set": {"last_spin_date": today}})
    get_db().rewards.insert_one({"user_id": u["_id"], "type": "SPIN", "points": won, "note": "Daily spin & win", "created_at": now()})
    return jsonify(points=won, total=u.get("reward_points", 0) + won, message=f"You won {won} points!")


@bp.post("/subscription")
@auth_required("STUDENT")
def toggle_subscription():
    u = _user()
    new = not u.get("is_subscribed", False)
    get_db().users.update_one({"_id": u["_id"]}, {"$set": {"is_subscribed": new}})
    get_db().rewards.insert_one({"user_id": u["_id"], "type": "SUBSCRIPTION", "points": 0,
                                 "note": "Mess subscription started" if new else "Mess subscription cancelled", "created_at": now()})
    return jsonify(is_subscribed=new)
