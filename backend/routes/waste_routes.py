from datetime import date, timedelta
from flask import Blueprint, jsonify, request
from db import get_db
from services import waste_service, demand_service
from utils.auth import auth_required
from utils.helpers import ApiError, body, num, oid, serialize, parse_date, qint

bp = Blueprint("waste", __name__, url_prefix="/api")


@bp.get("/waste")
@auth_required("ADMIN")
def list_waste():
    end = parse_date(request.args.get("to"))
    start = parse_date(request.args.get("from"), end - timedelta(days=6))
    fid = oid(request.args["food_id"]) if request.args.get("food_id") else None
    recs = waste_service.list_records(start.isoformat(), end.isoformat(), fid)
    return jsonify(records=serialize(recs), summary=waste_service.summary(recs), start=start.isoformat(), end=end.isoformat())


@bp.post("/waste")
@auth_required("ADMIN", "STAFF")
def create_waste():
    d = body()
    food = get_db().food_items.find_one({"_id": oid(d.get("food_id"))})
    if not food: raise ApiError("Food item not found", 404)
    day = parse_date(d.get("date")).isoformat()
    rec = waste_service.upsert_record(food, day, num(d, "prepared", 0, 10000, cast=int), num(d, "sold", 0, 10000, cast=int), "MANUAL")
    return jsonify(serialize(rec)), 201


@bp.delete("/waste/<rid>")
@auth_required("ADMIN")
def delete_waste(rid):
    if not get_db().waste_records.delete_one({"_id": oid(rid)}).deleted_count:
        raise ApiError("Record not found", 404)
    return jsonify(message="Deleted")


# ---------- demand prediction & preparation optimisation ----------
@bp.get("/demand/prediction")
@auth_required("ADMIN", "STAFF")
def prediction():
    buffer = num(request.args, "buffer", 0, 100, default=5)
    period = request.args.get("period") or None
    return jsonify(demand_service.predictions(parse_date(request.args.get("date")), buffer, period))


@bp.get("/demand/history/<fid>")
@auth_required("ADMIN")
def history(fid):
    days = qint("days", 28, 7, 120)
    since = (date.today() - timedelta(days=days)).isoformat()
    recs = list(get_db().demand_records.find({"food_id": oid(fid), "date": {"$gte": since, "$lt": date.today().isoformat()}}, {"_id": 0, "food_id": 0}).sort("date", 1))
    return jsonify(recs)


@bp.get("/demand/peak-hours")
@auth_required("ADMIN", "STAFF")
def peak_hours():
    return jsonify(demand_service.peak_hours(qint("days", 14, 1, 90)))


@bp.get("/demand/backtest")
@auth_required("ADMIN")
def backtest():
    return jsonify(demand_service.backtest(qint("days", 7, 1, 60), num(request.args, "buffer", 0, 100, default=5)))


@bp.post("/demand/rebuild")
@auth_required("ADMIN")
def rebuild():
    return jsonify(records=demand_service.rebuild_demand_records())
