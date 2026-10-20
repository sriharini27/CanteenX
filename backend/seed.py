"""Demo data generator.  python seed.py  (wipes and re-creates the demo database)

Creates users, menu, counters and ~6 weeks of realistic order history. Order timestamps are produced
by running each day's arrivals through a 2-counter FIFO queue, so historical waiting times are the
genuine result of queueing (not random numbers). Waste records use the canteen's habitual batch sizes
(the 'current preparation strategy') against the actual quantity sold that day.
"""
import math, random
from datetime import date, datetime, timedelta
import heapq
from config import Config
from db import init_db
from models.user import new_user
from models.queue import DEFAULT_COUNTERS
from models.payment import mock_txn_id, METHODS
from models.waste import compute_waste
from services.queue_service import work_minutes
from services.demand_service import rebuild_demand_records
from services.image_service import default_image
from utils.helpers import meal_period_of, now

FOODS = [  # name, category, veg, price, prep_cost, prep_time, period, image, popularity, habitual over-prep
    ("Masala Dosa", "Breakfast", True, 60, 24, 4, "BREAKFAST", "/images/masala_dosa.jpg", 5, 1.5, "Crispy rice-lentil crepe filled with spiced potato."),
    ("Idli Vada", "Breakfast", True, 40, 14, 2, "BREAKFAST", "", 6, 1.1, "Two steamed idlis and a crisp medu vada with chutney and sambar."),
    ("Poha", "Breakfast", True, 35, 11, 2, "BREAKFAST", "", 3, 1.12, "Flattened rice tempered with mustard, peanuts and curry leaves."),
    ("Chicken Biryani", "Meals", False, 150, 68, 2, "LUNCH", "/images/chicken_biryani.jpg", 6, 1.08, "Aromatic basmati rice layered with tender chicken."),
    ("Veg Biryani", "Meals", True, 110, 42, 2, "LUNCH", "", 3, 1.4, "Fragrant rice with seasonal vegetables and whole spices."),
    ("Veg Fried Rice", "Meals", True, 85, 32, 4, "LUNCH", "/images/veg_fried_rice.jpg", 4, 1.12, "Wok-tossed rice with fresh vegetables and soy."),
    ("Paneer Butter Masala", "Meals", True, 120, 52, 2, "LUNCH", "/images/paneer_butter_masala.jpg", 3, 1.35, "Cottage cheese in a rich tomato-butter gravy with roti."),
    ("South Indian Thali", "Meals", True, 90, 38, 2, "LUNCH", "", 6, 1.06, "Rice, sambar, rasam, poriyal, curd and papad."),
    ("Chapati Kurma", "Meals", True, 60, 22, 3, "LUNCH", "", 3, 1.15, "Three soft chapatis with vegetable kurma."),
    ("Samosa", "Snacks", True, 20, 7, 1, "SNACKS", "", 6, 1.1, "Crisp pastry stuffed with spiced potato and peas."),
    ("Veg Puff", "Snacks", True, 25, 9, 1, "SNACKS", "", 4, 1.15, "Flaky puff pastry with a mixed-vegetable filling."),
    ("Egg Puff", "Snacks", False, 30, 11, 1, "SNACKS", "", 3, 1.1, "Puff pastry with masala egg."),
    ("Chicken Roll", "Snacks", False, 70, 30, 4, "SNACKS", "", 3, 1.12, "Paratha roll with spicy chicken tikka and onions."),
    ("Cold Coffee", "Beverages", True, 45, 15, 2, "ALL_DAY", "/images/cold_coffee.jpg", 4, 1.1, "Chilled coffee blended with milk."),
    ("Masala Tea", "Beverages", True, 15, 4, 1, "ALL_DAY", "", 8, 1.05, "Hot tea brewed with ginger and cardamom."),
    ("Fresh Lime Juice", "Beverages", True, 30, 8, 2, "ALL_DAY", "", 3, 1.12, "Freshly squeezed lime with soda or water."),
]
DAY_FACTOR = {0: 1.0, 1: 0.95, 2: 1.05, 3: 1.0, 4: 1.15, 5: 0.85, 6: 0.6}   # Sundays closed in history (today always open for the demo)
SEED_COUNTERS = 2


def rate_at(minute):
    """Orders per minute by time of day (breakfast, lunch rush, evening snacks)."""
    h = minute / 60
    if 7.5 <= h < 10.5: return 30 / 60 if 8.5 <= h < 9.5 else 18 / 60
    if 12 <= h < 14.5: return 50 / 60 if 12.5 <= h < 13.5 else 30 / 60
    if 16 <= h < 17.5: return 20 / 60
    return 0


