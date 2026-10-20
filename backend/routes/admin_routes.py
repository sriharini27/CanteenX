from flask import Blueprint, jsonify, request
from db import get_db
from services import analytics_service
from utils.auth import auth_required
from utils.helpers import serialize

bp = Blueprint("admin", __name__, url_prefix="/api")


@bp.get("/admin/dashboard")
@auth_required("ADMIN")
def dashboard():
    return jsonify(serialize(analytics_service.dashboard()))


@bp.get("/admin/users")
@auth_required("ADMIN")
def users():
    return jsonify(serialize(list(get_db().users.find({}, {"password_hash": 0}).sort("role", 1).limit(200))))


@bp.get("/student/dashboard")
@auth_required("STUDENT")
def student_home():
    from services import queue_service
    from models.food import with_stock
    live = queue_service.live_metrics()
    foods = [with_stock(f) for f in get_db().food_items.find()]
    return jsonify(serialize({
        "status": live["status"], "queue_length": live["queue_length"], "est_wait_min": live["est_wait_new_min"],
        "active_counters": live["active_counters"], "orders_today": live["orders_today"],
        "available_count": sum(1 for f in foods if f["in_stock"]), "total_items": len(foods),
        "popular": analytics_service.popular_items(7, 4),
        "low_stock": [{"name": f["name"], "remaining": f["stock"]["remaining"]} for f in foods
                      if f["stock"]["remaining"] is not None and f["stock"]["remaining"] <= 10 and f.get("available", True)],
    }))


@bp.get("/reports/<kind>")
@auth_required("ADMIN")
def report(kind):
    return jsonify(serialize(analytics_service.report(kind, request.args)))
