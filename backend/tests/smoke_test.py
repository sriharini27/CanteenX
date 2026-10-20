"""End-to-end API smoke test against an in-memory MongoDB.   python tests/smoke_test.py"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.update(USE_MOCK_DB="true", AUTO_SEED="true")
from config import Config
Config.USE_MOCK_DB, Config.AUTO_SEED, Config.FETCH_FOOD_IMAGES = True, True, False
Config.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com"
import io
from app import create_app

t0 = time.time()
app = create_app()
print(f"app + seed in {time.time() - t0:.1f}s")
c = app.test_client()
ok = 0


def call(method, url, token=None, json=None, expect=200):
    global ok
    r = c.open(url, method=method, json=json, headers={"Authorization": f"Bearer {token}"} if token else {})
    assert r.status_code == expect, f"{method} {url} -> {r.status_code} {r.get_json()}"
    ok += 1
    return r.get_json()


tok = {u: call("POST", "/api/auth/login", json={"username": u, "password": p})["token"]
       for u, p in [("admin", "admin123"), ("staff", "staff123"), ("student", "student123"), ("birthday", "birthday123")]}
call("POST", "/api/auth/login", json={"username": "admin", "password": "x"}, expect=401)
reg = call("POST", "/api/auth/register", json={"name": "New", "username": "newbie", "password": "secret1"}, expect=201)
assert "password_hash" not in reg["user"] and reg["user"]["role"] == "STUDENT"
call("POST", "/api/auth/register", json={"name": "New", "username": "newbie", "password": "secret1"}, expect=409)
call("GET", "/api/admin/dashboard", tok["student"], expect=403)
call("GET", "/api/admin/dashboard", expect=401)

foods = call("GET", "/api/foods", tok["student"])
assert len(foods) == 16
veg = call("GET", "/api/foods?type=NON_VEG", tok["student"]); assert all(not f["is_veg"] for f in veg)
assert call("GET", "/api/foods?search=dosa", tok["student"])[0]["name"] == "Masala Dosa"
bir = next(f for f in foods if f["name"] == "Chicken Biryani")
tea = next(f for f in foods if f["name"] == "Masala Tea")
items = [{"food_id": bir["id"], "qty": 2}, {"food_id": tea["id"], "qty": 1}]

q = call("POST", "/api/payments/quote", tok["birthday"], {"items": items, "use_points": True})
print("birthday quote:", q["subtotal"], q["discounts"], q["total"])
assert q["discounts"]["birthday"] == 50 and q["discounts"]["subscription"] > 0

from db import get_db
def points(u): return get_db().users.find_one({"username": u})["reward_points"]
def sold(fid): return call("GET", f"/api/foods/{fid}", tok["admin"])["stock"]["sold"]
def queue_len(): return call("GET", "/api/queue/status", tok["staff"])["queue_length"]

# SCENARIO 1: UPI success -> order enters queue, stock + points updated only now
p0, s0, q0 = points("student"), sold(bir["id"]), queue_len()
o = call("POST", "/api/orders", tok["student"], {"items": items, "payment_method": "UPI", "use_points": False}, 201)
oid_ = o["id"]
assert o["status"] == "AWAITING_PAYMENT" and o["payment"]["status"] == "PENDING" and "live" not in o
assert sold(bir["id"]) == s0 and points("student") == p0 and queue_len() == q0, "nothing committed before payment"
call("PUT", f"/api/orders/{oid_}/status", tok["staff"], {"status": "CONFIRMED"}, 400)     # unpaid can't be accepted
paid = call("POST", f"/api/payments/{oid_}/pay", tok["student"], {"method": "UPI", "upi_id": "student@upi"})
assert paid["payment"]["status"] == "SUCCESS" and paid["payment"]["txn_id"].startswith("UPI-") and paid["status"] == "PENDING"
print(f"order #{paid['order_no']} paid {paid['payment']['txn_id']} live={paid['live']['formula']}")
assert sold(bir["id"]) == s0 + 2 and points("student") == p0 + paid["points_earned"] and queue_len() == q0 + 1
call("POST", f"/api/payments/{oid_}/pay", tok["student"], {"method": "UPI", "upi_id": "student@upi"}, 409)  # no double pay
call("PUT", f"/api/orders/{oid_}/status", tok["student"], {"status": "CONFIRMED"}, 403)
call("PUT", f"/api/orders/{oid_}/status", tok["staff"], {"status": "READY"}, 400)
for s in ["CONFIRMED", "PREPARING", "READY", "COMPLETED"]:
    call("PUT", f"/api/orders/{oid_}/status", tok["staff"], {"status": s})
assert call("GET", f"/api/orders/{oid_}", tok["student"])["wait_min"] is not None

# SCENARIO 2: UPI failure -> stays unpaid (no queue/points/stock) -> Pay Now -> retry -> success
p0, s0 = points("student"), sold(tea["id"])
f = call("POST", "/api/orders", tok["student"], {"items": [{"food_id": tea["id"], "qty": 2}], "payment_method": "UPI"}, 201)
r = call("POST", f"/api/payments/{f['id']}/pay", tok["student"], {"method": "UPI", "upi_id": "student@fail"})
assert r["payment"]["status"] == "FAILED" and r["status"] == "AWAITING_PAYMENT" and r["payment"]["failure_reason"]
assert sold(tea["id"]) == s0 and points("student") == p0
assert any(x["id"] == f["id"] and x["payment"]["status"] == "FAILED" for x in call("GET", "/api/orders", tok["student"]))
r = call("POST", f"/api/payments/{f['id']}/pay", tok["student"], {"method": "UPI", "upi_id": "student@upi"})
assert r["payment"]["status"] == "SUCCESS" and r["payment"]["attempts"] == 2 and sold(tea["id"]) == s0 + 2
assert len(call("GET", f"/api/payments/order/{f['id']}", tok["student"])) == 2   # attempt log

# SCENARIO 3 + 4: card success; card decline -> payment page (still payable); cancel -> CANCELLED -> pay later
c1 = call("POST", "/api/orders", tok["student"], {"items": [{"food_id": tea["id"], "qty": 1}], "payment_method": "CARD"}, 201)
assert call("POST", f"/api/payments/{c1['id']}/pay", tok["student"], {"method": "CARD"})["payment"]["status"] == "SUCCESS"
c2 = call("POST", "/api/orders", tok["student"], {"items": [{"food_id": tea["id"], "qty": 1}], "payment_method": "CARD"}, 201)
assert call("POST", f"/api/payments/{c2['id']}/pay", tok["student"], {"method": "CARD", "test_decline": True})["payment"]["status"] == "FAILED"
assert call("POST", f"/api/payments/{c2['id']}/cancel", tok["student"])["payment"]["status"] == "CANCELLED"
assert call("POST", f"/api/payments/{c2['id']}/pay", tok["student"], {"method": "UPI", "upi_id": "a@upi"})["payment"]["status"] == "SUCCESS"
call("POST", f"/api/payments/{c2['id']}/pay", tok["birthday"], {"method": "UPI", "upi_id": "a@upi"}, 404)   # not your order

# SCENARIO 5: cash -> PAY_AT_COUNTER (queued, no points yet) -> staff confirm -> SUCCESS (+points)
p0 = points("student")
o2 = call("POST", "/api/orders", tok["student"], {"items": [{"food_id": bir["id"], "qty": 1}], "payment_method": "CASH"}, 201)
r = call("POST", f"/api/payments/{o2['id']}/pay", tok["student"], {"method": "CASH"})
assert r["payment"]["status"] == "PAY_AT_COUNTER" and r["status"] == "PENDING" and points("student") == p0
for s in ["CONFIRMED", "PREPARING", "READY"]:
    call("PUT", f"/api/orders/{o2['id']}/status", tok["staff"], {"status": s})
call("PUT", f"/api/orders/{o2['id']}/status", tok["staff"], {"status": "COMPLETED"}, 400)   # cash not confirmed yet
call("POST", f"/api/payments/{o2['id']}/confirm-cash", tok["student"], expect=403)
r = call("POST", f"/api/payments/{o2['id']}/confirm-cash", tok["staff"])
assert r["payment"]["status"] == "SUCCESS" and r["payment"]["txn_id"].startswith("CASH-") and points("student") == p0 + r["points_earned"]
call("PUT", f"/api/orders/{o2['id']}/status", tok["staff"], {"status": "COMPLETED"})
call("POST", f"/api/payments/{o2['id']}/confirm-cash", tok["staff"], expect=409)

# cancellations: unpaid -> CANCELLED (nothing to undo); paid & not accepted -> REFUNDED with stock returned
u = call("POST", "/api/orders", tok["student"], {"items": [{"food_id": tea["id"], "qty": 1}], "payment_method": "UPI"}, 201)
assert call("POST", f"/api/orders/{u['id']}/cancel", tok["student"])["payment"]["status"] == "CANCELLED"
s0 = sold(tea["id"])
rp = call("POST", "/api/orders", tok["student"], {"items": [{"food_id": tea["id"], "qty": 1}], "payment_method": "UPI"}, 201)
call("POST", f"/api/payments/{rp['id']}/pay", tok["student"], {"method": "UPI", "upi_id": "x@upi"})
assert call("POST", f"/api/orders/{rp['id']}/cancel", tok["student"])["payment"]["status"] == "REFUNDED" and sold(tea["id"]) == s0
call("POST", "/api/orders", tok["student"], {"items": [], "payment_method": "UPI"}, 400)
call("POST", "/api/orders", tok["student"], {"items": [{"food_id": tea["id"], "qty": 99}], "payment_method": "UPI"}, 400)
mine = call("GET", "/api/orders", tok["student"]); assert all(m["user_name"] == "Ananya Student" for m in mine)

r = call("GET", "/api/rewards", tok["student"]); print("points", r["points"], "can_spin", r["can_spin"])
call("POST", "/api/rewards/spin", tok["student"]); call("POST", "/api/rewards/spin", tok["student"], expect=400)
call("POST", "/api/rewards/subscription", tok["student"])
call("GET", "/api/student/dashboard", tok["student"])
call("GET", "/api/payments", tok["student"])

print("queue:", {k: v for k, v in call("GET", "/api/queue/status", tok["staff"]).items() if k in ("queue_length", "avg_wait_min", "max_queue_today", "utilization_pct", "status")})
call("GET", "/api/queue/live", tok["staff"]); call("GET", "/api/queue/workload", tok["staff"]); call("GET", "/api/queue/events", tok["admin"])
cs = call("GET", "/api/queue/counters", tok["admin"])
call("PUT", f"/api/queue/counters/{cs[2]['id']}", tok["admin"], {"active": True})
call("PUT", f"/api/queue/counters/{cs[2]['id']}", tok["admin"], {"active": False})

f = call("POST", "/api/foods", tok["admin"], {"name": "Test Pasta", "price": 99, "prep_cost": 40, "category": "Meals", "is_veg": True}, 201)
call("PUT", f"/api/foods/{f['id']}", tok["admin"], {"price": 109})
call("PATCH", f"/api/foods/{f['id']}/availability", tok["admin"])
call("DELETE", f"/api/foods/{f['id']}", tok["admin"])
call("POST", "/api/foods", tok["admin"], {"name": "", "price": 10}, 400)
inv = call("GET", "/api/foods/inventory/today", tok["admin"]); print("inventory rows", len(inv["items"]))
call("PUT", f"/api/foods/{tea['id']}/stock", tok["admin"], {"prepared": 200})
call("POST", "/api/foods/inventory/apply-recommended", tok["admin"], {"buffer_pct": 5})

w = call("GET", "/api/waste", tok["admin"]); s = w["summary"]
print(f"waste 7d: prepared={s['total_prepared']} wasted={s['total_wasted']} ({s['waste_pct']}%) high={[h['name'] for h in s['high_waste']]}")
call("POST", "/api/waste", tok["admin"], {"food_id": bir["id"], "prepared": 50, "sold": 60}, 400)
call("POST", "/api/waste", tok["admin"], {"food_id": bir["id"], "prepared": 60, "sold": 50}, 201)
p = call("GET", "/api/demand/prediction?buffer=5", tok["admin"])
print("prediction top:", [(i["name"], i["wma"], i["dow_factor"], i["forecast"], i["recommended"], i["current_prep"]) for i in p["items"][:3]])
call("GET", "/api/demand/peak-hours", tok["admin"]); bt = call("GET", "/api/demand/backtest?days=7", tok["admin"]); print("backtest:", bt["totals"])
call("GET", f"/api/demand/history/{bir['id']}", tok["admin"])

d = call("GET", "/api/simulation/defaults", tok["admin"]); print("from data:", d["from_data"])
r1 = call("POST", "/api/simulation/run", tok["admin"], d["demo"])["results"]
print("sim c=2:", {k: r1[k] for k in ("total_students", "students_served", "avg_wait", "max_wait", "max_queue_length", "counter_utilization")}, r1["analytical"])
cmp_ = call("POST", "/api/simulation/compare", tok["admin"], {**d["demo"], "counter_options": [1, 2, 3, 4]})
print("compare:", [(row["counters"], row["avg_wait"], row["wait_reduction_pct"]) for row in cmp_["results"]["rows"]], "recommended", cmp_["recommended"])
call("POST", "/api/simulation/run", tok["admin"], {**d["demo"], "counters": 0}, 400)
call("POST", "/api/simulation/run", tok["admin"], d["from_data"])
ba = call("POST", "/api/optimization/before-after", tok["admin"], {"before_counters": 2, "after_counters": 3, "sim": d["demo"], "buffer_pct": 5})
print("before/after:", ba["results"]["summary"]["improvements"])
call("GET", "/api/simulation/runs", tok["admin"]); call("GET", "/api/optimization/latest", tok["admin"])
dash = call("GET", "/api/admin/dashboard", tok["admin"]); print("dashboard kpis:", dash["kpis"])
for k in ["daily", "weekly", "waiting", "queue", "waste", "demand", "simulation", "before-after"]:
    call("GET", f"/api/reports/{k}", tok["admin"])
call("GET", "/api/reports/nope", tok["admin"], expect=404)
call("POST", "/api/foods/inventory/close-day", tok["admin"])
# ---------- menu images, upload, price changes ----------
assert all(f["image_url"] for f in call("GET", "/api/foods", tok["student"])), "every dish needs an image_url"
png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
def upload(token, data, name, expect):
    r = c.post("/api/uploads/food-image", data={"image": (io.BytesIO(data), name)}, content_type="multipart/form-data",
               headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == expect, (r.status_code, r.get_json()); return r.get_json()
url = upload(tok["admin"], png, "dish.png", 201)["url"]
upload(tok["student"], png, "dish.png", 403)
upload(tok["admin"], b"not an image at all", "evil.png", 400)
upload(tok["admin"], png, "evil.exe", 400)
assert c.get(url).status_code == 200 and c.get("/uploads/../app.py").status_code == 404
new = call("POST", "/api/foods", tok["admin"], {"name": "Lemon Rice", "price": 50, "prep_cost": 18, "category": "Meals", "image_url": url}, 201)
call("POST", "/api/foods", tok["admin"], {"name": "Bad", "price": 50, "image_url": "javascript:alert(1)"}, 400)
url2 = upload(tok["admin"], png, "dish2.png", 201)["url"]
call("PUT", f"/api/foods/{new['id']}", tok["admin"], {"image_url": url2, "name": "Lemon Rice Special", "price": 55})
assert c.get(url).status_code == 404, "replaced image file should be removed"
assert any(f["name"] == "Lemon Rice Special" and f["price"] == 55 for f in call("GET", "/api/foods", tok["student"]))
call("DELETE", f"/api/foods/{new['id']}", tok["admin"]); assert c.get(url2).status_code == 404
old_order = call("GET", f"/api/orders/{oid_}", tok["student"])
old_price = next(i["price"] for i in old_order["items"] if i["food_id"] == bir["id"])
call("PUT", f"/api/foods/{bir['id']}", tok["admin"], {"price": old_price + 20})
q2 = call("POST", "/api/payments/quote", tok["student"], {"items": [{"food_id": bir["id"], "qty": 1}]})
assert q2["subtotal"] == old_price + 20, "new orders must use the current menu price"
assert next(i["price"] for i in call("GET", f"/api/orders/{oid_}", tok["student"])["items"] if i["food_id"] == bir["id"]) == old_price, "history must keep its price"

dash = call("GET", "/api/admin/dashboard", tok["admin"]); assert dash["waste_optimization"]["waste_reduction_pct"] > 0
cmp2 = call("POST", "/api/simulation/compare", tok["admin"], {**d["demo"], "counter_options": [1, 2, 3, 4, 5, 6]})
print("recommendation:", cmp2["recommendation"])
assert cmp2["recommendation"]["met"] and call("GET", "/api/simulation/defaults", tok["admin"])["from_data"]["explain"]

# ---------- Google sign-in (token verification mocked; the real one calls Google) ----------
import routes.auth_routes as ar
assert call("GET", "/api/auth/config")["google_client_id"] == Config.GOOGLE_CLIENT_ID
def fake(info):
    ar.verify_google_credential = lambda cred, cid: info
fake({"iss": "accounts.google.com", "sub": "g-123", "email": "Priya.K@gmail.com", "email_verified": True, "name": "Priya K", "picture": "https://x/p.jpg"})
gs = call("POST", "/api/auth/google", json={"credential": "x"})
assert gs["user"]["role"] == "STUDENT" and gs["user"]["auth_provider"] == "google" and "google_id" not in gs["user"]
assert call("POST", "/api/auth/google", json={"credential": "x"})["user"]["id"] == gs["user"]["id"], "returning user, no duplicate"
call("GET", "/api/student/dashboard", gs["token"])
call("POST", "/api/auth/login", json={"username": "priya.k@gmail.com", "password": "whatever"}, expect=401)
call("POST", "/api/auth/register", json={"name": "Ravi", "username": "ravi_local", "password": "secret1", "email": "ravi@college.edu"}, expect=201)
fake({"iss": "accounts.google.com", "sub": "g-456", "email": "ravi@college.edu", "email_verified": True, "name": "Ravi"})
linked = call("POST", "/api/auth/google", json={"credential": "x"})["user"]
assert linked["username"] == "ravi_local" and linked["auth_provider"] == "local+google", "links to existing student"
call("POST", "/api/auth/login", json={"username": "ravi_local", "password": "secret1"})   # local login still works
get_db().users.update_one({"username": "admin"}, {"$set": {"email": "boss@college.edu"}})
fake({"iss": "accounts.google.com", "sub": "g-789", "email": "boss@college.edu", "email_verified": True})
call("POST", "/api/auth/google", json={"credential": "x"}, expect=403)
fake({"iss": "accounts.google.com", "sub": "g-999", "email": "x@y.com", "email_verified": False})
call("POST", "/api/auth/google", json={"credential": "x"}, expect=401)
ar.verify_google_credential = lambda cred, cid: (_ for _ in ()).throw(ValueError("bad"))
call("POST", "/api/auth/google", json={"credential": "forged"}, expect=401)
assert get_db().users.count_documents({"role": {"$ne": "STUDENT"}}) == 2, "Google never creates staff/admin"

print(f"\nALL {ok} CHECKS PASSED in {time.time() - t0:.1f}s")
