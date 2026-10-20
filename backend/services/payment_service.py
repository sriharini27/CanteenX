"""Dummy payment gateway + payment state machine (no real money moves).

    PENDING ──Pay (UPI/CARD)──► PROCESSING ──► SUCCESS ──► order enters queue, stock/demand updated, points earned
                                     └────────► FAILED  ──► order waits (AWAITING_PAYMENT) → "Pay Now" → retry
    PENDING/FAILED ──student closes──► CANCELLED ──► still payable later via "Pay Now"
    PENDING ──Cash at counter──► PAY_AT_COUNTER ──► order enters queue ──staff "Confirm payment"──► SUCCESS
    SUCCESS ──order cancelled──► REFUNDED
"""
from pymongo import ReturnDocument
from db import get_db
from models.payment import METHODS, RETRYABLE, FAIL_UPI_SUFFIX, mock_txn_id, payment_record
from services import order_service
from utils.helpers import ApiError, oid, now


def _load(order_id, user_id=None):
    q = {"_id": oid(order_id)}
    if user_id:
        q["user_id"] = oid(user_id)
    order = get_db().orders.find_one(q)
    if not order:
        raise ApiError("Order not found", 404)
    return order


def _lock(order, method):
    """Atomically move a payable order to PROCESSING so a double click cannot pay twice."""
    locked = get_db().orders.find_one_and_update(
        {"_id": order["_id"], "status": "AWAITING_PAYMENT", "payment.status": {"$in": RETRYABLE}},
        {"$set": {"payment.status": "PROCESSING", "payment.method": method}, "$inc": {"payment.attempts": 1}},
        return_document=ReturnDocument.AFTER)
    if not locked:
        st = order.get("payment", {}).get("status")
        raise ApiError(f"This order cannot be paid now (payment is {st}, order is {order['status']})", 409)
    return locked


def _set(order, **fields):
    get_db().orders.update_one({"_id": order["_id"]}, {"$set": {f"payment.{k}": v for k, v in fields.items()}})


def pay(order_id, user_id, method, upi_id=None, test_decline=False):
    db = get_db()
    if method not in METHODS:
        raise ApiError(f"Payment method must be one of {', '.join(METHODS)}")
    order = _lock(_load(order_id, user_id), method)

    if method == "CASH":                                     # no money yet — staff confirm it at the counter
        try:
            order_service.commit_order(order)
        except ApiError as e:
            _set(order, status="FAILED", failure_reason=e.message)
            raise
        _set(order, status="PAY_AT_COUNTER", failure_reason=None)
        db.payments.insert_one(payment_record(order, "PAY_AT_COUNTER", method, note="Pay at counter on pickup"))
        return db.orders.find_one({"_id": order["_id"]})

    # UPI / CARD — dummy gateway decision (card details never reach the server)
    if method == "UPI":
        upi_id = (upi_id or "").strip().lower()
        if "@" not in upi_id or len(upi_id) < 5:
            _set(order, status="FAILED", failure_reason="Invalid UPI ID")
            db.payments.insert_one(payment_record(order, "FAILED", method, note="Invalid UPI ID"))
            raise ApiError("Enter a valid UPI ID, e.g. student@upi")
        declined = upi_id.endswith(FAIL_UPI_SUFFIX)
        reason = "Payment declined by the UPI app" if declined else None
    else:
        declined = bool(test_decline)
        reason = "Card declined by the issuing bank" if declined else None

    txn = mock_txn_id(method)
    if declined:
        _set(order, status="FAILED", txn_id=txn, failure_reason=reason)
        db.payments.insert_one(payment_record(order, "FAILED", method, txn, reason))
        return db.orders.find_one({"_id": order["_id"]})

    try:
        order_service.commit_order(order)                     # queue, stock, demand (may refuse if sold out)
    except ApiError as e:
        _set(order, status="FAILED", failure_reason=e.message)
        db.payments.insert_one(payment_record(order, "FAILED", method, txn, e.message))
        raise
    _set(order, status="SUCCESS", txn_id=txn, paid_at=now(), failure_reason=None)
    db.payments.insert_one(payment_record(order, "SUCCESS", method, txn, "Dummy gateway approved"))
    order_service.award_points(db.orders.find_one({"_id": order["_id"]}))
    return db.orders.find_one({"_id": order["_id"]})


def cancel(order_id, user_id):
    """Student closed the payment screen. The order stays unpaid and can be paid later."""
    db = get_db()
    order = _load(order_id, user_id)
    if order["status"] != "AWAITING_PAYMENT" or order["payment"]["status"] not in ("PENDING", "FAILED"):
        raise ApiError("Only an unpaid payment can be cancelled", 409)
    _set(order, status="CANCELLED", failure_reason="Payment cancelled by student")
    db.payments.insert_one(payment_record(order, "CANCELLED", order["payment"]["method"], note="Cancelled by student"))
    return db.orders.find_one({"_id": order["_id"]})


def confirm_cash(order_id):
    """Staff received the cash: PAY_AT_COUNTER -> SUCCESS (and reward points are earned)."""
    db = get_db()
    order = db.orders.find_one_and_update(
        {"_id": oid(order_id), "payment.status": "PAY_AT_COUNTER"},
        {"$set": {"payment.status": "SUCCESS", "payment.paid_at": now(), "payment.txn_id": mock_txn_id("CASH")}},
        return_document=ReturnDocument.AFTER)
    if not order:
        raise ApiError("This order is not waiting for a cash payment", 409)
    db.payments.insert_one(payment_record(order, "SUCCESS", "CASH", order["payment"]["txn_id"], "Cash received at counter"))
    order_service.award_points(order)
    return db.orders.find_one({"_id": order["_id"]})
