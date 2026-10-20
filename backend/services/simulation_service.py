"""Discrete-event queue simulation of the canteen (two-stage tandem queue, FIFO).

Stage 1  service counters  (c servers)  - order + pay, mean `service_time`
Stage 2  preparation stations (p servers) - plate / hand over, mean `prep_time` (0 disables stage 2)

Events per student: ARRIVAL -> COUNTER START -> COUNTER END (= PREP ARRIVAL) -> PREP START -> DEPARTURE.
Arrivals follow a non-homogeneous Poisson process (normal rate, higher rate inside the peak window)
generated with Lewis-Shedler thinning. With FIFO and identical servers each event time follows from
    start = max(arrival, earliest free server) ; end = start + service
which is exactly what an event-list simulation produces, but easy to explain.

Common random numbers: arrival times and service times come from separate seeded streams, so
running the same scenario with 2 vs 3 counters uses *identical* students -> a fair comparison.
"""
import heapq, math, random
from utils.helpers import mean, pct_change


def _arrivals(p, rng):
    lam_max = max(p["arrival_rate"], p["peak_rate"])
    t, out = 0.0, []
    while len(out) < p["students"]:
        t += rng.expovariate(lam_max)
        if t > p["duration"]:
            break
        rate = p["peak_rate"] if p["peak_start"] <= t < p["peak_end"] else p["arrival_rate"]
        if rng.random() <= rate / lam_max:        # thinning: accept with probability rate(t)/lam_max
            out.append(t)
    return out


def _draw(rng, m, dist):
    if m <= 0: return 0.0
    if dist == "constant": return m
    if dist == "uniform": return rng.uniform(0.5 * m, 1.5 * m)
    return rng.expovariate(1 / m)


def _fifo(ready_times, services, servers):
    """Multi-server FIFO: returns (start, end) for each job, jobs given in arrival order."""
    free = [0.0] * servers
    heapq.heapify(free)
    out = []
    for arr, s in zip(ready_times, services):
        start = max(arr, heapq.heappop(free))
        heapq.heappush(free, start + s)
        out.append((start, start + s))
    return out


def _time_avg(events, horizon):
    """Time-weighted average and max of a step function given (+1/-1) events."""
    events.sort(key=lambda e: (e[0], e[1]))
    area = cur = mx = 0
    last = 0.0
    for t, d in events:
        area += cur * (t - last)
        cur += d; mx = max(mx, cur); last = t
    return (area / horizon if horizon else 0.0), mx


def simulate_once(p):
    rng_a, rng_s, rng_p = random.Random(p["seed"]), random.Random(p["seed"] + 1), random.Random(p["seed"] + 2)
    arr = _arrivals(p, rng_a)
    n = len(arr)
    if n == 0:
        return {"total_students": 0, "students_served": 0, "students_remaining": 0, "timeline": []}
    s1 = [_draw(rng_s, p["service_time"], p["distribution"]) for _ in range(p["students"])][:n]
    s2 = [_draw(rng_p, p["prep_time"], p["distribution"]) for _ in range(p["students"])][:n]

    st1 = _fifo(arr, s1, p["counters"])                                   # stage 1
    order2 = sorted(range(n), key=lambda i: st1[i][1])                    # prep queue in order of counter exit
    res2 = _fifo([st1[i][1] for i in order2], [s2[i] for i in order2], p["prep_stations"])
    st2 = [None] * n
    for k, i in enumerate(order2): st2[i] = res2[k]

    w1 = [st1[i][0] - arr[i] for i in range(n)]
    w2 = [st2[i][0] - st1[i][1] for i in range(n)]
    wait = [a + b for a, b in zip(w1, w2)]
    depart = [st2[i][1] for i in range(n)]
    makespan = max(depart)

    q1 = [(arr[i], 1) for i in range(n)] + [(st1[i][0], -1) for i in range(n)]
    q2 = [(st1[i][1], 1) for i in range(n)] + [(st2[i][0], -1) for i in range(n)]
    avg_q1, max_q1 = _time_avg(list(q1), makespan)
    avg_q2, max_q2 = _time_avg(list(q2), makespan)

    served = sum(1 for d in depart if d <= p["duration"])
    span = makespan - arr[0]
    # timeline sampled every `step` minutes for charts
    step = max(1, math.ceil(makespan / 150))
    timeline = []
    for t in range(0, int(makespan) + step, step):
        timeline.append({
            "t": t,
            "queue": sum(1 for i in range(n) if arr[i] <= t < st1[i][0]),
            "prep_queue": sum(1 for i in range(n) if st1[i][1] <= t < st2[i][0]),
            "in_service": sum(1 for i in range(n) if st1[i][0] <= t < st1[i][1]),
            "served": sum(1 for d in depart if d <= t),
        })
    buckets = [(0, 2), (2, 5), (5, 10), (10, 15), (15, 20), (20, 30), (30, 45), (45, 10**9)]
    hist = [{"range": f"{a}-{b}" if b < 10**9 else f"{a}+", "students": sum(1 for w in wait if a <= w < b)} for a, b in buckets]
    sw = sorted(wait)
    return {
        "total_students": n, "students_served": served, "students_remaining": n - served,
        "avg_wait": round(mean(wait), 2), "max_wait": round(max(wait), 2),
        "p90_wait": round(sw[int(0.9 * (n - 1))], 2),
        "avg_counter_wait": round(mean(w1), 2), "avg_prep_wait": round(mean(w2), 2),
        "avg_time_in_system": round(mean([depart[i] - arr[i] for i in range(n)]), 2),
        "avg_queue_length": round(avg_q1, 2), "max_queue_length": max_q1,
        "avg_prep_queue": round(avg_q2, 2), "max_prep_queue": max_q2,
        "counter_utilization": round(sum(s1) / (p["counters"] * makespan) * 100, 1),
        "service_utilization": round(sum(s2) / (p["prep_stations"] * makespan) * 100, 1) if p["prep_time"] else 0.0,
        "throughput_per_hr": round(n / span * 60, 1) if span > 0 else 0.0,
        "service_level": round(sum(1 for w in wait if w <= p["target_wait"]) / n * 100, 1),
        "makespan": round(makespan, 1),
        "timeline": timeline, "wait_histogram": hist,
    }


