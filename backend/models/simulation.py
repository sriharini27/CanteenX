"""simulation_runs collection + parameter validation.
{ _id, type: SINGLE|COMPARE|BEFORE_AFTER, label, params, results, created_by, created_at }"""
from utils.helpers import ApiError, num

# Phase-21 demo scenario: 100 students arrive over a 2.5-hour lunch with a 30-minute rush.
DEFAULT_PARAMS = {
    "students": 100, "duration": 150, "counters": 2, "service_time": 4.0,
    "arrival_rate": 0.7, "peak_rate": 1.4, "peak_start": 30, "peak_end": 60,
    "prep_stations": 4, "prep_time": 3.0, "distribution": "exponential",
    "target_wait": 10, "seed": 42, "replications": 1,
}


def validate_params(d):
    d = {**DEFAULT_PARAMS, **(d or {})}
    p = {
        "students": num(d, "students", 1, 2000, cast=int),
        "duration": num(d, "duration", 10, 720, cast=int),
        "counters": num(d, "counters", 1, 12, cast=int),
        "service_time": num(d, "service_time", 0.2, 30),
        "arrival_rate": num(d, "arrival_rate", 0.01, 20),
        "peak_rate": num(d, "peak_rate", 0, 30),
        "peak_start": num(d, "peak_start", 0, 720),
        "peak_end": num(d, "peak_end", 0, 720),
        "prep_stations": num(d, "prep_stations", 1, 20, cast=int),
        "prep_time": num(d, "prep_time", 0, 30),
        "target_wait": num(d, "target_wait", 1, 120),
        "seed": num(d, "seed", 0, 10**9, cast=int),
        "replications": num(d, "replications", 1, 20, cast=int),
        "distribution": d.get("distribution") or "exponential",
    }
    if p["distribution"] not in ("exponential", "constant", "uniform"):
        raise ApiError("distribution must be exponential, constant or uniform")
    if p["peak_end"] < p["peak_start"]:
        raise ApiError("peak_end must be after peak_start")
    return p
