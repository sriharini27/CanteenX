"""Live queue management and the explainable waiting-time estimate.

Work time of one order (minutes):
    work = longest item prep time + 0.5 x (total portions - 1)
    -> the slowest item sets the pace, every extra portion adds ~30 s.

Estimated waiting time of an order at FIFO position p with c active counters:
    ETA = (sum of remaining work of the orders ahead) / c  +  own work
    (an order already PREPARING only counts its remaining work: work - minutes since prep started)
"""
from datetime import timedelta
from db import get_db
from models.order import ACTIVE, NOT_COUNTED
from utils.helpers import now, day_start, minutes_between, mean, iso

EXTRA_PORTION_MIN = 0.5


def work_minutes(items):
    if not items:
        return 0.0
    longest = max(i["prep_time"] for i in items)
    portions = sum(i["qty"] for i in items)
    return round(longest + EXTRA_PORTION_MIN * (portions - 1), 2)


def active_counters():
    return max(1, get_db().counters.count_documents({"active": True}))


def remaining_work(order, t=None):
    if order["status"] == "PREPARING" and order.get("prep_started_at"):
        done = minutes_between(order["prep_started_at"], t or now())
        return max(0.5, order["work_min"] - done)
    return order["work_min"]


def active_queue():
    """Orders not yet READY, oldest first (FIFO)."""
    return list(get_db().orders.find({"status": {"$in": ACTIVE}}).sort("created_at", 1))


def estimate(order_id=None, queue=None, counters=None, t=None):
    """Position, ETA and pickup time for one queued order."""
    t, queue = t or now(), queue if queue is not None else active_queue()
    c = counters or active_counters()
    for idx, o in enumerate(queue):
        if o["_id"] == order_id:
            own = remaining_work(o, t)
            ahead = 0.0 if o["status"] == "PREPARING" else sum(remaining_work(a, t) for a in queue[:idx])
            eta = round(ahead / c + own, 1)
            return {"queue_position": idx + 1, "ahead": idx, "counters": c, "work_min": o["work_min"],
                    "ahead_work_min": round(ahead, 1), "est_wait_min": eta,
                    "est_pickup_at": iso(t + timedelta(minutes=eta)),
                    "formula": f"({ahead:.1f} min ahead / {c} counters) + {own:.1f} min own work = {eta} min"}
    return None


def estimate_new(items_work=None):
    """What a new order would wait right now (used on the student dashboard)."""
    q, c = active_queue(), active_counters()
    own = items_work or 3.0
    ahead = sum(remaining_work(o) for o in q)
    return {"queue_length": len(q), "counters": c, "est_wait_min": round(ahead / c + own, 1)}


def queue_timeline(orders, start, end, step_min=10):
    """Queue length (orders placed but not yet ready) sampled every step_min minutes."""
    pts, t = [], start
    while t <= end:
        n = sum(1 for o in orders if o["created_at"] <= t and
                not (o.get("ready_at") and o["ready_at"] <= t) and
                not (o.get("cancelled_at") and o["cancelled_at"] <= t))
        pts.append({"time": t.strftime("%H:%M"), "queue": n})
        t += timedelta(minutes=step_min)
    return pts


def max_queue(orders):
    """Sweep-line over +1 (order placed) / -1 (ready or cancelled) events."""
    ev = []
    for o in orders:
        ev.append((o["created_at"], 1))
        end = o.get("ready_at") or o.get("cancelled_at")
        if end: ev.append((end, -1))
    cur = best = 0
    for _, d in sorted(ev, key=lambda e: (e[0], e[1])):
        cur += d
        best = max(best, cur)
    return best


def live_metrics():
    db, t = get_db(), now()
    start = day_start()
    today = list(db.orders.find({"created_at": {"$gte": start}}))
    valid = [o for o in today if o["status"] not in NOT_COUNTED]
    queue = active_queue()
    counters = list(db.counters.find())
    c = max(1, sum(1 for k in counters if k["active"]))
    served = [o for o in valid if o.get("ready_at")]
    waits = [o.get("wait_min") for o in served]
    service = [minutes_between(o.get("prep_started_at"), o.get("ready_at")) for o in served if o.get("prep_started_at")]
    avg_service = mean(service) or mean([k["avg_service_min"] for k in counters]) or 3.0
    last_hour = [o for o in valid if o["created_at"] >= t - timedelta(hours=1)]
    lam = len(last_hour) / 60.0  # arrivals per minute
    first = min((o["created_at"] for o in valid), default=t)
    hours_open = max(minutes_between(first, t) / 60, 1 / 60)
    util = min(1.0, lam * avg_service / c)
    return {
        "time": iso(t),
        "queue_length": len(queue),
        "students_waiting": len(queue) + sum(1 for o in valid if o["status"] == "READY"),
        "pending": sum(1 for o in queue if o["status"] == "PENDING"),
        "confirmed": sum(1 for o in queue if o["status"] == "CONFIRMED"),
        "preparing": sum(1 for o in queue if o["status"] == "PREPARING"),
        "ready": sum(1 for o in valid if o["status"] == "READY"),
        "active_orders": len(queue),
        "active_counters": c, "total_counters": len(counters),
        "arrival_rate_per_hr": round(lam * 60, 1),
        "avg_service_min": round(avg_service, 2),
        "avg_wait_min": mean(waits), "max_wait_min": round(max(waits), 1) if waits else 0,
        "max_queue_today": max_queue(valid),
        "orders_today": len(valid), "completed_today": sum(1 for o in valid if o["status"] == "COMPLETED"),
        "served_today": len(served),
        "throughput_per_hr": round(len(served) / hours_open, 1),
        "utilization_pct": round(util * 100, 1),
        "est_wait_new_min": estimate_new()["est_wait_min"],
        "status": "Quiet" if util < 0.5 else "Busy" if util < 0.85 else "Very busy",
    }