KEYS_TO_AVERAGE = ["total_students", "students_served", "students_remaining", "avg_wait", "max_wait", "p90_wait",
                   "avg_counter_wait", "avg_prep_wait", "avg_time_in_system", "avg_queue_length", "max_queue_length",
                   "avg_prep_queue", "max_prep_queue", "counter_utilization", "service_utilization",
                   "throughput_per_hr", "service_level", "makespan"]


def simulate(p):
    """Run `replications` independent runs (seed, seed+1000, ...) and average the KPIs."""
    runs = [simulate_once({**p, "seed": p["seed"] + 1000 * r}) for r in range(p["replications"])]
    res = dict(runs[0])
    if len(runs) > 1:
        for k in KEYS_TO_AVERAGE:
            res[k] = round(sum(r.get(k, 0) for r in runs) / len(runs), 2)
    res["analytical"] = analytical_mmc(p, res)
    return res


def analytical_mmc(p, res):
    """M/M/c (Erlang-C) cross-check for the counter stage using the average arrival rate."""
    c, mu = p["counters"], 1 / p["service_time"]
    span = res.get("makespan") or p["duration"]
    lam = res["total_students"] / min(p["duration"], span) if res.get("total_students") else p["arrival_rate"]
    a, rho = lam / mu, lam / (c * mu)
    out = {"lambda_per_min": round(lam, 3), "mu_per_min": round(mu, 3), "rho": round(rho, 3),
           "peak_rho": round(p["peak_rate"] / (c * mu), 3), "stable": rho < 1}
    if rho < 1:
        s = sum(a ** k / math.factorial(k) for k in range(c))
        tail = a ** c / math.factorial(c) / (1 - rho)
        pw = tail / (s + tail)
        wq = pw / (c * mu - lam)
        out.update(prob_wait=round(pw, 3), wq_min=round(wq, 2), lq=round(lam * wq, 2))
    return out


def compare_counters(p, counter_options, baseline=None):
    baseline = baseline or p["counters"]
    rows = []
    for c in counter_options:
        r = simulate({**p, "counters": c})
        rows.append({"counters": c, **{k: r[k] for k in KEYS_TO_AVERAGE},
                     "rho": r["analytical"]["rho"], "timeline": r["timeline"]})
    base = next((r for r in rows if r["counters"] == baseline), rows[0])
    for r in rows:
        r.update(improvements(base, r))
    return {"baseline": base["counters"], "rows": rows}


def improvements(before, after):
    return {
        "wait_reduction_pct": pct_change(before["avg_wait"], after["avg_wait"]),
        "queue_reduction_pct": pct_change(before["max_queue_length"], after["max_queue_length"]),
        "efficiency_gain_pct": -pct_change(before["throughput_per_hr"], after["throughput_per_hr"]),
        "service_level_gain_pp": round(after["service_level"] - before["service_level"], 1),
    }


def recommend_counters(p, max_c=6):
    """Smallest number of counters whose simulated average wait meets the target."""
    for c in range(1, max_c + 1):
        if simulate({**p, "counters": c})["avg_wait"] <= p["target_wait"]:
            return c
    return max_c
