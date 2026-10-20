"""Menu (search / filter as in the Java FoodItemService) + admin CRUD + daily inventory."""
import re
from flask import Blueprint, jsonify, request, current_app
from db import get_db
from models.food import food_from_payload, with_stock, stock_view
from services import waste_service, demand_service, image_service
from utils.auth import auth_required
from utils.helpers import ApiError, body, num, oid, serialize, today_str
from datetime import date

bp = Blueprint("foods", __name__, url_prefix="/api/foods")


@bp.get("")
@auth_required()
def list_foods():
    q = {}
    if s := request.args.get("search", "").strip():
        q["name"] = {"$regex": re.escape(s), "$options": "i"}
    if (t := request.args.get("type", "ALL")) in ("VEG", "NON_VEG"):
        q["is_veg"] = t == "VEG"
    if (c := request.args.get("category")) and c != "ALL":
        q["category"] = c
    if request.args.get("available") == "true":
        q["available"] = True
    foods = [with_stock(f) for f in get_db().food_items.find(q).sort([("category", 1), ("name", 1)])]
    return jsonify(serialize(foods))


@bp.get("/<fid>")
@auth_required()
def get_food(fid):
    f = get_db().food_items.find_one({"_id": oid(fid)})
    if not f: raise ApiError("Food item not found", 404)
    return jsonify(serialize(with_stock(f)))


@bp.post("")
@auth_required("ADMIN")
def create_food():
    doc = food_from_payload(body())
    doc["_id"] = get_db().food_items.insert_one(doc).inserted_id
    return jsonify(serialize(with_stock(doc))), 201


@bp.put("/<fid>")
@auth_required("ADMIN")
def update_food(fid):
    upd = food_from_payload(body(), partial=True)
    if not upd: raise ApiError("Nothing to update")
    old = get_db().food_items.find_one({"_id": oid(fid)}, {"image_url": 1})
    if not old: raise ApiError("Food item not found", 404)
    get_db().food_items.update_one({"_id": oid(fid)}, {"$set": upd})
    if "image_url" in upd and upd["image_url"] != old.get("image_url"):   # image replaced
        image_service.delete_if_unused(old.get("image_url"), current_app.config)
    # Past orders keep their own price/name snapshot, so price changes only affect new orders.
    return jsonify(serialize(with_stock(get_db().food_items.find_one({"_id": oid(fid)}))))


@bp.patch("/<fid>/availability")
@auth_required("ADMIN", "STAFF")
def toggle_availability(fid):
    f = get_db().food_items.find_one({"_id": oid(fid)})
    if not f: raise ApiError("Food item not found", 404)
    get_db().food_items.update_one({"_id": f["_id"]}, {"$set": {"available": not f.get("available", True)}})
    return jsonify(available=not f.get("available", True))


@bp.delete("/<fid>")
@auth_required("ADMIN")
def delete_food(fid):
    food = get_db().food_items.find_one({"_id": oid(fid)}, {"image_url": 1})
    if not food: raise ApiError("Food item not found", 404)
    get_db().food_items.delete_one({"_id": food["_id"]})
    image_service.delete_if_unused(food.get("image_url"), current_app.config)
    return jsonify(message="Deleted")


# ---------- daily inventory (prepared stock -> sold -> remaining -> waste) ----------
@bp.get("/inventory/today")
@auth_required("ADMIN", "STAFF")
def inventory():
    pred = {r["food_id"]: r for r in demand_service.predictions(date.today(), float(request.args.get("buffer", 5)))["items"]}
    rows = []
    for f in get_db().food_items.find().sort("name", 1):
        st, p = stock_view(f), pred.get(str(f["_id"]), {})
        rows.append({"id": str(f["_id"]), "name": f["name"], "category": f.get("category"), "available": f.get("available", True),
                     "prep_cost": f.get("prep_cost", 0), **st, "forecast": p.get("forecast"), "recommended": p.get("recommended")})
    closed = get_db().waste_records.count_documents({"date": today_str(), "source": "DAY_CLOSE"}) > 0
    return jsonify(date=today_str(), items=rows, closed=closed)


@bp.put("/<fid>/stock")
@auth_required("ADMIN", "STAFF")
def set_stock(fid):
    d = body()
    f = get_db().food_items.find_one({"_id": oid(fid)})
    if not f: raise ApiError("Food item not found", 404)
    st = stock_view(f)
    prepared = None if d.get("prepared") in (None, "") else num(d, "prepared", 0, 10000, cast=int)
    if prepared is not None and prepared < st["sold"]:
        raise ApiError(f"Prepared cannot be less than already sold ({st['sold']})")
    get_db().food_items.update_one({"_id": f["_id"]}, {"$set": {"stock": {"date": today_str(), "prepared": prepared, "sold": st["sold"]}}})
    return jsonify(serialize(with_stock(get_db().food_items.find_one({"_id": f["_id"]}))))


@bp.post("/inventory/apply-recommended")
@auth_required("ADMIN")
def apply_recommended():
    buffer = num(request.get_json(silent=True) or {}, "buffer_pct", 0, 100, default=5)
    n = 0
    for r in demand_service.predictions(date.today(), buffer)["items"]:
        f = get_db().food_items.find_one({"_id": oid(r["food_id"])})
        if r["recommended"] > 0:
            st = stock_view(f)
            get_db().food_items.update_one({"_id": f["_id"]}, {"$set": {"stock": {"date": today_str(), "prepared": max(r["recommended"], st["sold"]), "sold": st["sold"]}}})
            n += 1
    return jsonify(updated=n)


@bp.post("/inventory/close-day")
@auth_required("ADMIN")
def close_day():
    recs = waste_service.close_day()
    return jsonify(created=len(recs), records=serialize(recs))
