"""Dashboard KPIs, before-vs-after optimisation and reports — all computed from MongoDB / simulation data."""
from collections import Counter, defaultdict
from datetime import date, timedelta, datetime
from db import get_db
from models.order import NOT_COUNTED
from models.simulation import validate_params
from services import queue_service, simulation_service as sim, demand_service, waste_service
from utils.helpers import now, day_start, mean, pct_change, last_n_days, today_str, ApiError


def _orders_between(start, end):
    return list(get_db().orders.find({"created_at": {"$gte": start, "$lt": end}, "status": {"$nin": NOT_COUNTED}}))


def popular_items(days=7, limit=5):
    since = (date.today() - timedelta(days=days - 1)).isoformat()
    cnt = Counter()
    for it in get_db().order_items.find({"date": {"$gte": since}}, {"name": 1, "qty": 1}):
        cnt[it["name"]] += it["qty"]
    return [{"name": n, "qty": q} for n, q in cnt.most_common(limit)]


def hourly_utilization(orders, avg_service, counters):
    by_h = Counter(o["created_at"].hour for o in orders)
    return [{"hour": f"{h:02d}:00", "arrivals": by_h[h], "utilization": round(min(100, by_h[h] * avg_service / (60 * counters) * 100), 1)}
            for h in range(7, 21)]


