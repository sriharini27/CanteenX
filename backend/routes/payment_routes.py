"""Simulated payments: price quote, dummy gateway, cash confirmation, payment history. No real transactions."""
from flask import Blueprint, jsonify, g
from db import get_db
from services import order_service, payment_service
from utils.auth import auth_required
from utils.helpers import body, oid, serialize, qint

bp = Blueprint("payments", __name__, url_prefix="/api/payments")


@bp.post("/quote")
@auth_required("STUDENT")
def quote():
    d = body()
    user = get_db().users.find_one({"_id": oid(g.user_id)})
    return jsonify(serialize(order_service.quote(user, d.get("items"), bool(d.get("use_points")))))


@bp.post("/<order_id>/pay")
@auth_required("STUDENT")
def pay(order_id):
    """Body: {method: UPI|CARD|CASH, upi_id?: str, test_decline?: bool}. Card numbers are never sent."""
    d = body()
    order = payment_service.pay(order_id, g.user_id, d.get("method"), d.get("upi_id"), bool(d.get("test_decline")))
    return jsonify(serialize(order_service.with_live_eta(order)))


@bp.post("/<order_id>/cancel")
@auth_required("STUDENT")
def cancel(order_id):
    return jsonify(serialize(payment_service.cancel(order_id, g.user_id)))


@bp.post("/<order_id>/confirm-cash")
@auth_required("STAFF", "ADMIN")
def confirm_cash(order_id):
    return jsonify(serialize(order_service.with_live_eta(payment_service.confirm_cash(order_id))))


@bp.get("/order/<order_id>")
@auth_required()
def order_payments(order_id):
    q = {"order_id": oid(order_id)}
    if g.role == "STUDENT":
        q["user_id"] = oid(g.user_id)
    return jsonify(serialize(list(get_db().payments.find(q).sort("at", -1))))


@bp.get("")
@auth_required()
def history():
    q = {} if g.role in ("ADMIN", "STAFF") else {"user_id": oid(g.user_id)}
    return jsonify(serialize(list(get_db().payments.find(q).sort("at", -1).limit(qint("limit", 100, 1, 500)))))
