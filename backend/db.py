"""MongoDB connection (single shared client)."""
from pymongo import MongoClient, ASCENDING, DESCENDING

_db = None


def init_db(cfg):
    global _db
    if cfg.USE_MOCK_DB:
        import mongomock
        client = mongomock.MongoClient()
    else:
        client = MongoClient(cfg.MONGO_URI, serverSelectionTimeoutMS=5000, tz_aware=False)
        client.admin.command("ping")  # fail fast with a clear error if MongoDB is not running
    _db = client[cfg.DB_NAME]
    _create_indexes(_db)
    return _db


def get_db():
    if _db is None:
        raise RuntimeError("Database not initialised")
    return _db


def _create_indexes(db):
    db.users.create_index("username", unique=True)
    db.users.create_index("email", unique=True, sparse=True)       # local + Google accounts share one email
    db.users.create_index("google_id", unique=True, sparse=True)
    db.food_items.create_index("name")
    db.orders.create_index([("created_at", DESCENDING)])
    db.orders.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    db.orders.create_index("status")
    db.order_items.create_index([("date", ASCENDING), ("food_id", ASCENDING)])
    db.demand_records.create_index([("food_id", ASCENDING), ("date", ASCENDING)], unique=True)
    db.waste_records.create_index([("date", DESCENDING)])
    db.waste_records.create_index([("food_id", ASCENDING), ("date", ASCENDING)], unique=True)
    db.payments.create_index("order_id")
    db.rewards.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    db.queue_events.create_index([("at", DESCENDING)])
    db.simulation_runs.create_index([("created_at", DESCENDING)])
