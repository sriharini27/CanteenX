"""food_items collection.
{ _id, name, description, category, is_veg, price, prep_cost, prep_time (min to serve one portion),
  meal_period, available, image_url, stock: {date, prepared|None, sold}, created_at }"""
from utils.helpers import ApiError, num, text, today_str, now

CATEGORIES = ["Breakfast", "Meals", "Snacks", "Beverages"]
FOOD_PERIODS = ["BREAKFAST", "LUNCH", "SNACKS", "ALL_DAY"]


def food_from_payload(d, partial=False):
    out = {}
    def has(k): return not partial or k in d
    if has("name"): out["name"] = text(d, "name", maxlen=80)
    if has("description"): out["description"] = text(d, "description", required=False, maxlen=400)
    if has("price"): out["price"] = num(d, "price", 1, 5000)
    if has("prep_cost"): out["prep_cost"] = num(d, "prep_cost", 0, 5000, default=0)
    if has("prep_time"): out["prep_time"] = num(d, "prep_time", 0.5, 60, default=3)
    if has("image_url"):
        out["image_url"] = text(d, "image_url", required=False, maxlen=500)
        if out["image_url"] and not out["image_url"].startswith(("/uploads/", "https://", "http://")):
            raise ApiError("Image must be an uploaded file or an http(s) URL")
    if has("category"):
        out["category"] = d.get("category") or "Meals"
        if out["category"] not in CATEGORIES: raise ApiError(f"category must be one of {CATEGORIES}")
    if has("meal_period"):
        out["meal_period"] = d.get("meal_period") or "ALL_DAY"
        if out["meal_period"] not in FOOD_PERIODS: raise ApiError(f"meal_period must be one of {FOOD_PERIODS}")
    for flag, default in (("is_veg", True), ("available", True)):
        if has(flag): out[flag] = bool(d.get(flag, default))
    if "prep_cost" in out and "price" in out and out["prep_cost"] > out["price"]:
        raise ApiError("Preparation cost cannot exceed selling price")
    if not partial:
        out.update(stock={"date": today_str(), "prepared": None, "sold": 0}, created_at=now())
    return out


def stock_view(food):
    """Today's stock. prepared=None means stock is not tracked (unlimited)."""
    s = food.get("stock") or {}
    if s.get("date") != today_str():
        return {"prepared": None, "sold": 0, "remaining": None}
    prepared, sold = s.get("prepared"), s.get("sold", 0)
    return {"prepared": prepared, "sold": sold, "remaining": None if prepared is None else max(0, prepared - sold)}


def with_stock(food):
    st = stock_view(food)
    return {**food, "stock": st, "in_stock": food.get("available", True) and (st["remaining"] is None or st["remaining"] > 0)}
