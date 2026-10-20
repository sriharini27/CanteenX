"""Order placement, pricing (rewards logic preserved from the Java OrderService) and status workflow."""
from pymongo import ReturnDocument
from db import get_db
from models.food import stock_view
from models.order import TRANSITIONS, TIMESTAMP_FIELD, ACTIVE
from models.payment import payment_record, METHODS
from models.queue import queue_event
from models.user import is_birthday
from services import queue_service, demand_service
from utils.helpers import ApiError, oid, now, today_str, meal_period_of, minutes_between

BIRTHDAY_OFF = 50.0          # flat Rs 50 on your birthday
SUBSCRIPTION_RATE = 0.20     # mess subscribers get 20 % off
POINTS_PER_RUPEE = 10        # 10 points = Rs 1 when redeeming
EARN_PER_RUPEES = 10         # earn 1 point for every Rs 10 paid


def _resolve_items(raw):
    if not isinstance(raw, list) or not raw:
        raise ApiError("Your cart is empty")
    db, lines = get_db(), {}
    for r in raw:
        try:
            qty = int(r.get("qty", 0))
        except (TypeError, ValueError):
            raise ApiError("Quantity must be a whole number")
        if qty < 1 or qty > 20:
            raise ApiError("Quantity must be between 1 and 20")
        fid = oid(r.get("food_id"))
        lines[fid] = lines.get(fid, 0) + qty
    items = []
    for fid, qty in lines.items():
        f = db.food_items.find_one({"_id": fid})
        if not f:
            raise ApiError("A food item in your cart no longer exists")
        if not f.get("available", True):
            raise ApiError(f"{f['name']} is currently unavailable")
        rem = stock_view(f)["remaining"]
        if rem is not None and qty > rem:
            raise ApiError(f"Only {rem} portion(s) of {f['name']} left today")
        items.append({"food_id": f["_id"], "name": f["name"], "price": f["price"], "qty": qty,
                      "prep_time": f.get("prep_time", 3), "is_veg": f.get("is_veg", True), "image_url": f.get("image_url")})
    return items


