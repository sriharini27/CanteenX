# CanteenX — College Canteen Operations for Minimizing Student Waiting Time and Food Waste

**SMT (Simulation Using Modern Tools) project** · React + Vite + Tailwind · Python Flask REST API · MongoDB · JWT

---

## 1. Problem statement
College canteens see a sharp lunch-hour rush. With a fixed number of service counters, queues explode for 30–60 minutes, students
lose a large share of their break waiting, and staff, unsure how much will sell, cook habitual batch sizes that leave
20 %+ of food unsold every day.

**Research question:** *How can simulation and operational optimisation reduce student waiting time and food waste in a college canteen?*

## 2. Objectives
1. Capture real operational data (orders, timestamps, quantities, waste) through a working ordering system.
2. Give every student a live, explainable estimate of queue position, waiting time and pickup time.
3. Simulate the canteen queue (discrete-event simulation + M/M/c theory) to test counter configurations before changing them.
4. Forecast demand per dish and recommend preparation quantities with a safety buffer.
5. Quantify the improvement **before vs after** optimisation: waiting time, queue length, waste and money.

## 3. Features
| Role | Features |
|---|---|
| **Student** | Register / login / logout · dashboard (canteen status, queue length, estimated wait, popular & available food, today's orders, reward points) · menu with search, category, veg/non-veg and availability filters, live stock · cart (add / reduce / remove) · checkout with simulated UPI / Card / Cash payment · order confirmation with **Order #, status, queue position, estimated wait, expected pickup** · live order tracking · order history & cancel (while PENDING) · rewards: points, daily spin & win, mess subscription, birthday discount, point redemption |
| **Staff** | Dashboard (pending / accepted / preparing / ready / completed, current queue, workload minutes, portions to prepare) · FIFO order board with **Accept → Start preparation → Mark ready → Complete** (and cancel) |
| **Admin** | Operations dashboard (12 KPIs, 7 charts) · order management · menu CRUD + enable/disable · food inventory (today's prepared stock, sold, remaining, apply recommended, close day → waste) · queue management (live metrics, ETA per order, service counters) · waste management · demand prediction & smart preparation · simulation (single run, counter comparison 1–6, before vs after) · 8 reports with print/PDF and CSV export |

Admin navigation contains **only** admin pages; each role has its own sidebar and route guard.

## 4. Existing functionality reused (Java → React/Flask mapping)
The supplied Spring Boot + Thymeleaf project was analysed first. It contained:
* **Entities:** `User` (username, password, role ADMIN/CUSTOMER, dateOfBirth, rewardPoints, lastSpinDate, isSubscribed), `FoodItem` (name, description, price, available, imageUrl, isVeg), `Order` (user, orderDate, status PENDING/PREPARING/READY/DELIVERED/CANCELLED, totalAmount, items), `OrderItem` (order, foodItem, quantity, price at order time), `Payment` (order, amount, method, transactionId, date). Relationships: User 1–N Order, Order 1–N OrderItem, OrderItem N–1 FoodItem, Order 1–1 Payment.
* **Screens:** login, register, customer menu / cart / payment / orders / rewards, admin dashboard / menu.
* **Business logic:** session-cart; checkout → payment page; birthday ₹50 off; mess subscription 20 % off; redeem points (10 pts = ₹1); earn 1 pt per ₹10; daily spin 10–100 pts once per day; `TXN<millis>` mock transaction id; admin revenue / total / pending counts and status updates; menu add/edit/delete; session-based `AuthInterceptor` role checks; plain-text passwords.

| Existing Java functionality | New implementation |
|---|---|
| `AuthController` + `HttpSession` + `AuthInterceptor` | `POST /api/auth/register|login`, JWT (`utils/auth.py`), `@auth_required(roles)`, React `ProtectedRoute` + role sidebars. Roles extended to **STUDENT / STAFF / ADMIN** |
| Plain-text passwords | Werkzeug PBKDF2 hashing; hashes never returned |
| `FoodItemService.searchAvailableFoodItems(keyword, VEG/NON_VEG)` | `GET /api/foods?search=&type=&category=&available=` + React filters |
| `FoodItem` | `food_items` + category, meal period, prep cost (waste loss), prep time (ETA), daily stock |
| Session cart (`CartItemDto`) | `CartContext` (client) – priced server-side at checkout |
| `/customer/payment` preview with birthday/subscription | `POST /api/payments/quote` (same rules + points) |
| `OrderService.placeOrder` (discounts, points, Payment) | `services/order_service.place_order` – same reward rules, plus queue estimate, stock, demand records, queue events |
| `Payment` + `TXN…` id | `payments` collection, methods UPI/CARD/CASH, mock txn id, cash = pay at counter |
| Order status PENDING→PREPARING→READY→DELIVERED | PENDING → CONFIRMED → PREPARING → READY → COMPLETED (+ CANCELLED) with enforced transitions and timestamps |
| Customer orders + status polling API | `GET /api/orders` (own), live ETA polling every 10 s |
| Rewards page, spin API, subscribe toggle | `/api/rewards`, `/spin`, `/subscription` + points history (`rewards` collection) |
| Admin dashboard (revenue, totals, pending) | `GET /api/admin/dashboard` – those KPIs plus queue, wait, waste and 7 charts |
| Admin menu add / update / delete | `POST/PUT/DELETE /api/foods`, `PATCH /api/foods/<id>/availability` |
| `DataLoader` (admin + 5 dishes with images) | `seed.py` – users, 16 dishes (original 5 images reused), 6 weeks of order history |

## 5. New SMT functionality
Live queue management · explainable waiting-time estimate · discrete-event queue simulation (two-stage, NHPP arrivals) · M/M/c Erlang-C cross-check · counter comparison and recommendation · food-waste tracking with high-waste alerts · WMA × day-of-week demand forecasting · forecast-based preparation with safety buffer · back-test of preparation strategy · before-vs-after optimisation dashboard · reports.

## 6. Technology stack
Frontend: React 18, Vite 6, JavaScript, React Router 6, Axios, Tailwind CSS 3, Recharts. Backend: Python 3.10+, Flask 3, flask-cors, PyMongo, PyJWT, python-dotenv. Database: MongoDB 6/7 (optional `mongomock` in-memory mode for quick demos/tests).

## 7. System architecture
```
 React SPA (Vite :5173)  ──/api (Axios + JWT)──►  Flask REST API (:5000)  ──PyMongo──►  MongoDB
   pages / components                              routes  → services → models
   AuthContext, CartContext                        queue · simulation · demand · waste · analytics
```
Student orders → order enters queue (ETA computed) → staff advances status (timestamps) → data stored in `orders`, `order_items`,
`demand_records`, `queue_events` → admin analyses history → demand predicted → preparation optimised → counters simulated →
before/after shows measurable improvement.

## 8. Frontend architecture
```
frontend/src
├── App.jsx                 routes, grouped per role behind ProtectedRoute
├── services/api.js         Axios instance, JWT interceptor, typed endpoint helpers
├── context/                AuthContext (token/user), CartContext (cart)
├── hooks/useFetch.js       load + polling + loading/error state
├── components/             Layout (sidebar), ui (cards, KPI, badges, table, modal, confirm, toast), charts, canteen (tracker, ETA, queue strip)
└── pages/  student/  staff/  admin/   Login, Register
```

## 9. Backend architecture
```
backend/
├── app.py  config.py  db.py  seed.py  requirements.txt  .env.example
├── models/    user · food · order · payment · queue · waste · simulation   (document shapes + validation)
├── routes/    auth · food · order · payment · reward · admin · queue · waste(+demand) · simulation(+optimization)
├── services/  queue_service · simulation_service · demand_service · waste_service · order_service · analytics_service
├── uploads/foods/  dish photos (served at /uploads/foods/...)
├── utils/     auth.py (hashing, JWT, role decorator) · helpers.py (validation, serialisation, time)
└── tests/smoke_test.py   136 end-to-end API checks (incl. all payment scenarios) on an in-memory DB (incl. uploads, price history, Google login with a mocked token)
```

## 10. MongoDB collections
| Collection | Purpose / key fields |
|---|---|
| `users` | name, username (unique), password_hash, role, date_of_birth, reward_points, is_subscribed, last_spin_date |
| `food_items` | name, category, is_veg, price, prep_cost, prep_time, meal_period, available, image_url, stock {date, prepared, sold} |
| `orders` | order_no, user, embedded item snapshot, subtotal, discounts, total, points, payment, status, timestamps (created/confirmed/prep_started/ready/completed/cancelled), work_min, est_position, est_wait_min, est_pickup_at, **wait_min (actual)** |
| `order_items` | one line per dish per order (food_id, qty, date, hour, meal period) – fast analytics |
| `payments` | order_id, amount, method, txn_id, status (SUCCESS / PAY_AT_COUNTER / REFUNDED) |
| `rewards` | points ledger: EARN / REDEEM / SPIN / REFUND / SUBSCRIPTION |
| `queue_events` | every status change with the queue length at that moment |
| `waste_records` | food, date, meal period, prepared, sold, wasted, waste_pct, prep_cost, loss, source |
| `demand_records` | daily quantity per dish (kept in sync on every order / cancel; rebuildable) |
| `simulation_runs` | SINGLE / COMPARE / BEFORE_AFTER runs with params and results |
| `counters` | service counters: name, active, avg_service_min |
| `sequences` | auto-increment order numbers |

## 11. API endpoints
| Method & path | Role | Description |
|---|---|---|
| POST `/api/auth/register`, `/api/auth/login` (username or email); GET `/api/auth/me` | public / any | JWT auth |
| GET `/api/auth/config` · POST `/api/auth/google` | public | Google client ID for the login page · verify Google ID token → app JWT |
| POST `/api/uploads/food-image` (multipart `image`) · GET `/uploads/foods/<file>` | admin · public | upload a dish photo (returns its URL) · serve photos |
| GET `/api/foods` · GET `/api/foods/<id>` | any | menu with filters & stock |
| POST `/api/foods` · PUT/DELETE `/api/foods/<id>` · PATCH `/api/foods/<id>/availability` | admin (toggle: staff too) | menu management |
| GET `/api/foods/inventory/today` · PUT `/api/foods/<id>/stock` · POST `/api/foods/inventory/apply-recommended` · POST `/api/foods/inventory/close-day` | admin/staff | daily inventory → waste |
| POST `/api/orders` | student | create order in AWAITING_PAYMENT (nothing committed yet) |
| GET `/api/orders` · GET `/api/orders/<id>` | any (students see own) | list / detail with live ETA |
| PUT `/api/orders/<id>/status` | staff/admin | workflow transition |
| POST `/api/orders/<id>/cancel` | student | cancel while unpaid or not yet accepted (paid → REFUNDED) |
| POST `/api/payments/quote` · GET `/api/payments` | student / any | bill preview, payment log |
| POST `/api/payments/<order_id>/pay` `{method, upi_id?, test_decline?}` | student | dummy gateway: UPI / CARD → SUCCESS or FAILED, CASH → PAY_AT_COUNTER |
| POST `/api/payments/<order_id>/cancel` | student | close an unpaid payment (CANCELLED, payable later) |
| POST `/api/payments/<order_id>/confirm-cash` | staff/admin | cash received: PAY_AT_COUNTER → SUCCESS |
| GET `/api/payments/order/<order_id>` | owner / staff / admin | attempt log for one order |
| GET `/api/rewards` · POST `/api/rewards/spin` · POST `/api/rewards/subscription` | student | rewards |
| GET `/api/queue/status` | any | live queue metrics |
| GET `/api/queue/live` · `/workload` · `/events` | staff/admin | queue detail |
| GET/POST `/api/queue/counters` · PUT/DELETE `/api/queue/counters/<id>` | admin | service counters |
| GET/POST `/api/waste` · DELETE `/api/waste/<id>` | admin (POST staff too) | waste records + summary |
| GET `/api/demand/prediction` · `/history/<id>` · `/peak-hours` · `/backtest`; POST `/api/demand/rebuild` | admin/staff | forecasting |
| GET `/api/simulation/defaults` · POST `/api/simulation/run` · POST `/api/simulation/compare` · GET/DELETE `/api/simulation/runs[/<id>]` | admin | simulation |
| POST `/api/optimization/before-after` · GET `/api/optimization/latest` | admin | before vs after |
| GET `/api/admin/dashboard` · GET `/api/student/dashboard` · GET `/api/reports/<kind>` | admin / student / admin | dashboards & reports (`daily, weekly, waiting, queue, waste, demand, simulation, before-after`) |

## 12. Queue simulation methodology (`services/simulation_service.py`)
* **Model:** two-stage tandem FIFO queue. Stage 1 = *c* service counters (order + pay, mean `service_time`); stage 2 = *p* preparation stations (plate / hand-over, mean `prep_time`; 0 disables it).
* **Arrivals:** non-homogeneous Poisson process — normal rate λ outside the peak window, peak rate λₚ inside it — generated by **Lewis-Shedler thinning**: candidate gaps ~ Exp(λmax), accept with probability λ(t)/λmax. Arrivals stop at the number of students or the duration.
* **Service times:** exponential (M/M/c), uniform ±50 % or constant (M/D/c).
* **Discrete-event logic:** events ARRIVAL → COUNTER START → COUNTER END (= PREP ARRIVAL) → PREP START → DEPARTURE. With FIFO and identical servers, each start time is `max(arrival, earliest free server)` (a min-heap of server free times) — exactly what an event-list simulation produces, and easy to trace by hand.
* **Common random numbers:** arrivals and service times use separate seeded streams, so 2 vs 3 counters are tested on *identical* students → differences are caused by the configuration, not luck. Optional replications average several seeds.
* **Outputs:** total / served (by closing time) / remaining students, average · max · 90th-percentile wait (counter + prep), time-weighted average and maximum queue length, counter utilisation = Σservice ÷ (c × session length), prep-station utilisation, throughput = students ÷ (last departure − first arrival) × 60, service level = % waiting ≤ target, queue timeline and wait histogram.
* **Analytical cross-check:** M/M/c Erlang-C with λ = average arrival rate, μ = 1/service time, ρ = λ/(cμ); if ρ < 1, P(wait) = C(c, a), Wq = P(wait)/(cμ − λ), Lq = λWq. ρ ≥ 1 means the queue grows without bound — the simulation shows how bad it gets in a finite lunch break.

## 13. Waiting-time calculation (live orders, `services/queue_service.py`)
```
work of an order  = longest item serve time + 0.5 min × (total portions − 1)
remaining work    = work                       (PENDING / CONFIRMED)
                  = max(0.5, work − minutes since preparation started)   (PREPARING)
ETA (position p)  = Σ remaining work of the orders ahead ÷ active counters  +  own work
pickup time       = now + ETA
```
Every order stores its estimate at placement (`est_wait_min`) and its actual wait when READY (`wait_min`), so the Waiting Time report shows the estimate's mean absolute error.

## 14. Demand prediction methodology (`services/demand_service.py`)
1. **WMA(5):** weighted moving average of the last 5 operating days, weights 1…5. Example: Biryani 72, 65, 81, 76, 92 → (72 + 130 + 243 + 304 + 460) / 15 = **80.6**.
2. **Day-of-week index** = average demand on that weekday ÷ overall average (needs ≥ 2 samples, clamped 0.7–1.3).
3. **Forecast** = WMA × index.
4. **Recommended preparation** = ⌈forecast × (1 + buffer)⌉ → 80.6 × 1.05 → **85** portions.
SMA is shown alongside for comparison; the chart of daily demand shows the forecast line.

## 15. Food waste calculation (`models/waste.py`)
`Waste = Prepared − Sold` · `Waste % = Waste ÷ Prepared × 100` · `Loss = Waste × preparation cost`. Items above **20 %** are flagged *"High food wastage detected"*. Example: Dosa prepared 100, sold 63 → waste 37 → 37 % → flagged. Waste records come from the Inventory page's **Close day** (prepared stock − sold through orders), manual entry, or seed history.

## 16. Optimisation methodology
* **Counters:** simulate c = 1…6 on the same students; recommended c = smallest configuration whose simulated average wait ≤ target (default 10 min). Reductions: `(before − after) / before × 100`; service efficiency = throughput gain.
* **Preparation:** back-test — for each of the last N days of real waste records, forecast that day using only earlier data, prepare forecast + buffer, and compare waste (`max(0, prepared − sold)`) and shortage (`max(0, sold − prepared)`) with what the canteen actually prepared. The buffer trade-off chart shows waste vs shortage for 0–20 %.
* **Before vs after** combines both and stores the result in `simulation_runs`; the admin dashboard always shows the latest one.

## 16b. Dynamic menu, food images and Google sign-in
**Menu data flow:** Admin → `POST/PUT /api/foods` → MongoDB `food_items` → `GET /api/foods` → React menu. React components contain no food names, prices, descriptions, images or availability. The student menu re-fetches every 20 s and whenever the tab regains focus. The cart re-syncs names, prices and photos with the live menu on the Menu, Cart and Checkout pages. The server always prices orders from MongoDB at checkout (`/api/payments/quote`, `/api/orders`).

**Price changes:** new orders use the current price. Each order stores its own item snapshot (`orders.items[].price`), so past orders keep the price they were bought at.

**Food images:**
* Photos are files in `backend/uploads/foods/`, served by Flask at `/uploads/foods/<file>`.
* MongoDB stores only the reference: `food_items.image_url` (and `image_source` for credits).
* **Upload flow:** Admin → Menu Management → Add/Edit → *Choose image* (or drag & drop) → preview → **Upload & save**. The file goes to `POST /api/uploads/food-image` and the returned URL is saved with the dish.
* **Upload checks:** JPG/PNG/WEBP/GIF only, 5 MB maximum, extension and file signature verified, random file names, and `send_from_directory` blocks path traversal.
* **Replacing an image:** the old uploaded file is deleted once no dish uses it.
* **Missing or broken images:** the UI shows a neutral plate placeholder with the same aspect ratio, never a broken-image icon.
* **Default photos:** five ship with the project. The other eleven are freely licensed Wikimedia Commons photos that the backend downloads into `uploads/foods/` on first start (`FETCH_FOOD_IMAGES=true`; needs internet once). Until they download, the Commons URL is used directly. Any photo can be replaced from Menu Management.

**Google sign-in (Google Identity Services):**
React shows Google's official button → Google returns an ID token → `POST /api/auth/google` → Flask verifies the token with Google's public keys (`google-auth`: signature, expiry, audience = your client ID, issuer, `email_verified`) → finds the user by `google_id`, else links the existing **student** account with the same verified email, else creates a new **STUDENT** → returns the app JWT → redirect to the student dashboard.
* Google users never become STAFF/ADMIN. A Google login matching a staff/admin email is refused; those accounts must use their username and password.
* No Google password is stored.
* User fields: `auth_provider` (`local` / `google` / `local+google`), `google_id`, `email`, `profile_image`.
* Local username/password login keeps working alongside Google login.
* Known limitation: local signup emails are not verified. Google login can therefore link to a student account that someone else registered with the same email. A production system should verify emails before linking.

**Setting up Google login (one time, about 5 minutes):**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create or select a project → **APIs & Services → OAuth consent screen**. Choose External, fill in the app name and your email, and add yourself as a test user.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
3. Under **Authorized JavaScript origins**, add `http://localhost:5173` and `http://localhost`. No redirect URI is needed.
4. Copy the **Client ID** (`…apps.googleusercontent.com`) into **`backend/.env`** (not `.env.example`; that file is only a template) as `GOOGLE_CLIENT_ID=...` and restart `python app.py`. The login page then shows **Continue with Google**. Without it, the page explains that Google login isn't configured.
5. Only the public **client ID** is used. No client secret is needed, and none is ever sent to React. To check: `http://localhost:5000/api/auth/config` should show your client ID.

**Image credits (Wikimedia Commons, see each file page for author and licence):** Idly sambar vada.JPG · Kanda poha.jpg · Veg Kaju Biryani.jpg · A Thali, famous South Indian meal served on a banana leaf.jpg · Chapati2.JPG · Indian Samosa by clumsy home chef.jpg · Bite of Curry Puff.jpg · Egg Puffs.jpg · Chicken Egg Roll.JPG · Masala Chai.JPG · Nimbu pani.JPG. Pages are at `https://commons.wikimedia.org/wiki/File:<name>` and are also stored per dish in `image_source`.

## 16c. Dummy payment workflow (UPI / Card / Cash)
No real payment gateway is used and no money moves. Card details are checked only in the browser and are never sent to or stored by the server.

**Flow:** Menu → Cart → Checkout (choose UPI / Card / Cash) → `POST /api/orders` creates the order as **AWAITING_PAYMENT** with payment **PENDING** → `/student/payment/:orderId` → the dummy gateway runs (*Processing payment… → Verifying payment…*):
* **SUCCESS** → order becomes **PENDING** and **enters the queue**. Stock is reduced, demand is recorded, reward points are redeemed and earned, and a queue event is logged. Shows *✓ Payment Successful*, the transaction ID (e.g. `UPI-20261004-482913`) and **Track Order**.
* **FAILED** (or the student presses *Cancel payment* → **CANCELLED**, or simply leaves) → the order stays **AWAITING_PAYMENT**. It is not queued, earns no points, records no demand and takes no stock. *My Orders* and the dashboard show **"Payment not completed" → Pay Now**, which reopens `/student/payment/:orderId`. Retries are logged as attempts.
* **CASH** → *Confirm Pay at Counter* → payment **PAY_AT_COUNTER** and the order enters the queue. Staff press **Confirm Payment** (Admin → Orders, or *₹ Paid / Confirm cash* on the staff board) when the cash is received → **SUCCESS**, a `CASH-…` transaction ID, and reward points. An order cannot be marked COMPLETED until its payment is SUCCESS.
* Cancelling a paid order sets the payment to **REFUNDED** and returns stock, demand and points. Cancelling an unpaid order sets it to **CANCELLED** (nothing to undo).

**Payment states:** PENDING · PROCESSING · SUCCESS · FAILED · CANCELLED · PAY_AT_COUNTER · REFUNDED (stored in `orders.payment`, with every attempt appended to the `payments` collection). Order status and payment status are separate fields: AWAITING_PAYMENT orders are excluded from the queue, revenue and all SMT analytics. `created_at` is the time the order entered the queue; `ordered_at` is the time it was placed.

**Dummy-gateway test values:** UPI ID ending in `@fail` (e.g. `student@fail`) is declined. Card `4000 0000 0000 0002` is declined. Any other valid UPI ID, or a valid (Luhn-checked) card with a future expiry and a 3-digit CVV, succeeds.

**Historical prices:** each order stores its own item prices, so admin price changes only affect new orders.

## 17. Installation
Prerequisites: **Node.js 18+**, **Python 3.10+**, **MongoDB 6/7** running locally (or a MongoDB Atlas URI).

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate            # Windows   (macOS/Linux: source venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env           # macOS/Linux: cp .env.example .env
python app.py                    # http://localhost:5000  (seeds demo data on first start)

# Frontend (new terminal)
cd frontend
npm install
npm run dev                      # http://localhost:5173
```
Windows shortcuts: `run_backend.bat` and `run_frontend.bat` in the project root do the same.

## 18. Configuration (`backend/.env`)
| Variable | Meaning |
|---|---|
| `MONGO_URI` | e.g. `mongodb://localhost:27017` or an Atlas URI |
| `DB_NAME` | database name (default `canteen_smt`) |
| `JWT_SECRET` | long random string for signing tokens |
| `FLASK_ENV` | `development` or `production` |
| `PORT`, `CORS_ORIGINS` | API port and allowed frontend origins |
| `AUTO_SEED` | seed demo data when the DB is empty (default true) |
| `USE_MOCK_DB` | `true` = in-memory MongoDB emulation, no install needed (data resets on restart) |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Web client ID; empty = Google login hidden |
| `FETCH_FOOD_IMAGES` | download the default dish photos into `uploads/foods` on first start |

Frontend: optional `frontend/.env` with `VITE_API_URL` (empty = use the Vite proxy to `127.0.0.1:5000`).

## 19. How to run / reset
* Start MongoDB, then `python app.py` and `npm run dev`.
* Re-generate demo data at any time: `python seed.py` (wipes and reseeds the database; today always has a live queue).
* API self-test (no MongoDB needed): `python tests/smoke_test.py`.

## 20. Demo credentials
| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Staff | `staff` | `staff123` |
| Student | `student` | `student123` |
| Student whose birthday is today (+ mess subscription) | `birthday` | `birthday123` |
| 30 more students | `stu01` … `stu30` | `student123` |

**Simulation page extras:**
* A *How this simulation works* panel explains the flow (arrivals → queue → counters → preparation → completed) and each input in plain language.
* *Simulation data source*: **Manual Parameters** or **Use Live Canteen Data**. The live option derives the student count, arrival rate, peak rate and window, service time and active counters from MongoDB, and shows how each value was computed so you can review it before running.
* Counter comparison tests 1–6 counters and states e.g. *"Activate 3 counters. 3 counters are the minimum configuration that achieves the target average waiting time of 10 minutes."*

## 21. Sample simulation scenario (Phase-21 demo — the "Phase-21 demo" preset)
100 students arrive during a 150-minute lunch: 0.7 students/min normally, **1.4/min in the rush (minute 30–60)**; service time 4 min (exponential); 4 preparation stations at 3 min; seed 42.
1. Admin → Simulation → Queue simulation → **RUN SIMULATION** with 2 counters.
2. Click **Re-run with 3 counters** — the banner shows the change.
3. Counter comparison tab tests 1–4 counters side by side; Before vs after tab produces the full report (queue + waste).

## 22. Expected results (seed 42, deterministic)
| Counters | Avg wait | Max wait | Max queue | Served by closing | Counter utilisation | ρ |
|---|---|---|---|---|---|---|
| 1 | 133.9 min | 288.3 min | 62 | 38 | 97.9 % | 2.67 |
| **2 (before)** | **38.9 min** | 85.0 min | **34** | 74 | 92.7 % | 1.33 |
| **3 (after)** | **11.4 min** | 25.7 min | **18** | 94 | 85.3 % | 0.89 |
| 4 | 3.4 min | 14.0 min | 13 | 99 | 70.6 % | 0.67 |

2 → 3 counters: **waiting time −70.6 %**, queue −47.1 %, service efficiency (throughput) +37.8 %. The target-based recommender picks 4 counters for a 10-minute average-wait target, showing the diminishing return of the 4th counter.

Preparation (7-day back-test on seeded data, 5 % buffer): waste falls from about **516 portions (20.4 %) to 331 (15.1 %) → ≈ 36 % less waste and ≈ ₹4,500 saved per week**, with a ≈ 92 % demand fill rate. A 0 % buffer cuts waste further (≈ 47 %) at the cost of more shortages — the buffer trade-off chart makes this explicit. Exact waste figures depend on the seed date because history is generated relative to today.

---
*Payments are simulated only — no real financial transactions are performed.*
