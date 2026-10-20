"""Simulated payments — a dummy gateway for the college project. No real money, no card data stored or sent.

order.payment (current state, embedded in the order):
    { method: UPI|CARD|CASH, status, txn_id, attempts, paid_at, failure_reason }
payments collection (append-only log, one document per attempt / event):
    { order_id, order_no, user_id, amount, method, status, txn_id, note, at }

Payment states
    PENDING         order created, nothing paid yet
    PROCESSING      dummy gateway is handling an attempt (shown in the UI while it runs)
    SUCCESS         paid  -> order enters the queue, points are awarded
    FAILED          attempt declined -> order waits, student can retry ("Pay Now")
    CANCELLED       student closed the payment, or the unpaid order was cancelled
    PAY_AT_COUNTER  cash chosen -> order enters the queue; staff confirm the cash later -> SUCCESS
    REFUNDED        a paid order was cancelled
"""
import random
from utils.helpers import now

METHODS = ["UPI", "CARD", "CASH"]
STATES = ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "CANCELLED", "PAY_AT_COUNTER", "REFUNDED"]
RETRYABLE = ["PENDING", "FAILED", "CANCELLED"]     # student may (re)try payment from these states

# Dummy-gateway test values (documented in the README and shown on the payment page)
FAIL_UPI_SUFFIX = "@fail"                  # e.g. student@fail is declined
DECLINE_CARD = "4000000000000002"          # checked in the browser only; the card number never leaves it


def mock_txn_id(method):
    return f"{method}-{now():%Y%m%d}-{random.randint(100000, 999999)}"


def payment_record(order, status, method, txn_id=None, note=None):
    return {"order_id": order["_id"], "order_no": order["order_no"], "user_id": order["user_id"],
            "amount": round(order["total"], 2), "method": method, "status": status, "txn_id": txn_id,
            "note": note, "at": now()}