def day_arrivals(rng, d, until=None):
    lam_max, out, t = 50 / 60 * 1.2, [], 7.5 * 60
    f = DAY_FACTOR[d.weekday()]
    while t < 17.5 * 60:
        t += rng.expovariate(lam_max)
        if rng.random() < rate_at(t) * f / lam_max:
            ts = datetime.combine(d, datetime.min.time()) + timedelta(minutes=t)
            if until and ts > until: break
            out.append(ts)
    return out


def pick_items(rng, foods, period):
    by = lambda cat: [f for f in foods if f["category"] in cat]
    main_cat = {"BREAKFAST": ["Breakfast"], "LUNCH": ["Meals"], "SNACKS": ["Snacks"]}.get(period, ["Meals", "Snacks"])
    def choose(pool): return rng.choices(pool, weights=[f["_w"] for f in pool])[0]
    chosen = [choose(by(main_cat))]
    if rng.random() < 0.45: chosen.append(choose(by(["Beverages"])))
    if rng.random() < 0.15: chosen.append(choose(by(["Snacks"] if period == "LUNCH" else main_cat)))
    lines = {}
    for f in chosen:
        lines.setdefault(f["_id"], [f, 0])[1] += 1 if rng.random() < 0.85 else 2
    return [{"food_id": f["_id"], "name": f["name"], "price": f["price"], "qty": q, "prep_time": f["prep_time"],
             "is_veg": f["is_veg"], "image_url": f["image_url"]} for f, q in lines.values()]


