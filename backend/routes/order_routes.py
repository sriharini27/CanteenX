from flask import Blueprint, jsonify, request, g
from db import get_db
from models.order import STATUSES, ACTIVE
from services import order_service, queue_service
from utils.auth import auth_required
from utils.helpers import ApiError, body, oid, serialize, day_start, parse_date, qint
from datetime import timedelta

bp = Blueprint("orders", __name__, url_prefix="/api/orders")


def _me():
    u = get_db().users.find_one({"_id": oid(g.user_id)})
    if not u: raise ApiError("User not found", 401)
    return u


@bp.post("")
@auth_required("STUDENT")
def place():
    """Creates an AWAITING_PAYMENT order; the client then opens /student/payment/<id>."""
    d = body()
    order = order_service.place_order(_me(), d.get("items"), d.get("payment_method", "UPI"), bool(d.get("use_points")))
    return jsonify(serialize(order_service.with_live_eta(order))), 201


@bp.get("")
@auth_required()
def list_orders():
    q = {}
    if g.role == "STUDENT":
        q["user_id"] = oid(g.user_id)
    if (s := request.args.get("status")) and s != "ALL":
        q["status"] = {"$in": [x for x in s.split(",") if x in STATUSES]}
    if request.args.get("scope") == "active":
        q["status"] = {"$in": ACTIVE + ["READY"]}
    if dt := request.args.get("date"):
        d = parse_date(dt)
        q["created_at"] = {"$gte": day_start(d), "$lt": day_start(d + timedelta(days=1))}
    limit = qint("limit", 200, 1, 1000)
    orders = list(get_db().orders.find(q).sort("created_at", -1).limit(limit))
    queue, c = queue_service.active_queue(), queue_service.active_counters()
    return jsonify(serialize([order_service.with_live_eta(o, queue, c) for o in orders]))


@bp.get("/<order_id>")
@auth_required()
def get_order(order_id):
    o = get_db().orders.find_one({"_id": oid(order_id)})
    if not o or (g.role == "STUDENT" and str(o["user_id"]) != g.user_id):
        raise ApiError("Order not found", 404)
    return jsonify(serialize(order_service.with_live_eta(o)))


@bp.put("/<order_id>/status")
@auth_required("STAFF", "ADMIN")
def update_status(order_id):
    status = body().get("status")
    if status not in STATUSES:
        raise ApiError("Invalid status")
    return jsonify(serialize(order_service.change_status(order_id, status, g.role)))


@bp.post("/<order_id>/cancel")
@auth_required("STUDENT")
def cancel_own(order_id):
    o = get_db().orders.find_one({"_id": oid(order_id), "user_id": oid(g.user_id)})
    if not o: raise ApiError("Order not found", 404)
    if o["status"] not in ("AWAITING_PAYMENT", "PENDING"):
        raise ApiError("Only unpaid orders or orders not yet accepted can be cancelled")
    return jsonify(serialize(order_service.change_status(order_id, "CANCELLED", g.role)))
