"""Shared helpers: errors, validation, serialisation, time utilities."""
from datetime import datetime, date, time, timedelta
from bson import ObjectId
from flask import request


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message, self.status = message, status


# ---------- serialisation ----------
def serialize(v):
    if isinstance(v, list):
        return [serialize(x) for x in v]
    if isinstance(v, dict):
        return {("id" if k == "_id" else k): serialize(x) for k, x in v.items() if k != "password_hash"}
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, datetime):
        return iso(v)
    return v


def iso(dt):
    """Naive datetimes are server-local time; add the UTC offset so browsers in any timezone parse them correctly."""
    return dt.astimezone().isoformat(timespec="seconds") if dt else None


def oid(s):
    try:
        return ObjectId(str(s))
    except Exception:
        raise ApiError("Invalid id", 400)


# ---------- validation ----------
def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("A JSON body is required")
    return data


def num(d, key, lo=None, hi=None, default=None, cast=float):
    v = d.get(key, default)
    if v is None or v == "":
        raise ApiError(f"'{key}' is required")
    try:
        v = cast(v)
    except (TypeError, ValueError):
        raise ApiError(f"'{key}' must be a number")
    if (lo is not None and v < lo) or (hi is not None and v > hi):
        raise ApiError(f"'{key}' must be between {lo} and {hi}")
    return v


def text(d, key, required=True, maxlen=300, default=""):
    v = d.get(key, default)
    v = "" if v is None else str(v).strip()
    if required and not v:
        raise ApiError(f"'{key}' is required")
    if len(v) > maxlen:
        raise ApiError(f"'{key}' must be at most {maxlen} characters")
    return v


def choice(d, key, options, default=None):
    v = d.get(key, default)
    if v not in options:
        raise ApiError(f"'{key}' must be one of {', '.join(map(str, options))}")
    return v


def qint(name, default, lo=None, hi=None):
    """Integer query-string parameter."""
    try:
        v = int(request.args.get(name, default))
    except (TypeError, ValueError):
        raise ApiError(f"'{name}' must be an integer")
    if lo is not None: v = max(lo, v)
    if hi is not None: v = min(hi, v)
    return v


def parse_date(s, default=None):
    if not s:
        return default or date.today()
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        raise ApiError("Dates must use YYYY-MM-DD")


# ---------- time ----------
MEAL_PERIODS = ["BREAKFAST", "LUNCH", "SNACKS", "DINNER"]


def now():
    return datetime.now().replace(microsecond=0)


def today_str(d=None):
    return (d or date.today()).isoformat()


def day_start(d=None):
    return datetime.combine(d or date.today(), time.min)


def meal_period_of(t):
    h = t.hour
    return "BREAKFAST" if h < 11 else "LUNCH" if h < 16 else "SNACKS" if h < 19 else "DINNER"


def minutes_between(a, b):
    return (b - a).total_seconds() / 60 if a and b else None


def pct_change(before, after):
    """Reduction in % (positive = improvement when lower is better)."""
    return round((before - after) / before * 100, 1) if before else 0.0


def mean(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 2) if xs else 0.0


def last_n_days(n, end=None):
    end = end or date.today()
    return [(end - timedelta(days=i)) for i in range(n - 1, -1, -1)]
