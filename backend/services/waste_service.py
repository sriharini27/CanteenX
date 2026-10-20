"""Food waste tracking: Waste = Prepared - Sold ; Waste % = Waste / Prepared x 100."""
from collections import defaultdict
from datetime import date, timedelta
from db import get_db
from models.food import stock_view
from models.waste import compute_waste, HIGH_WASTE_PCT
from utils.helpers import now, today_str


def upsert_record(food, day, prepared, sold, source="MANUAL"):
    meal = food.get("meal_period", "ALL_DAY")
    doc = {"food_id": food["_id"], "food_name": food["name"], "date": day, "meal_period": meal,
           **compute_waste(prepared, sold, food.get("prep_cost", 0), food.get("price", 0)),
           "source": source, "created_at": now()}
    get_db().waste_records.update_one({"food_id": food["_id"], "date": day}, {"$set": doc}, upsert=True)
    return get_db().waste_records.find_one({"food_id": food["_id"], "date": day})


def list_records(start, end, food_id=None):
    q = {"date": {"$gte": start, "$lte": end}}
    if food_id: q["food_id"] = food_id
    return list(get_db().waste_records.find(q).sort([("date", -1), ("food_name", 1)]))


def summary(records):
    tp = sum(r["prepared"] for r in records); ts = sum(r["sold"] for r in records)
    tw = sum(r["wasted"] for r in records); loss = sum(r["loss"] for r in records)
    by_item = defaultdict(lambda: {"prepared": 0, "sold": 0, "wasted": 0, "loss": 0.0})
    by_day = defaultdict(lambda: {"prepared": 0, "wasted": 0})
    for r in records:
        it = by_item[r["food_name"]]
        for k in ("prepared", "sold", "wasted", "loss"): it[k] += r[k]
        by_day[r["date"]]["prepared"] += r["prepared"]; by_day[r["date"]]["wasted"] += r["wasted"]
    items = [{"name": k, **v, "loss": round(v["loss"], 2),
              "waste_pct": round(v["wasted"] / v["prepared"] * 100, 1) if v["prepared"] else 0} for k, v in by_item.items()]
    items.sort(key=lambda i: -i["waste_pct"])
    days = [{"date": d, **v, "waste_pct": round(v["wasted"] / v["prepared"] * 100, 1) if v["prepared"] else 0}
            for d, v in sorted(by_day.items())]
    return {
        "total_prepared": tp, "total_sold": ts, "total_wasted": tw, "total_loss": round(loss, 2),
        "waste_pct": round(tw / tp * 100, 1) if tp else 0, "threshold_pct": HIGH_WASTE_PCT,
        "by_item": items, "by_day": days, "high_waste": [i for i in items if i["waste_pct"] > HIGH_WASTE_PCT],
    }


def recent_summary(days=7):
    end = date.today() - timedelta(days=1)
    return summary(list_records((end - timedelta(days=days - 1)).isoformat(), end.isoformat()))


def close_day():
    """End of day: convert today's unsold stock of every tracked item into waste records."""
    out = []
    for f in get_db().food_items.find():
        st = stock_view(f)
        if st["prepared"] is not None:
            out.append(upsert_record(f, today_str(), st["prepared"], min(st["sold"], st["prepared"]), "DAY_CLOSE"))
    return out