def dashboard():
    db, t = get_db(), now()
    live = queue_service.live_metrics()
    start = day_start()
    today = _orders_between(start, t + timedelta(minutes=1))
    week_start = day_start(date.today() - timedelta(days=7))
    past = _orders_between(week_start, start)
    past_days = max(1, len({o["date"] for o in past}))
    th, ph = Counter(o["created_at"].hour for o in today), Counter(o["created_at"].hour for o in past)
    orders_by_hour = [{"hour": f"{h:02d}:00", "today": th[h], "avg_7d": round(ph[h] / past_days, 1)} for h in range(7, 21)]
    first = min((o["created_at"] for o in today), default=None)
    qtl = queue_service.queue_timeline(today, first.replace(minute=first.minute // 15 * 15, second=0), t, 15) if first else []
    waits = []
    for d in last_n_days(7):
        ws = [o.get("wait_min") for o in db.orders.find({"date": d.isoformat(), "wait_min": {"$ne": None}}, {"wait_min": 1})]
        waits.append({"date": d.strftime("%a %d"), "avg_wait": mean(ws), "max_wait": round(max(ws), 1) if ws else 0})
    waste = waste_service.recent_summary(7)
    pred = demand_service.predictions(date.today())
    demand = [{"name": r["name"], "forecast": r["forecast"], "recommended": r["recommended"],
               "last_avg": round(mean([h["qty"] for h in r["history"]]), 1)} for r in pred["items"][:8]]
    latest = db.simulation_runs.find_one({"type": "BEFORE_AFTER"}, sort=[("created_at", -1)])
    return {
        "kpis": {
            "orders_today": len(today), "revenue_today": round(sum(o["total"] for o in today), 2),
            "pending_orders": live["pending"] + live["confirmed"], "preparing": live["preparing"],
            "completed_today": live["completed_today"], "current_queue": live["queue_length"],
            "avg_wait_min": live["avg_wait_min"], "max_wait_min": live["max_wait_min"],
            "max_queue_today": live["max_queue_today"], "active_counters": live["active_counters"],
            "food_waste_7d": waste["total_wasted"], "waste_pct_7d": waste["waste_pct"], "loss_7d": waste["total_loss"],
            "utilization_pct": live["utilization_pct"], "throughput_per_hr": live["throughput_per_hr"],
            "popular_food": (popular_items(7, 1) or [{"name": "—"}])[0]["name"], "status": live["status"],
        },
        "popular": popular_items(7, 6),
        # forecast-based preparation (WMA x day-of-week + 5 % buffer) replayed on the last 7 days of waste records
        "waste_optimization": {**demand_service.backtest(7, 5.0)["totals"], "buffer_pct": 5.0, "days": 7,
                               "method": "WMA(5) × day-of-week index + 5 % safety buffer"},
        "charts": {
            "orders_by_hour": orders_by_hour, "queue_timeline": qtl, "wait_by_day": waits, "demand": demand,
            "waste_by_item": waste["by_item"][:10],
            "utilization": hourly_utilization(today, live["avg_service_min"], live["active_counters"]),
            "before_after": latest["results"]["summary"] if latest else None,
        },
    }


# ---------------- Before vs After optimisation ----------------
def before_after(body, user_id=None):
    body = body or {}
    p = validate_params(body.get("sim"))
    before_c = int(body.get("before_counters") or queue_service.active_counters())
    recommended = sim.recommend_counters(p)
    after_raw = body.get("after_counters", "auto")
    after_c = recommended if after_raw in (None, "", "auto") else int(after_raw)
    if not (1 <= before_c <= 12 and 1 <= after_c <= 12):
        raise ApiError("Counters must be between 1 and 12")
    buffer_pct = float(body.get("buffer_pct", 5)); days = int(body.get("days", 7))
    rb, ra = sim.simulate({**p, "counters": before_c}), sim.simulate({**p, "counters": after_c})
    bt = demand_service.backtest(days, buffer_pct)["totals"]
    tot = bt

    def side(r, c, waste, rate, loss, prepared):
        return {"counters": c, "avg_wait": r["avg_wait"], "max_wait": r["max_wait"], "max_queue": r["max_queue_length"],
                "avg_queue": r["avg_queue_length"], "served": r["students_served"], "throughput_per_hr": r["throughput_per_hr"],
                "service_level": r["service_level"], "utilization": r["counter_utilization"],
                "food_prepared": prepared, "food_waste": waste, "waste_rate": rate, "waste_loss": round(loss, 2)}
    before = side(rb, before_c, tot["waste_before"], tot["waste_rate_before"], tot["loss_before"], tot["prepared"])
    after = side(ra, after_c, tot["waste_after"], tot["waste_rate_after"], tot["loss_after"], tot["rec"])
    imp = {
        "wait_reduction_pct": pct_change(before["avg_wait"], after["avg_wait"]),
        "max_wait_reduction_pct": pct_change(before["max_wait"], after["max_wait"]),
        "queue_reduction_pct": pct_change(before["max_queue"], after["max_queue"]),
        "waste_reduction_pct": pct_change(before["food_waste"], after["food_waste"]),
        "efficiency_gain_pct": -pct_change(before["throughput_per_hr"], after["throughput_per_hr"]),
        "service_level_gain_pp": round(after["service_level"] - before["service_level"], 1),
        "money_saved": round(before["waste_loss"] - after["waste_loss"], 2),
        "shortage_portions": tot["shortage"], "fill_rate": tot["fill_rate"],
    }
    tb = {x["t"]: x for x in rb["timeline"]}; ta = {x["t"]: x for x in ra["timeline"]}
    timeline = [{"t": k, "before": tb.get(k, {}).get("queue", 0), "after": ta.get(k, {}).get("queue", 0)}
                for k in sorted(set(tb) | set(ta))]
    summary = {"before": before, "after": after, "improvements": imp}
    results = {"summary": summary, "recommended_counters": recommended, "timeline": timeline,
               "waste_items": demand_service.backtest(days, buffer_pct)["items"], "analytical_before": rb["analytical"],
               "analytical_after": ra["analytical"]}
    run = {"type": "BEFORE_AFTER", "label": f"{before_c} → {after_c} counters, buffer {buffer_pct:g}%",
           "params": {**p, "before_counters": before_c, "after_counters": after_c, "buffer_pct": buffer_pct, "days": days},
           "results": results, "created_by": user_id, "created_at": now()}
    run["_id"] = get_db().simulation_runs.insert_one(run).inserted_id
    return run


# ---------------- Reports ----------------
def _table(title, columns, rows):
    return {"title": title, "columns": columns, "rows": rows}


def _day_rows(days):
    db, rows = get_db(), []
    for d in days:
        ds = d.isoformat()
        os_ = [o for o in db.orders.find({"date": ds})]
        ok = [o for o in os_ if o["status"] not in NOT_COUNTED]
        ws = [o["wait_min"] for o in ok if o.get("wait_min") is not None]
        wr = list(db.waste_records.find({"date": ds}))
        prep = sum(r["prepared"] for r in wr); wasted = sum(r["wasted"] for r in wr)
        rows.append({"date": ds, "day": d.strftime("%a"), "orders": len(ok), "cancelled": len(os_) - len(ok),
                     "revenue": round(sum(o["total"] for o in ok), 2), "avg_wait": mean(ws),
                     "max_wait": round(max(ws), 1) if ws else 0, "max_queue": queue_service.max_queue(ok),
                     "prepared": prep, "wasted": wasted, "waste_pct": round(wasted / prep * 100, 1) if prep else 0})
    return rows


def report(kind, args):
    db = get_db()
    d = datetime.strptime(args.get("date") or today_str(), "%Y-%m-%d").date()
    days = max(1, min(60, int(args.get("days") or 7)))
    if kind == "daily":
        row = _day_rows([d])[0]
        ok = _orders_between(day_start(d), day_start(d + timedelta(days=1)))
        items = Counter()
        for o in ok:
            for i in o["items"]: items[i["name"]] += i["qty"]
        by_h = Counter(o["created_at"].hour for o in ok)
        return {"title": f"Daily Operations Report — {d.isoformat()}", "summary": row,
                "charts": [{"title": "Orders by hour", "type": "bar", "x": "hour", "series": ["orders"],
                            "data": [{"hour": f"{h:02d}", "orders": by_h[h]} for h in range(7, 21)]}],
                "tables": [_table("Items sold", ["item", "qty"], [{"item": k, "qty": v} for k, v in items.most_common()]),
                           _table("Waste", ["food_name", "prepared", "sold", "wasted", "waste_pct", "loss"],
                                  list(db.waste_records.find({"date": d.isoformat()}, {"_id": 0, "food_id": 0})))]}
    if kind == "weekly":
        rows = _day_rows(last_n_days(days, d))
        tot = {"orders": sum(r["orders"] for r in rows), "revenue": round(sum(r["revenue"] for r in rows), 2),
               "avg_wait": mean([r["avg_wait"] for r in rows if r["orders"]]), "wasted": sum(r["wasted"] for r in rows),
               "waste_pct": round(sum(r["wasted"] for r in rows) / max(1, sum(r["prepared"] for r in rows)) * 100, 1)}
        return {"title": f"Operations Report — last {days} days", "summary": tot,
                "charts": [{"title": "Orders & revenue per day", "type": "bar", "x": "date", "series": ["orders"], "data": rows},
                           {"title": "Average wait per day (min)", "type": "line", "x": "date", "series": ["avg_wait", "max_wait"], "data": rows}],
                "tables": [_table("Per-day breakdown", ["date", "day", "orders", "cancelled", "revenue", "avg_wait", "max_wait", "max_queue", "waste_pct"], rows)]}
    if kind == "waiting":
        since = day_start(d - timedelta(days=days - 1))
        ok = [o for o in _orders_between(since, day_start(d + timedelta(days=1))) if o.get("wait_min") is not None]
        by_h = defaultdict(list)
        for o in ok: by_h[o["created_at"].hour].append(o["wait_min"])
        ws = sorted(o["wait_min"] for o in ok)
        buckets = [(0, 5), (5, 10), (10, 15), (15, 20), (20, 30), (30, 999)]
        est = [abs(o["wait_min"] - o["est_wait_min"]) for o in ok if o.get("est_wait_min") is not None]
        return {"title": f"Waiting Time Report — last {days} days",
                "summary": {"orders_analysed": len(ws), "avg_wait": mean(ws), "median_wait": ws[len(ws) // 2] if ws else 0,
                            "p90_wait": ws[int(0.9 * (len(ws) - 1))] if ws else 0, "max_wait": max(ws) if ws else 0,
                            "within_10_min_pct": round(sum(1 for w in ws if w <= 10) / len(ws) * 100, 1) if ws else 0,
                            "estimate_mean_abs_error": mean(est)},
                "charts": [{"title": "Average wait by hour (min)", "type": "bar", "x": "hour", "series": ["avg_wait"],
                            "data": [{"hour": f"{h:02d}", "avg_wait": mean(by_h[h])} for h in range(7, 21)]},
                           {"title": "Wait distribution", "type": "bar", "x": "range", "series": ["orders"],
                            "data": [{"range": f"{a}-{b}" if b < 999 else f"{a}+", "orders": sum(1 for w in ws if a <= w < b)} for a, b in buckets]}],
                "tables": []}
    if kind == "queue":
        rows = _day_rows(last_n_days(days, d))
        live = queue_service.live_metrics()
        hrs = demand_service.peak_hours(days)
        return {"title": f"Queue Analysis — last {days} days", "summary": {k: live[k] for k in (
                    "queue_length", "active_counters", "arrival_rate_per_hr", "avg_service_min", "utilization_pct", "throughput_per_hr", "max_queue_today")},
                "charts": [{"title": "Average arrivals per hour", "type": "bar", "x": "hour", "series": ["avg_orders"], "data": hrs},
                           {"title": "Peak queue length per day", "type": "line", "x": "date", "series": ["max_queue"], "data": rows}],
                "tables": [_table("Hourly load (ρ = λ·s / c)", ["hour", "avg_orders", "utilization_pct"],
                                  [{**h, "utilization_pct": round(min(100, h["avg_orders"] * live["avg_service_min"] / (60 * live["active_counters"]) * 100), 1)} for h in hrs])]}
    if kind == "waste":
        s = waste_service.summary(waste_service.list_records((d - timedelta(days=days - 1)).isoformat(), d.isoformat()))
        return {"title": f"Food Waste Report — last {days} days",
                "summary": {k: s[k] for k in ("total_prepared", "total_sold", "total_wasted", "waste_pct", "total_loss")},
                "charts": [{"title": "Waste % by item", "type": "bar", "x": "name", "series": ["waste_pct"], "data": s["by_item"]},
                           {"title": "Daily waste %", "type": "line", "x": "date", "series": ["waste_pct"], "data": s["by_day"]}],
                "tables": [_table("By item", ["name", "prepared", "sold", "wasted", "waste_pct", "loss"], s["by_item"]),
                           _table("High-waste items (> 20 %)", ["name", "waste_pct", "wasted", "loss"], s["high_waste"])]}
    if kind == "demand":
        p = demand_service.predictions(d, float(args.get("buffer") or 5))
        return {"title": f"Demand Prediction Report — {d.isoformat()}", "summary": {"method": p["method"], "total_forecast": p["total_forecast"],
                    "total_recommended": p["total_recommended"], "total_current_prep": p["total_current"]},
                "charts": [{"title": "Forecast vs recommended vs current preparation", "type": "bar", "x": "name",
                            "series": ["forecast", "recommended", "current_prep"], "data": p["items"]}],
                "tables": [_table("Forecast", ["name", "sma", "wma", "dow_factor", "forecast", "recommended", "current_prep", "expected_waste_current", "expected_waste_optimized"], p["items"])]}
    if kind == "simulation":
        runs = list(db.simulation_runs.find({"type": {"$in": ["SINGLE", "COMPARE"]}}).sort("created_at", -1).limit(30))
        rows = []
        for r in runs:
            res = r["results"]
            if r["type"] == "SINGLE":
                rows.append({"when": r["created_at"].strftime("%d %b %H:%M"), "label": r["label"], "counters": r["params"]["counters"],
                             "students": res["total_students"], "avg_wait": res["avg_wait"], "max_wait": res["max_wait"],
                             "max_queue": res["max_queue_length"], "utilization": res["counter_utilization"]})
            else:
                for row in res["rows"]:
                    rows.append({"when": r["created_at"].strftime("%d %b %H:%M"), "label": r["label"], "counters": row["counters"],
                                 "students": row["total_students"], "avg_wait": row["avg_wait"], "max_wait": row["max_wait"],
                                 "max_queue": row["max_queue_length"], "utilization": row["counter_utilization"]})
        return {"title": "Simulation Report", "summary": {"saved_runs": len(runs)}, "charts": [],
                "tables": [_table("Saved simulation runs", ["when", "label", "counters", "students", "avg_wait", "max_wait", "max_queue", "utilization"], rows)]}
    if kind == "before-after":
        r = db.simulation_runs.find_one({"type": "BEFORE_AFTER"}, sort=[("created_at", -1)]) or before_after({})
        s = r["results"]["summary"]
        keys = ["counters", "avg_wait", "max_wait", "max_queue", "throughput_per_hr", "service_level", "utilization", "food_prepared", "food_waste", "waste_rate", "waste_loss"]
        return {"title": f"Before / After Optimization — {r['label']}", "summary": s["improvements"],
                "charts": [{"title": "Before vs after", "type": "bar", "x": "metric", "series": ["before", "after"],
                            "data": [{"metric": k, "before": s["before"][k], "after": s["after"][k]} for k in ("avg_wait", "max_wait", "max_queue", "food_waste", "waste_rate")]}],
                "tables": [_table("Comparison", ["metric", "before", "after"], [{"metric": k, "before": s["before"][k], "after": s["after"][k]} for k in keys])]}
    raise ApiError("Unknown report", 404)
