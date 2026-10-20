"""counters + queue_events collections.
counters:     { _id, name, active, avg_service_min }
queue_events: { _id, order_id, order_no, event (status), queue_length, at }"""
from utils.helpers import now

DEFAULT_COUNTERS = [
    {"name": "Counter 1", "active": True, "avg_service_min": 3.0},
    {"name": "Counter 2", "active": True, "avg_service_min": 3.0},
    {"name": "Counter 3", "active": False, "avg_service_min": 3.0},
    {"name": "Counter 4", "active": False, "avg_service_min": 3.0},
]


def queue_event(order, event, queue_length):
    return {"order_id": order["_id"], "order_no": order.get("order_no"), "event": event,
            "queue_length": queue_length, "at": now()}
