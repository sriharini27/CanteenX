from flask import Blueprint, jsonify
from collections import Counter
from db import get_db
from services import queue_service
from utils.auth import auth_required
from utils.helpers import ApiError, body, num, text, oid, serialize, qint, iso

bp = Blueprint("queue", __name__, url_prefix="/api/queue")


@bp.get("/status")
@auth_required()
def status():
    return jsonify(queue_service.live_metrics())


@bp.get("/live")
@auth_required("STAFF", "ADMIN")
def live_queue():
    q, c = queue_service.active_queue(), queue_service.active_counters()
    rows = [{"id": str(o["_id"]), "order_no": o["order_no"], "user_name": o["user_name"], "status": o["status"],
             "items": [f"{i['qty']}× {i['name']}" for i in o["items"]], "created_at": iso(o["created_at"]),
             **queue_service.estimate(o["_id"], q, c)} for o in q]
    return jsonify(rows)


@bp.get("/workload")
@auth_required("STAFF", "ADMIN")
def workload():
    q = queue_service.active_queue()
    items = Counter()
    for o in q:
        for i in o["items"]: items[i["name"]] += i["qty"]
    return jsonify(total_work_min=round(sum(queue_service.remaining_work(o) for o in q), 1),
                   per_counter_min=round(sum(queue_service.remaining_work(o) for o in q) / queue_service.active_counters(), 1),
                   to_prepare=[{"name": k, "qty": v} for k, v in items.most_common()])


@bp.get("/events")
@auth_required("STAFF", "ADMIN")
def events():
    return jsonify(serialize(list(get_db().queue_events.find().sort("at", -1).limit(qint("limit", 30, 1, 200)))))


# ---------- service counters ----------
@bp.get("/counters")
@auth_required()
def counters():
    return jsonify(serialize(list(get_db().counters.find().sort("name", 1))))


@bp.post("/counters")
@auth_required("ADMIN")
def add_counter():
    d = body()
    doc = {"name": text(d, "name", maxlen=40), "active": bool(d.get("active", True)),
           "avg_service_min": num(d, "avg_service_min", 0.5, 30, default=3)}
    doc["_id"] = get_db().counters.insert_one(doc).inserted_id
    return jsonify(serialize(doc)), 201


@bp.put("/counters/<cid>")
@auth_required("ADMIN")
def update_counter(cid):
    d, upd = body(), {}
    if "name" in d: upd["name"] = text(d, "name", maxlen=40)
    if "active" in d: upd["active"] = bool(d["active"])
    if "avg_service_min" in d: upd["avg_service_min"] = num(d, "avg_service_min", 0.5, 30)
    if upd.get("active") is False and get_db().counters.count_documents({"active": True, "_id": {"$ne": oid(cid)}}) == 0:
        raise ApiError("At least one counter must stay active")
    if not get_db().counters.update_one({"_id": oid(cid)}, {"$set": upd}).matched_count:
        raise ApiError("Counter not found", 404)
    return jsonify(serialize(get_db().counters.find_one({"_id": oid(cid)})))


@bp.delete("/counters/<cid>")
@auth_required("ADMIN")
def delete_counter(cid):
    c = get_db().counters.find_one({"_id": oid(cid)})
    if not c: raise ApiError("Counter not found", 404)
    if c["active"] and get_db().counters.count_documents({"active": True}) <= 1:
        raise ApiError("At least one counter must stay active")
    get_db().counters.delete_one({"_id": c["_id"]})
    return jsonify(message="Deleted")