def quote(user, raw_items, use_points=False):
    items = _resolve_items(raw_items)
    subtotal = round(sum(i["price"] * i["qty"] for i in items), 2)
    total, disc = subtotal, {"birthday": 0.0, "subscription": 0.0, "points": 0.0}
    if is_birthday(user):
        disc["birthday"] = min(BIRTHDAY_OFF, total); total -= disc["birthday"]
    if user.get("is_subscribed"):
        disc["subscription"] = round(total * SUBSCRIPTION_RATE, 2); total -= disc["subscription"]
    redeemed = 0
    if use_points and user.get("reward_points", 0) > 0:
        disc["points"] = round(min(user["reward_points"] / POINTS_PER_RUPEE, total), 2)
        redeemed = int(round(disc["points"] * POINTS_PER_RUPEE))
        total -= disc["points"]
    total = round(max(0.0, total), 2)
    work = queue_service.work_minutes(items)
    eta = queue_service.estimate_new(work)
    return {"items": items, "subtotal": subtotal, "discounts": disc, "total": total,
            "points_redeemed": redeemed, "points_earned": int(total // EARN_PER_RUPEES),
            "available_points": user.get("reward_points", 0), "birthday": is_birthday(user),
            "subscribed": bool(user.get("is_subscribed")), "work_min": work, "est_wait_min": eta["est_wait_min"]}


def next_order_no():
    seq = get_db().sequences.find_one_and_update({"_id": "order_no"}, {"$inc": {"value": 1}},
                                                 upsert=True, return_document=ReturnDocument.AFTER)
    return seq["value"]


def place_order(user, raw_items, method, use_points=False):
    """Step 1 of checkout: create an order that is AWAITING_PAYMENT.
    Nothing irreversible happens yet — no queue entry, stock, demand or reward points.
    Those only happen in commit_order() once payment succeeds (or the student picks cash at the counter)."""
    if method not in METHODS:
        raise ApiError(f"Payment method must be one of {', '.join(METHODS)}")
    db, q, t = get_db(), quote(user, raw_items, use_points), now()
    order = {
        "order_no": next_order_no(), "user_id": user["_id"], "user_name": user["name"],
        "items": q["items"], "subtotal": q["subtotal"], "discounts": q["discounts"], "total": q["total"],
        "points_redeemed": q["points_redeemed"], "points_earned": q["points_earned"],
        "status": "AWAITING_PAYMENT", "meal_period": meal_period_of(t), "date": today_str(), "work_min": q["work_min"],
        "ordered_at": t, "created_at": t, "confirmed_at": None, "prep_started_at": None, "ready_at": None,
        "completed_at": None, "cancelled_at": None, "wait_min": None, "committed": False, "points_awarded": False,
        "payment": {"method": method, "status": "PENDING", "txn_id": None, "attempts": 0, "paid_at": None, "failure_reason": None},
    }
    order["_id"] = db.orders.insert_one(order).inserted_id
    return order


def commit_order(order):
    """Payment accepted (SUCCESS or PAY_AT_COUNTER): the order enters the live queue.
    created_at becomes the queue-entry time, so waiting-time analytics measure real queueing."""
    db, t = get_db(), now()
    if order.get("committed"):
        return
    for it in order["items"]:                       # stock may have run out while the order was unpaid
        f = db.food_items.find_one({"_id": it["food_id"]})
        if not f:
            raise ApiError(f"{it['name']} is no longer on the menu — please cancel and order again", 409)
        rem = stock_view(f)["remaining"]
        if rem is not None and it["qty"] > rem:
            raise ApiError(f"Sorry, only {rem} portion(s) of {it['name']} left — please cancel and re-order", 409)
    if order.get("points_redeemed"):
        user = db.users.find_one({"_id": order["user_id"]})
        if user.get("reward_points", 0) < order["points_redeemed"]:
            raise ApiError("Your reward points are no longer sufficient — please cancel and re-order", 409)
        db.users.update_one({"_id": order["user_id"]}, {"$inc": {"reward_points": -order["points_redeemed"]}})
        db.rewards.insert_one({"user_id": order["user_id"], "type": "REDEEM", "points": -order["points_redeemed"], "note": f"Order #{order['order_no']}", "created_at": t})
    day = today_str()
    upd = {"status": "PENDING", "committed": True, "created_at": t, "date": day, "meal_period": meal_period_of(t)}
    db.orders.update_one({"_id": order["_id"]}, {"$set": upd})
    for it in order["items"]:
        _adjust_stock(it["food_id"], it["qty"])
        demand_service.record_sale(it, it["qty"], day)
    db.order_items.insert_many([{"order_id": order["_id"], "food_id": i["food_id"], "name": i["name"], "qty": i["qty"],
                                 "price": i["price"], "date": day, "hour": t.hour, "meal_period": upd["meal_period"],
                                 "created_at": t} for i in order["items"]])
    est = queue_service.estimate(order["_id"])
    db.orders.update_one({"_id": order["_id"]}, {"$set": {
        "est_position": est["queue_position"], "est_wait_min": est["est_wait_min"], "est_pickup_at": est["est_pickup_at"]}})
    db.queue_events.insert_one(queue_event(order, "PENDING", len(queue_service.active_queue())))


def award_points(order):
    """Reward points are earned only once the payment is SUCCESS."""
    db = get_db()
    if order.get("points_earned") and not order.get("points_awarded"):
        db.users.update_one({"_id": order["user_id"]}, {"$inc": {"reward_points": order["points_earned"]}})
        db.rewards.insert_one({"user_id": order["user_id"], "type": "EARN", "points": order["points_earned"], "note": f"Order #{order['order_no']}", "created_at": now()})
        db.orders.update_one({"_id": order["_id"]}, {"$set": {"points_awarded": True}})


def _adjust_stock(food_id, qty):
    db = get_db()
    f = db.food_items.find_one({"_id": food_id})
    s = f.get("stock") or {}
    if s.get("date") != today_str():
        s = {"date": today_str(), "prepared": None, "sold": 0}
    s["sold"] = max(0, s.get("sold", 0) + qty)
    db.food_items.update_one({"_id": food_id}, {"$set": {"stock": s}})


def change_status(order_id, new_status, role):
    db, t = get_db(), now()
    order = db.orders.find_one({"_id": oid(order_id)})
    if not order:
        raise ApiError("Order not found", 404)
    if new_status not in TRANSITIONS.get(order["status"], []):
        raise ApiError(f"Cannot move an order from {order['status']} to {new_status}")
    upd = {"status": new_status, TIMESTAMP_FIELD[new_status]: t}
    if new_status == "READY":
        upd["wait_min"] = round(minutes_between(order["created_at"], t), 1)
        if not order.get("prep_started_at"): upd["prep_started_at"] = t
    pay_status = order.get("payment", {}).get("status")
    if new_status == "COMPLETED" and pay_status != "SUCCESS":
        raise ApiError("Confirm the cash payment before completing this order" if pay_status == "PAY_AT_COUNTER"
                       else "This order has not been paid yet")
    if new_status == "CANCELLED":
        if order.get("committed", order["status"] != "AWAITING_PAYMENT"):   # orders from older builds lack the flag
            _undo_order(order)
        # money was taken -> refund; otherwise the payment simply did not happen
        upd["payment.status"] = "REFUNDED" if pay_status == "SUCCESS" else "CANCELLED"
        db.payments.insert_one(payment_record(order, upd["payment.status"], order["payment"]["method"], note="Order cancelled"))
    db.orders.update_one({"_id": order["_id"]}, {"$set": upd})
    db.queue_events.insert_one(queue_event(order, new_status, len(queue_service.active_queue())))
    return db.orders.find_one({"_id": order["_id"]})


def _undo_order(order):
    """Cancelling returns stock, demand and reward points."""
    db = get_db()
    for it in order["items"]:
        _adjust_stock(it["food_id"], -it["qty"])
        demand_service.record_sale(it, it["qty"], order["date"], sign=-1)
    db.order_items.delete_many({"order_id": order["_id"]})
    delta = order.get("points_redeemed", 0) - (order.get("points_earned", 0) if order.get("points_awarded", True) else 0)
    if delta:
        db.users.update_one({"_id": order["user_id"]}, {"$inc": {"reward_points": delta}})
        db.rewards.insert_one({"user_id": order["user_id"], "type": "REFUND", "points": delta,
                               "note": f"Order #{order['order_no']} cancelled", "created_at": now()})


def with_live_eta(order, queue=None, counters=None):
    o = dict(order)
    if order["status"] in ACTIVE:
        o["live"] = queue_service.estimate(order["_id"], queue, counters)
    return o
