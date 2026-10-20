from datetime import date, timedelta, datetime
from collections import Counter
from flask import Blueprint, jsonify, request, g
from db import get_db
from models.simulation import DEFAULT_PARAMS, validate_params
from services import simulation_service as sim, analytics_service, queue_service
from utils.auth import auth_required
from utils.helpers import ApiError, body, oid, serialize, now, mean, minutes_between, qint

bp = Blueprint("simulation", __name__, url_prefix="/api")


def _save(kind, label, params, results):
    run = {"type": kind, "label": label, "params": params, "results": results, "created_by": g.user_id, "created_at": now()}
    run["_id"] = get_db().simulation_runs.insert_one(run).inserted_id
    return run


@bp.get("/simulation/defaults")
@auth_required("ADMIN")
def defaults():
    return jsonify(demo=DEFAULT_PARAMS, from_data=params_from_data())


def params_from_data(days=14):
    """Derive simulation inputs from real order history (lunch window 11:00-16:00)."""
    db = get_db()
    since = datetime.combine(date.today() - timedelta(days=days), datetime.min.time())
    orders = list(db.orders.find({"created_at": {"$gte": since}, "status": {"$nin": ["CANCELLED", "AWAITING_PAYMENT"]}, "meal_period": "LUNCH"},
                                 {"created_at": 1, "prep_started_at": 1, "ready_at": 1, "date": 1}))
    if not orders:
        return None
    n_days = len({o["date"] for o in orders})
    by_slot = Counter((o["created_at"].hour * 60 + o["created_at"].minute) // 30 for o in orders)
    peak_slot, peak_n = by_slot.most_common(1)[0]
    lunch_min = 300
    svc = [minutes_between(o.get("prep_started_at"), o.get("ready_at")) for o in orders if o.get("ready_at") and o.get("prep_started_at")]
    return {**DEFAULT_PARAMS,
            "students": round(len(orders) / n_days), "duration": lunch_min,
            "counters": queue_service.active_counters(), "service_time": round(mean(svc) or 3, 2),
            "arrival_rate": round(len(orders) / n_days / lunch_min, 3),
            "peak_rate": round(peak_n / n_days / 30, 3),
            "peak_start": peak_slot * 30 - 11 * 60, "peak_end": peak_slot * 30 - 11 * 60 + 30,
            "prep_time": 0, "source": f"{len(orders)} lunch orders over {n_days} days",
            "explain": {
                "students": f"average lunch orders per day = {len(orders)} ÷ {n_days} days",
                "arrival_rate": f"students per minute over the 11:00–16:00 lunch window ({lunch_min} min)",
                "peak_rate": f"busiest 30-minute slot ({peak_slot * 30 // 60:02d}:{peak_slot * 30 % 60:02d}–{(peak_slot * 30 + 30) // 60:02d}:{(peak_slot * 30 + 30) % 60:02d}) averages {peak_n / n_days:.1f} orders",
                "peak_start": "minutes after 11:00 when that busiest slot starts",
                "service_time": f"average 'preparation started → ready' time of {len(svc)} served orders",
                "counters": "service counters currently switched on in Queue Management",
                "prep_time": "0 = the live canteen has a single service stage (counter staff also hand over)",
            }}


@bp.post("/simulation/run")
@auth_required("ADMIN")
def run():
    d = body()
    p = validate_params(d)
    res = sim.simulate(p)
    run = _save("SINGLE", d.get("label") or f"{p['counters']} counters · {p['students']} students", p, res) if d.get("save", True) else None
    return jsonify(id=str(run["_id"]) if run else None, params=p, results=res)


@bp.post("/simulation/compare")
@auth_required("ADMIN")
def compare():
    d = body()
    p = validate_params(d)
    options = sorted({int(c) for c in d.get("counter_options", [1, 2, 3, 4, 5, 6]) if 1 <= int(c) <= 12})
    if not options: raise ApiError("Choose at least one counter option")
    res = sim.compare_counters(p, options, int(d.get("baseline") or p["counters"]))
    meeting = [r for r in res["rows"] if r["avg_wait"] <= p["target_wait"]]
    if meeting:
        best = meeting[0]
        rec = {"counters": best["counters"], "met": True, "avg_wait": best["avg_wait"],
               "reason": f"{best['counters']} counter{'s' if best['counters'] > 1 else ''} {'are' if best['counters'] > 1 else 'is'} the minimum configuration "
                         f"that achieves the target average waiting time of {p['target_wait']:g} minutes "
                         f"(simulated average {best['avg_wait']} min)."}
    else:
        best = res["rows"][-1]
        rec = {"counters": best["counters"], "met": False, "avg_wait": best["avg_wait"],
               "reason": f"None of the tested configurations reaches the {p['target_wait']:g}-minute target; even "
                         f"{best['counters']} counters give {best['avg_wait']} min. Reduce service time or add preparation capacity."}
    res["recommendation"] = rec
    run = _save("COMPARE", f"Counter comparison {options}", p, res)
    return jsonify(id=str(run["_id"]), params=p, results=res, recommended=rec["counters"], recommendation=rec)


@bp.get("/simulation/runs")
@auth_required("ADMIN")
def runs():
    q = {"type": request.args["type"]} if request.args.get("type") else {}
    docs = list(get_db().simulation_runs.find(q, {"results.timeline": 0, "results.rows.timeline": 0}).sort("created_at", -1).limit(qint("limit", 20, 1, 100)))
    return jsonify(serialize(docs))


@bp.get("/simulation/runs/<rid>")
@auth_required("ADMIN")
def get_run(rid):
    r = get_db().simulation_runs.find_one({"_id": oid(rid)})
    if not r: raise ApiError("Run not found", 404)
    return jsonify(serialize(r))


@bp.delete("/simulation/runs/<rid>")
@auth_required("ADMIN")
def delete_run(rid):
    if not get_db().simulation_runs.delete_one({"_id": oid(rid)}).deleted_count:
        raise ApiError("Run not found", 404)
    return jsonify(message="Deleted")


@bp.post("/optimization/before-after")
@auth_required("ADMIN")
def before_after():
    return jsonify(serialize(analytics_service.before_after(request.get_json(silent=True) or {}, g.user_id)))


@bp.get("/optimization/latest")
@auth_required("ADMIN")
def latest():
    r = get_db().simulation_runs.find_one({"type": "BEFORE_AFTER"}, sort=[("created_at", -1)])
    return jsonify(serialize(r) if r else None)