def seed(db, verbose=True):
    rng = random.Random(2026)
    for c in ["users", "food_items", "orders", "order_items", "payments", "rewards", "queue_events", "waste_records",
              "demand_records", "simulation_runs", "counters", "sequences"]:
        db[c].delete_many({})
    today, t_now = date.today(), now()

    users = [new_user("Canteen Admin", "admin", "admin123", "ADMIN"),
             new_user("Ravi (Kitchen Staff)", "staff", "staff123", "STAFF"),
             new_user("Ananya Student", "student", "student123", "STUDENT", "2004-08-15", points=240),
             new_user("Birthday Student", "birthday", "birthday123", "STUDENT", f"2005-{today:%m-%d}", points=80, subscribed=True)]
    users += [new_user(f"Student {i:02d}", f"stu{i:02d}", "student123", "STUDENT", None, rng.randint(0, 300)) for i in range(1, 31)]
    db.users.insert_many(users)
    students = [u for u in users if u["role"] == "STUDENT"]

    foods = []
    img_cfg = {"UPLOAD_DIR": Config.UPLOAD_DIR}
    for n, cat, veg, price, cost, pt, per, _img, w, over, desc in FOODS:
        img, img_source = default_image(n, img_cfg)   # stored in MongoDB; never hardcoded in React
        foods.append({"name": n, "description": desc, "category": cat, "is_veg": veg, "price": price, "prep_cost": cost,
                      "prep_time": pt, "meal_period": per, "available": True, "image_url": img, "image_source": img_source,
                      "stock": {"date": today.isoformat(), "prepared": None, "sold": 0}, "created_at": t_now, "_w": w, "_over": over})
    db.food_items.insert_many(foods)
    db.counters.insert_many([dict(c) for c in DEFAULT_COUNTERS])

    orders, items_flat, payments, order_no = [], [], [], 1000
    days = [today - timedelta(days=i) for i in range(41, 0, -1) if (today - timedelta(days=i)).weekday() != 6] + [today]
    for d in days:
        is_today = d == today
        arr = day_arrivals(rng, d, t_now if is_today else None)
        if is_today:   # make sure there is a live queue to demonstrate, whatever time the seed runs
            arr += [t_now - timedelta(minutes=m) for m in sorted(rng.sample(range(1, 16), 9), reverse=True)]
            arr.sort()
        free = [datetime.combine(d, datetime.min.time())] * SEED_COUNTERS
        for ts in arr:
            period = meal_period_of(ts)
            items = pick_items(rng, foods, period)
            work = work_minutes(items)
            confirm = ts + timedelta(minutes=rng.uniform(0.2, 1.0))
            start = max(confirm, heapq.heappop(free))
            ready = start + timedelta(minutes=work * rng.uniform(0.7, 1.3))
            heapq.heappush(free, ready)
            done = ready + timedelta(minutes=rng.uniform(1, 4))
            stamps = {"confirmed_at": confirm, "prep_started_at": start, "ready_at": ready, "completed_at": done}
            status = "COMPLETED"
            if is_today:
                for st, key in (("PENDING", "confirmed_at"), ("CONFIRMED", "prep_started_at"), ("PREPARING", "ready_at"), ("READY", "completed_at")):
                    if stamps[key] > t_now:
                        status = st
                        break
                stamps = {k: (v if v <= t_now else None) for k, v in stamps.items()}
            u = rng.choice(students)
            order_no += 1
            total = round(sum(i["price"] * i["qty"] for i in items), 2)
            method = rng.choices(METHODS, weights=[6, 2, 2])[0]
            o = {"order_no": order_no, "user_id": u["_id"], "user_name": u["name"], "items": items, "subtotal": total,
                 "discounts": {"birthday": 0, "subscription": 0, "points": 0}, "total": total, "points_redeemed": 0,
                 "points_earned": int(total // 10), "status": status, "meal_period": period, "date": d.isoformat(),
                 "work_min": work, "created_at": ts, "cancelled_at": None, **stamps,
                 "wait_min": round((stamps["ready_at"] - ts).total_seconds() / 60, 1) if stamps["ready_at"] else None,
                 "ordered_at": ts, "committed": True, "points_awarded": True,
                 "payment": {"method": method, "txn_id": None if method == "CASH" and status != "COMPLETED" else mock_txn_id(method), "attempts": 1, "failure_reason": None,
                             "status": "PAY_AT_COUNTER" if method == "CASH" and status != "COMPLETED" else "SUCCESS",
                             "paid_at": None if method == "CASH" and status != "COMPLETED" else ts}}
            if rng.random() < 0.015 and not is_today:   # a few historical cancellations
                o.update(status="CANCELLED", cancelled_at=ts + timedelta(minutes=1), ready_at=None, completed_at=None, wait_min=None)
                o["payment"]["status"] = "REFUNDED" if o["payment"]["status"] == "SUCCESS" else "CANCELLED"
            orders.append(o)
    db.orders.insert_many(orders)
    for o in orders:
        if o["status"] == "CANCELLED": continue
        payments.append({"order_id": o["_id"], "order_no": o["order_no"], "user_id": o["user_id"], "amount": o["total"],
                         "method": o["payment"]["method"], "txn_id": o["payment"]["txn_id"], "status": o["payment"]["status"], "note": "Seed history", "at": o["created_at"]})
        for i in o["items"]:
            items_flat.append({"order_id": o["_id"], "food_id": i["food_id"], "name": i["name"], "qty": i["qty"], "price": i["price"],
                               "date": o["date"], "hour": o["created_at"].hour, "meal_period": o["meal_period"], "created_at": o["created_at"]})
    db.payments.insert_many(payments)
    db.order_items.insert_many(items_flat)
    db.sequences.insert_one({"_id": "order_no", "value": order_no})
    rebuild_demand_records()

    # habitual batch sizes = current (un-optimised) preparation strategy
    sold = {}
    for it in items_flat:
        sold[(it["food_id"], it["date"])] = sold.get((it["food_id"], it["date"]), 0) + it["qty"]
    past_days = [d for d in days if d != today]
    waste = []
    for f in foods:
        avg = sum(sold.get((f["_id"], d.isoformat()), 0) for d in past_days) / len(past_days)
        batch = int(round(avg * f["_over"] / 5) * 5) or 5
        f["_batch"] = batch
        for d in past_days[-14:]:
            s = sold.get((f["_id"], d.isoformat()), 0)
            prepared = max(batch, s)
            waste.append({"food_id": f["_id"], "food_name": f["name"], "date": d.isoformat(), "meal_period": f["meal_period"],
                          **compute_waste(prepared, s, f["prep_cost"], f["price"]), "source": "SEED", "created_at": t_now})
        s_today = sold.get((f["_id"], today.isoformat()), 0)
        db.food_items.update_one({"_id": f["_id"]}, {"$set": {"stock": {"date": today.isoformat(), "prepared": max(batch, s_today + 5), "sold": s_today}}})
    db.waste_records.insert_many(waste)
    db.food_items.update_many({}, {"$unset": {"_w": "", "_over": ""}})

    demo = users[2]
    db.rewards.insert_many([
        {"user_id": demo["_id"], "type": "SPIN", "points": 60, "note": "Daily spin & win", "created_at": t_now - timedelta(days=2)},
        {"user_id": demo["_id"], "type": "EARN", "points": 15, "note": "Order history", "created_at": t_now - timedelta(days=1)}])
    if verbose:
        print(f"Seeded {len(users)} users, {len(foods)} foods, {len(orders)} orders, {len(waste)} waste records.")
        print("Logins: admin/admin123  staff/staff123  student/student123  birthday/birthday123")


if __name__ == "__main__":
    seed(init_db(Config))
