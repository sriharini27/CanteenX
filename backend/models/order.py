"""orders collection (items embedded as a snapshot) + order_items (flattened lines for analytics).
orders: { _id, order_no, user_id, user_name, items:[{food_id,name,price,qty,prep_time,is_veg}], subtotal,
  discounts:{birthday,subscription,points}, total, points_redeemed, points_earned,
  payment:{method, txn_id, status}, status, meal_period, date, work_min,
  est_position, est_wait_min, est_pickup_at, wait_min (actual),
  created_at, confirmed_at, prep_started_at, ready_at, completed_at, cancelled_at }
payment: see models/payment.py. created_at = time the order entered the queue (payment accepted); ordered_at = time it was placed.
order_items: { order_id, food_id, name, qty, price, date, hour, meal_period, created_at }"""

STATUSES = ["AWAITING_PAYMENT", "PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]
NOT_COUNTED = ["AWAITING_PAYMENT", "CANCELLED"]          # excluded from queue, revenue and SMT analytics
ACTIVE = ["PENDING", "CONFIRMED", "PREPARING"]          # still in the queue (not yet ready)
OPEN = ACTIVE + ["READY"]                                # not yet collected

# allowed workflow transitions (staff/admin)
TRANSITIONS = {
    "AWAITING_PAYMENT": ["CANCELLED"],                     # leaves this state only via payment (see payment_service)
    "PENDING": ["CONFIRMED", "CANCELLED"],
    "CONFIRMED": ["PREPARING", "CANCELLED"],
    "PREPARING": ["READY", "CANCELLED"],
    "READY": ["COMPLETED"],
    "COMPLETED": [], "CANCELLED": [],
}
TIMESTAMP_FIELD = {"CONFIRMED": "confirmed_at", "PREPARING": "prep_started_at", "READY": "ready_at",
                   "COMPLETED": "completed_at", "CANCELLED": "cancelled_at"}
