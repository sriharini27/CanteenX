"""Explainable demand forecasting and preparation optimisation.

1. Weighted moving average of the last 5 operating days (weights 1..5, most recent heaviest)
       WMA = (1*q1 + 2*q2 + 3*q3 + 4*q4 + 5*q5) / 15
2. Day-of-week index = average demand on the target weekday / overall average  (clamped 0.7 - 1.3)
3. Forecast = WMA x day-of-week index
4. Recommended preparation = ceil(Forecast x (1 + safety buffer))
Example: Biryani 72, 65, 81, 76, 92 -> WMA = 1209/15 = 80.6 -> with 5 % buffer prepare 85.
"""
import math
from collections import defaultdict
from datetime import date, datetime, timedelta
from db import get_db
from utils.helpers import mean, pct_change, today_str

WMA_N = 5


def _d(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def forecast_from_series(series, target):
    """series: ascending [(date_str, qty)] strictly before `target`."""
    if not series:
        return {"sma": 0, "wma": 0, "dow_factor": 1.0, "forecast": 0, "history": []}
    last = [q for _, q in series[-WMA_N:]]
    weights = list(range(1, len(last) + 1))
    wma = sum(q * w for q, w in zip(last, weights)) / sum(weights)
    overall = mean([q for _, q in series])
    same_day = [q for d, q in series if _d(d).weekday() == target.weekday()]
    dow = min(1.3, max(0.7, mean(same_day) / overall)) if len(same_day) >= 2 and overall else 1.0
    return {"sma": round(mean(last), 1), "wma": round(wma, 1), "dow_factor": round(dow, 2),
            "forecast": round(wma * dow, 1), "history": [{"date": d, "qty": q} for d, q in series[-7:]]}


def recommended_qty(forecast, buffer_pct):
    return math.ceil(forecast * (1 + buffer_pct / 100)) if forecast else 0


def _series_by_food(before=None):
    q = {"date": {"$lt": before}} if before else {}
    out = defaultdict(list)
    for r in get_db().demand_records.find(q).sort("date", 1):
        out[str(r["food_id"])].append((r["date"], r["quantity"]))
    return out


def predictions(target=None, buffer_pct=5.0, period=None):
    db, target = get_db(), target or date.today()
    series = _series_by_food(target.isoformat())
    foods = list(db.food_items.find({} if not period else {"meal_period": {"$in": [period, "ALL_DAY"]}}).sort("name", 1))
    since = (target - timedelta(days=14)).isoformat()
    prepared = defaultdict(list)
    for w in db.waste_records.find({"date": {"$gte": since, "$lt": target.isoformat()}}):
        prepared[str(w["food_id"])].append(w["prepared"])
    rows = []
    for f in foods:
        fc = forecast_from_series(series.get(str(f["_id"]), []), target)
        rec = recommended_qty(fc["forecast"], buffer_pct)
        cur = round(mean(prepared.get(str(f["_id"]), [])))
        cur_waste = max(0, round(cur - fc["forecast"])) if cur else None
        opt_waste = max(0, round(rec - fc["forecast"]))
        rows.append({
            "food_id": str(f["_id"]), "name": f["name"], "category": f.get("category"), "meal_period": f.get("meal_period"),
            **fc, "buffer_pct": buffer_pct, "recommended": rec, "current_prep": cur or None,
            "expected_waste_current": cur_waste, "expected_waste_optimized": opt_waste,
            "waste_reduction_pct": pct_change(cur_waste, opt_waste) if cur_waste else 0.0,
            "prep_cost": f.get("prep_cost", 0),
            "saving": round(((cur_waste or 0) - opt_waste) * f.get("prep_cost", 0), 2) if cur_waste else 0,
        })
    rows.sort(key=lambda r: -r["forecast"])
    return {"date": target.isoformat(), "method": "WMA(5) x day-of-week index", "buffer_pct": buffer_pct,
            "items": rows, "total_forecast": round(sum(r["forecast"] for r in rows)),
            "total_recommended": sum(r["recommended"] for r in rows),
            "total_current": sum(r["current_prep"] or 0 for r in rows)}


def backtest(days=7, buffer_pct=5.0):
    """Replay the last `days` of waste records: what if we had prepared the recommended quantity?"""
    db = get_db()
    since = (date.today() - timedelta(days=days)).isoformat()
    records = list(db.waste_records.find({"date": {"$gte": since, "$lt": today_str()}}))
    all_series = _series_by_food()
    per_item = defaultdict(lambda: {"prepared": 0, "sold": 0, "waste_before": 0, "rec": 0, "waste_after": 0, "shortage": 0, "loss_before": 0, "loss_after": 0})
    for r in records:
        s = [x for x in all_series.get(str(r["food_id"]), []) if x[0] < r["date"]]
        rec = recommended_qty(forecast_from_series(s, _d(r["date"]))["forecast"], buffer_pct)
        it = per_item[r["food_name"]]
        after = max(0, rec - r["sold"])
        it["prepared"] += r["prepared"]; it["sold"] += r["sold"]; it["waste_before"] += r["wasted"]
        it["rec"] += rec; it["waste_after"] += after; it["shortage"] += max(0, r["sold"] - rec)
        it["loss_before"] += r["wasted"] * r.get("prep_cost", 0); it["loss_after"] += after * r.get("prep_cost", 0)
    items = [{"name": k, **v} for k, v in per_item.items()]
    tot = {k: sum(i[k] for i in items) for k in ["prepared", "sold", "waste_before", "rec", "waste_after", "shortage", "loss_before", "loss_after"]}
    tot["waste_rate_before"] = round(tot["waste_before"] / tot["prepared"] * 100, 1) if tot["prepared"] else 0
    tot["waste_rate_after"] = round(tot["waste_after"] / tot["rec"] * 100, 1) if tot["rec"] else 0
    tot["waste_reduction_pct"] = pct_change(tot["waste_before"], tot["waste_after"])
    tot["fill_rate"] = round((tot["sold"] - tot["shortage"]) / tot["sold"] * 100, 1) if tot["sold"] else 100
    return {"days": days, "buffer_pct": buffer_pct, "records": len(records), "totals": tot,
            "items": sorted(items, key=lambda i: -i["waste_before"])}


def peak_hours(days=14):
    db = get_db()
    since = datetime.combine(date.today() - timedelta(days=days), datetime.min.time())
    by_hour, dates = defaultdict(int), set()
    for o in db.orders.find({"created_at": {"$gte": since}, "status": {"$nin": ["CANCELLED", "AWAITING_PAYMENT"]}}, {"created_at": 1}):
        by_hour[o["created_at"].hour] += 1
        dates.add(o["created_at"].date())
    n = max(1, len(dates))
    return [{"hour": f"{h:02d}:00", "avg_orders": round(by_hour[h] / n, 1)} for h in range(7, 22)]


def record_sale(food, qty, day, sign=1):
    """Incrementally keep demand_records in sync with orders."""
    get_db().demand_records.update_one(
        {"food_id": food["food_id"], "date": day},
        {"$inc": {"quantity": sign * qty}, "$setOnInsert": {"food_name": food["name"], "day_of_week": _d(day).strftime("%A")}},
        upsert=True)


def rebuild_demand_records():
    """Recompute demand_records from order_items (full refresh)."""
    db = get_db()
    agg = defaultdict(int)
    names = {}
    for it in db.order_items.find({}, {"food_id": 1, "date": 1, "qty": 1, "name": 1}):
        agg[(it["food_id"], it["date"])] += it["qty"]
        names[it["food_id"]] = it["name"]
    db.demand_records.delete_many({})
    docs = [{"food_id": f, "food_name": names[f], "date": d, "day_of_week": _d(d).strftime("%A"), "quantity": q}
            for (f, d), q in agg.items()]
    if docs:
        db.demand_records.insert_many(docs)
    return len(docs)
