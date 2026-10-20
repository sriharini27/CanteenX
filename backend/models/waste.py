"""waste_records collection (one per food item per day) + demand_records (daily demand per item).
waste_records:  { _id, food_id, food_name, date, meal_period, prepared, sold, wasted, waste_pct,
                  prep_cost, price, loss, source: SEED|MANUAL|DAY_CLOSE, created_at }
demand_records: { _id, food_id, food_name, date, day_of_week, quantity }"""
from utils.helpers import ApiError

HIGH_WASTE_PCT = 20.0  # flag items wasting more than this


def compute_waste(prepared, sold, prep_cost, price):
    """Waste Quantity = Prepared - Sold ; Waste % = Waste / Prepared x 100 ; Loss = Waste x prep cost."""
    if prepared < 0 or sold < 0:
        raise ApiError("Quantities cannot be negative")
    if sold > prepared:
        raise ApiError("Sold quantity cannot exceed prepared quantity")
    wasted = prepared - sold
    return {
        "prepared": prepared, "sold": sold, "wasted": wasted,
        "waste_pct": round(wasted / prepared * 100, 1) if prepared else 0.0,
        "prep_cost": prep_cost, "price": price, "loss": round(wasted * prep_cost, 2),
        "high_waste": prepared > 0 and wasted / prepared * 100 > HIGH_WASTE_PCT,
    }
