import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import useFetch from "../../hooks/useFetch";
import { Sim, errMsg } from "../../services/api";
import { PageHeader, Card, Kpi, Loading, ErrorBox, Table, Field, Icon, Spinner, Meter, ConfirmButton, fmtDateTime, rupee, toast } from "../../components/ui";
import { ChartCard, Bars, Lines, C, SERIES } from "../../components/charts";

const TABS = [["single", "Queue simulation"], ["compare", "Counter comparison"], ["optimize", "Before vs after"]];
const FIELDS = [
  ["students", "Number of students", 1], ["duration", "Simulation duration (min)", 1], ["counters", "Service counters (c)", 1],
  ["service_time", "Avg service time (min)", 0.1], ["arrival_rate", "Arrival rate (students/min)", 0.05], ["peak_rate", "Peak-hour arrival rate (/min)", 0.05],
  ["peak_start", "Peak starts at (min)", 5], ["peak_end", "Peak ends at (min)", 5], ["prep_stations", "Preparation stations", 1],
  ["prep_time", "Avg prep/hand-over time (min)", 0.5], ["target_wait", "Target wait (min)", 1], ["seed", "Random seed", 1], ["replications", "Replications", 1],
];

const LIVE_KEYS = ["students", "arrival_rate", "peak_rate", "peak_start", "service_time", "counters", "prep_time"];

/** Scenario inputs. presets = { mode, choose(mode), liveAvailable } */
function ParamForm({ p, setP, presets, hide = [] }) {
  const live = presets.mode === "live";
  return (
    <Card title="Scenario inputs" subtitle="Same seed ⇒ identical students, so configurations are compared fairly (common random numbers)"
      action={
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">Simulation data source</span>
          <div className="flex rounded-lg border border-paper-300 overflow-hidden">
            <button className={`px-3 py-1.5 text-xs font-semibold ${!live ? "bg-ink text-white" : "bg-white hover:bg-paper"}`} onClick={() => presets.choose("manual")}>Manual Parameters</button>
            <button disabled={!presets.liveAvailable} title={presets.liveAvailable ? "" : "Not enough lunch orders in MongoDB yet"}
              className={`px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${live ? "bg-saffron text-white" : "bg-white hover:bg-paper"}`} onClick={() => presets.choose("live")}>Use Live Canteen Data</button>
          </div>
        </div>}>
      {live && p.explain && (
        <div className="rounded-xl border border-saffron/40 bg-saffron-50 p-4 mb-4">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2"><Icon name="info" className="w-4 h-4" />Values derived from MongoDB order data ({p.source}) — review or adjust before running</div>
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-1">
            {LIVE_KEYS.filter((k) => p.explain[k]).map((k) => (
              <div key={k} className="flex gap-2 text-xs py-0.5"><span className="num font-semibold w-20 shrink-0 text-right">{p[k]}</span>
                <span className="text-ink-700"><b>{(FIELDS.find(([f]) => f === k) || [k, k])[1]}</b> — {p.explain[k]}</span></div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {FIELDS.filter(([k]) => !hide.includes(k)).map(([k, label, step]) => (
          <Field key={k} label={label}>
            <input className={`input num ${live && LIVE_KEYS.includes(k) ? "!border-saffron/60 !bg-saffron-50/40" : ""}`} type="number" step={step} value={p[k] ?? ""}
              onChange={(e) => setP({ ...p, [k]: e.target.value === "" ? "" : +e.target.value })} />
          </Field>
        ))}
        <Field label="Time distribution">
          <select className="input" value={p.distribution} onChange={(e) => setP({ ...p, distribution: e.target.value })}>
            <option value="exponential">Exponential (M/M/c)</option><option value="uniform">Uniform ±50%</option><option value="constant">Constant (M/D/c)</option>
          </select>
        </Field>
      </div>
      {!live && <p className="text-xs text-ink-500 mt-3">Manual mode starts from the Phase-21 demo scenario: 100 students, 4-minute service, a lunch rush from minute 30 to 60.</p>}
    </Card>
  );
}

/** Plain-language explanation for evaluators. */
function HowItWorks() {
  const [open, setOpen] = useState(true);
  const stages = [["user", "Student arrivals", "Students arrive at random; more of them during the peak period."],
    ["queue", "Queue", "If every counter is busy, the student waits in line (first come, first served)."],
    ["counter", "Counters", "Each open counter takes the order and payment — this is the service time."],
    ["flame", "Preparation", "Food is plated / handed over at a preparation station."],
    ["check", "Completed", "The student leaves; we record how long they waited."]];
  const terms = [["Arrival rate", "How many students arrive per minute on average (e.g. 0.7 = about 42 per hour)."],
    ["Service time", "Average minutes a counter spends on one student (ordering + paying)."],
    ["Number of counters", "How many counters serve in parallel. More counters = shorter queue, but more staff."],
    ["Preparation stations", "How many places plate / hand over food at the same time (second stage)."],
    ["Peak period", "The rush window (e.g. minutes 30–60) where students arrive at the higher peak rate."],
    ["Target waiting time", "The longest average wait we accept (e.g. 10 min). Used to judge and recommend counters."]];
  return (
    <Card className="mb-6" title="How this simulation works" subtitle="A discrete-event simulation: the computer 'plays out' a lunch break student by student and measures every wait."
      action={<button className="btn-ghost !py-1 text-xs" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</button>}>
      {open && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-stretch gap-2">
            {stages.map(([icon, title, text], i) => (
              <div key={title} className="flex items-center gap-2 flex-1 min-w-[150px]">
                <div className="rounded-xl border border-paper-300 bg-paper/60 p-3 flex-1 h-full">
                  <div className="flex items-center gap-2 font-semibold text-sm"><span className="h-7 w-7 rounded-full bg-ink text-white flex items-center justify-center"><Icon name={icon} className="w-3.5 h-3.5" /></span>{title}</div>
                  <p className="text-[11px] text-ink-500 mt-1.5 leading-snug">{text}</p>
                </div>
                {i < stages.length - 1 && <span className="text-saffron font-bold text-lg">→</span>}
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {terms.map(([t, d]) => <div key={t} className="text-sm"><b>{t}</b><p className="text-xs text-ink-500">{d}</p></div>)}
          </div>
          <p className="text-xs text-ink-500 border-t border-paper-200 pt-3">
            We run the same students through different set-ups (e.g. 2 vs 3 counters) and compare average and maximum waiting time,
            queue length, counter utilization, throughput and service level (% of students served within the target). The M/M/c (Erlang-C)
            formula is shown as a theoretical cross-check.
          </p>
        </div>
      )}
    </Card>
  );
}

export default function Simulation() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "single";
  const defs = useFetch(Sim.defaults, []);
  const [p, setP] = useState(null);
  const [mode, setMode] = useState("manual");
  useEffect(() => { if (defs.data && !p) setP({ ...defs.data.demo }); }, [defs.data]);

  if (defs.loading || !p) return <Loading />;
  const presets = {
    mode, liveAvailable: !!defs.data.from_data,
    choose: (m) => { setMode(m); setP({ ...(m === "live" ? defs.data.from_data : defs.data.demo) }); },
  };
  return (
    <>
      <PageHeader eyebrow="Administrator · SMT core" title="Simulation & optimization" subtitle="Discrete-event simulation of the canteen queue (arrivals → counters → preparation) to test configurations before changing anything in real life." />
      <HowItWorks />
      <div className="flex gap-1 mb-6 border-b border-paper-300 no-print overflow-x-auto">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setParams({ tab: k })} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === k ? "border-saffron text-ink" : "border-transparent text-ink-500 hover:text-ink"}`}>{l}</button>
        ))}
      </div>
      {tab === "single" && <SingleRun p={p} setP={setP} presets={presets} />}
      {tab === "compare" && <Compare p={p} setP={setP} presets={presets} />}
      {tab === "optimize" && <Optimize p={p} setP={setP} presets={presets} />}
    </>
  );
}

/* ---------------- single run ---------------- */
function SingleRun({ p, setP, presets }) {
  const [res, setRes] = useState(null);
  const [prev, setPrev] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const runs = useFetch(() => Sim.runs({ limit: 10 }), []);

  const run = async (override) => {
    setBusy(true); setError("");
    const body = { ...p, ...override };
    try {
      const r = await Sim.run(body);
      if (res) setPrev(res);
      setRes({ ...r.results, params: r.params });
      if (override) setP(body);
      runs.reload(true);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const r = res;
  const delta = (k) => (prev && r ? Math.round(((prev[k] - r[k]) / (prev[k] || 1)) * 1000) / 10 : null);

  return (
    <div className="space-y-6">
      <ParamForm p={p} setP={setP} presets={presets} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-accent !px-6" disabled={busy} onClick={() => run()}>{busy ? <Spinner className="w-4 h-4" /> : <Icon name="play" />}RUN SIMULATION</button>
        {r && <button className="btn-outline" disabled={busy} onClick={() => run({ counters: p.counters + 1 })}><Icon name="plus" />Re-run with {p.counters + 1} counters</button>}
        {r && p.counters > 1 && <button className="btn-outline" disabled={busy} onClick={() => run({ counters: p.counters - 1 })}><Icon name="minus" />Re-run with {p.counters - 1}</button>}
      </div>
      <ErrorBox error={error} />
      {r && (
        <>
          {prev && <div className="rounded-lg bg-paper-200/70 px-4 py-2 text-sm">Compared with the previous run ({prev.params.counters} counters → {r.params.counters} counters): average wait <b className={delta("avg_wait") >= 0 ? "text-after" : "text-before"}>{delta("avg_wait") >= 0 ? "−" : "+"}{Math.abs(delta("avg_wait"))}%</b>, max queue <b className={delta("max_queue_length") >= 0 ? "text-after" : "text-before"}>{delta("max_queue_length") >= 0 ? "−" : "+"}{Math.abs(delta("max_queue_length"))}%</b>.</div>}
          <SimKpis r={r} prev={prev} delta={delta} />
          <div className="grid lg:grid-cols-2 gap-6">
            <ChartCard title="Queue over time" subtitle="Students waiting at the counter / for preparation, and being served" height={280}>
              <Lines data={r.timeline} x="t" xLabel="minutes" series={[{ key: "queue", name: "Counter queue", color: C.saffron }, { key: "prep_queue", name: "Prep queue", color: C.violet }, { key: "in_service", name: "In service", color: C.ink }]} />
            </ChartCard>
            <ChartCard title="Students served (cumulative)" subtitle={`Canteen stops serving new arrivals at ${r.params.duration} min`} height={280}>
              <Lines data={r.timeline} x="t" area xLabel="minutes" series={[{ key: "served", name: "Served", color: C.after }]} />
            </ChartCard>
            <ChartCard title="Waiting-time distribution" subtitle="Number of students per waiting-time band (min)">
              <Bars data={r.wait_histogram} x="range" series={[{ key: "students", name: "Students", color: C.saffron }]} />
            </ChartCard>
            <Analytical a={r.analytical} r={r} />
          </div>
        </>
      )}
      <Card title="Saved simulation runs" bodyClass="pb-2">
        <Table rows={runs.data || []} empty="No runs saved yet" columns={[
          { key: "created_at", label: "When", render: (x) => fmtDateTime(x.created_at) },
          { key: "type", label: "Type" }, { key: "label", label: "Label" },
          { key: "avg", label: "Avg wait", align: "right", render: (x) => x.results?.avg_wait ?? x.results?.summary?.after?.avg_wait ?? "—" },
          { key: "d", label: "", render: (x) => <ConfirmButton className="btn-ghost !p-1.5 text-ink-500" title="Delete run?" message={x.label} confirmLabel="Delete" danger onConfirm={async () => { await Sim.removeRun(x.id); runs.reload(true); }}><Icon name="trash" className="w-3.5 h-3.5" /></ConfirmButton> },
        ]} />
      </Card>
    </div>
  );
}

function SimKpis({ r }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
      <Kpi label="Total students" value={r.total_students} icon="user" />
      <Kpi label="Students served" value={r.students_served} tone="good" icon="check" hint={`by ${r.params.duration} min`} />
      <Kpi label="Students remaining" value={r.students_remaining} tone={r.students_remaining ? "bad" : "good"} icon="queue" />
      <Kpi label="Average waiting time" value={r.avg_wait} unit="min" tone={r.avg_wait > r.params.target_wait ? "bad" : "good"} icon="clock" hint={`counter ${r.avg_counter_wait} + prep ${r.avg_prep_wait}`} />
      <Kpi label="Maximum waiting time" value={r.max_wait} unit="min" icon="clock" hint={`90th pct ${r.p90_wait} min`} />
      <Kpi label="Service level" value={r.service_level} unit="%" icon="check" hint={`waited ≤ ${r.params.target_wait} min`} />
      <Kpi label="Average queue length" value={r.avg_queue_length} icon="queue" />
      <Kpi label="Maximum queue length" value={r.max_queue_length} tone="accent" icon="queue" />
      <Kpi label="Counter utilization" value={r.counter_utilization} unit="%" icon="counter" />
      <Kpi label="Prep-station utilization" value={r.service_utilization} unit="%" icon="flame" />
      <Kpi label="Throughput" value={r.throughput_per_hr} unit="/hr" icon="chart" />
      <Kpi label="Time in system" value={r.avg_time_in_system} unit="min" icon="clock" hint={`last student leaves at ${r.makespan} min`} />
    </div>
  );
}

function Analytical({ a, r }) {
  return (
    <Card title="Analytical cross-check (M/M/c, Erlang-C)" subtitle="Steady-state theory for the counter stage using the average arrival rate">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Kpi label={<span className="normal-case">λ arrivals / min</span>} value={a.lambda_per_min} /><Kpi label={<span className="normal-case">μ per counter / min</span>} value={a.mu_per_min} />
        <Kpi label={<span className="normal-case">ρ = λ / (c·μ)</span>} value={a.rho} tone={a.stable ? "good" : "bad"} />
      </div>
      <Meter label="Average utilization ρ" value={Math.min(100, a.rho * 100)} tone={a.rho >= 1 ? "bad" : a.rho > 0.85 ? "accent" : "good"} />
      <div className="mt-2"><Meter label="Peak-period utilization" value={Math.min(100, a.peak_rho * 100)} tone={a.peak_rho >= 1 ? "bad" : "accent"} /></div>
      <p className="text-sm mt-4 text-ink-700">
        {a.stable
          ? <>Theory predicts an average counter wait of <b className="num">{a.wq_min} min</b> (P(wait) = {a.prob_wait}, Lq = {a.lq}); simulation measured <b className="num">{r.avg_counter_wait} min</b>. Differences come from the lunch peak and finite run length, which steady-state formulas ignore.</>
          : <>ρ ≥ 1: arrivals exceed service capacity, so the theoretical queue grows without limit. The simulation shows how bad it gets in a finite lunch break — add counters or cut service time.</>}
        {a.peak_rho >= 1 && a.stable && <> During the peak ρ = {a.peak_rho} &gt; 1, so a temporary queue builds up.</>}
      </p>
    </Card>
  );
}

/* ---------------- counter comparison ---------------- */
function Compare({ p, setP, presets }) {
  const [opts, setOpts] = useState([1, 2, 3, 4, 5, 6]);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    setBusy(true); setError("");
    try { setRes(await Sim.compare({ ...p, counter_options: opts, baseline: p.counters })); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const rows = res?.results.rows || [];
  // align every configuration's queue timeline on the longest run
  const longest = rows.reduce((a, r) => (r.timeline.length > (a?.timeline.length || 0) ? r : a), null);
  const tl = longest ? longest.timeline.map((pt) => ({ t: pt.t, ...Object.fromEntries(rows.map((r) => [`c${r.counters}`, (r.timeline.find((x) => x.t >= pt.t) || { queue: 0 }).queue])) })) : [];

  return (
    <div className="space-y-6">
      <ParamForm p={p} setP={setP} presets={presets} hide={["counters"]} />
      <Card title="Counter configurations to test">
        <div className="flex flex-wrap items-center gap-3">
          {[1, 2, 3, 4, 5, 6].map((c) => (
            <label key={c} className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-semibold cursor-pointer ${opts.includes(c) ? "border-saffron bg-saffron-50" : "border-paper-300"}`}>
              <input type="checkbox" className="accent-saffron" checked={opts.includes(c)} onChange={(e) => setOpts(e.target.checked ? [...opts, c].sort() : opts.filter((x) => x !== c))} />{c} counter{c > 1 && "s"}
            </label>
          ))}
          <Field label="Baseline (current)"><select className="input !w-auto" value={p.counters} onChange={(e) => setP({ ...p, counters: +e.target.value })}>{opts.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <button className="btn-accent ml-auto" disabled={busy || !opts.length} onClick={run}>{busy ? <Spinner className="w-4 h-4" /> : <Icon name="play" />}Compare</button>
        </div>
      </Card>
      <ErrorBox error={error} />
      {res && (
        <>
          <div className="rounded-xl bg-ink text-white p-4 flex flex-wrap items-center gap-4">
            <Icon name="check" className="w-6 h-6 text-saffron" />
            <div className="flex-1">
              <div className="text-lg font-semibold">{res.recommendation?.met ? <>Recommendation: <span className="text-saffron">Activate {res.recommended} counter{res.recommended > 1 ? "s" : ""}.</span></> : <span className="text-saffron">Target not reachable with the tested counters</span>}</div>
              <div className="text-sm text-ink-300 mt-0.5">{res.recommendation?.reason}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs num">
                {rows.map((r) => <span key={r.counters} className={r.counters === res.recommended ? "text-saffron font-semibold" : "text-ink-300"}>{r.counters} counter{r.counters > 1 ? "s" : ""} → {r.avg_wait} min</span>)}
              </div>
            </div>
          </div>
          <Card title="Results by number of counters" subtitle={`Reductions are relative to the baseline of ${res.results.baseline} counters`} bodyClass="pb-2">
            <Table rows={rows} rowKey={(r) => r.counters} columns={[
              { key: "counters", label: "Counters", render: (r) => <b className="num">{r.counters}{r.counters === res.results.baseline && <span className="text-xs text-ink-500 font-sans"> (baseline)</span>}</b> },
              { key: "avg_wait", label: "Avg wait", align: "right" }, { key: "max_wait", label: "Max wait", align: "right" },
              { key: "max_queue_length", label: "Max queue", align: "right" }, { key: "students_served", label: "Served", align: "right" },
              { key: "service_level", label: "Service level %", align: "right" },
              { key: "counter_utilization", label: "Utilization %", align: "right" }, { key: "rho", label: <span className="normal-case">ρ</span>, align: "right" },
              { key: "throughput_per_hr", label: "Throughput/hr", align: "right" },
              { key: "wait_reduction_pct", label: "Wait ↓", align: "right", render: (r) => <Pct v={r.wait_reduction_pct} /> },
              { key: "queue_reduction_pct", label: "Queue ↓", align: "right", render: (r) => <Pct v={r.queue_reduction_pct} /> },
              { key: "efficiency_gain_pct", label: "Efficiency ↑", align: "right", render: (r) => <Pct v={r.efficiency_gain_pct} /> },
            ]} />
          </Card>
          <div className="grid lg:grid-cols-3 gap-6">
            <ChartCard title="Average & max waiting time"><Bars data={rows.map((r) => ({ c: `${r.counters}`, avg: r.avg_wait, max: r.max_wait }))} x="c" refY={p.target_wait} series={[{ key: "avg", name: "Avg wait", color: C.saffron }, { key: "max", name: "Max wait", color: C.ink }]} /></ChartCard>
            <ChartCard title="Max queue length"><Bars data={rows.map((r) => ({ c: `${r.counters}`, q: r.max_queue_length }))} x="c" series={[{ key: "q", name: "Max queue", color: C.sky }]} /></ChartCard>
            <ChartCard title="Counter utilization %"><Bars data={rows.map((r) => ({ c: `${r.counters}`, u: r.counter_utilization }))} x="c" unit="%" series={[{ key: "u", name: "Utilization", color: C.after }]} /></ChartCard>
          </div>
          <ChartCard title="Queue length over time by configuration" height={300}>
            <Lines data={tl} x="t" xLabel="minutes" series={rows.map((r, i) => ({ key: `c${r.counters}`, name: `${r.counters} counter${r.counters > 1 ? "s" : ""}`, color: SERIES[i] }))} />
          </ChartCard>
        </>
      )}
    </div>
  );
}
const Pct = ({ v }) => <span className={v > 0 ? "text-after font-semibold" : v < 0 ? "text-before" : "text-ink-500"}>{v > 0 ? "+" : ""}{v}%</span>;

/* ---------------- before vs after ---------------- */
function Optimize({ p, setP, presets }) {
  const [cfg, setCfg] = useState({ before_counters: 2, after_counters: 3, buffer_pct: 5, days: 7 });
  const latest = useFetch(Sim.latest, []);
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (latest.data && !run) setRun(latest.data); }, [latest.data]);

  const go = async () => {
    setBusy(true); setError("");
    try { setRun(await Sim.beforeAfter({ ...cfg, sim: p })); toast("Before/after comparison saved"); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const s = run?.results?.summary;
  return (
    <div className="space-y-6">
      <ParamForm p={p} setP={setP} presets={presets} hide={["counters"]} />
      <Card title="Optimization settings" subtitle="Queue: simulate both counter configurations on identical students. Waste: replay real waste records with forecast-based preparation.">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <Field label="Counters before"><input className="input num" type="number" min="1" value={cfg.before_counters} onChange={(e) => setCfg({ ...cfg, before_counters: +e.target.value })} /></Field>
          <Field label="Counters after" hint="'auto' = smallest meeting target">
            <select className="input" value={cfg.after_counters} onChange={(e) => setCfg({ ...cfg, after_counters: e.target.value === "auto" ? "auto" : +e.target.value })}>
              <option value="auto">auto</option>{[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Safety buffer %"><input className="input num" type="number" min="0" value={cfg.buffer_pct} onChange={(e) => setCfg({ ...cfg, buffer_pct: +e.target.value })} /></Field>
          <Field label="Waste history (days)"><input className="input num" type="number" min="1" value={cfg.days} onChange={(e) => setCfg({ ...cfg, days: +e.target.value })} /></Field>
          <button className="btn-accent" disabled={busy} onClick={go}>{busy ? <Spinner className="w-4 h-4" /> : <Icon name="play" />}Run comparison</button>
        </div>
      </Card>
      <ErrorBox error={error} />
      {!s ? (latest.loading ? <Loading /> : <div className="card p-8 text-center text-sm text-ink-500">Run the comparison to see the measurable improvement.</div>) : <BeforeAfter run={run} />}
    </div>
  );
}

function BeforeAfter({ run }) {
  const { summary: s, timeline, waste_items, recommended_counters } = run.results;
  const b = s.before, a = s.after, imp = s.improvements;
  const ROWS = [["Counters", "counters", ""], ["Average waiting time", "avg_wait", "min"], ["Maximum waiting time", "max_wait", "min"], ["Maximum queue", "max_queue", "students"], ["Throughput", "throughput_per_hr", "/hr"], ["Service level (≤ target)", "service_level", "%"], ["Food prepared", "food_prepared", "portions"], ["Food waste", "food_waste", "portions"], ["Waste rate", "waste_rate", "%"], ["Waste cost", "waste_loss", "₹"]];
  return (
    <>
      <div className="text-xs text-ink-500">{run.label} · saved {fmtDateTime(run.created_at)} · recommended counters for target: <b>{recommended_counters}</b></div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        {[["Waiting time reduction", imp.wait_reduction_pct, `${b.avg_wait} → ${a.avg_wait} min`],
          ["Food waste reduction", imp.waste_reduction_pct, `${b.food_waste} → ${a.food_waste} portions`],
          ["Queue reduction", imp.queue_reduction_pct, `max ${b.max_queue} → ${a.max_queue}`],
          ["Service efficiency improvement", imp.efficiency_gain_pct, `${b.throughput_per_hr} → ${a.throughput_per_hr} students/hr`]].map(([l, v, h]) => (
          <div key={l} className="card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{l}</div>
            <div className={`num text-4xl font-semibold mt-1 ${v >= 0 ? "text-after" : "text-before"}`}>{v}%</div>
            <div className="text-xs text-ink-500 mt-1 num">{h}</div>
            <div className="mt-3"><Meter value={Math.min(100, Math.abs(v))} tone={v >= 0 ? "good" : "bad"} /></div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        {[["Before optimization", b, "before"], ["After optimization", a, "after"]].map(([t, v, tone]) => (
          <div key={t} className={`card overflow-hidden border-t-4 ${tone === "before" ? "border-t-before" : "border-t-after"}`}>
            <div className={`px-5 py-3 font-display font-semibold ${tone === "before" ? "text-before" : "text-after"}`}>{t}</div>
            <div className="px-5 pb-4 divide-y divide-paper-200">
              {ROWS.map(([l, k, u]) => <div key={k} className="flex justify-between py-2 text-sm"><span className="text-ink-500">{l}</span><span className="num font-semibold">{u === "₹" ? rupee(v[k]) : <>{v[k]} <span className="text-xs font-sans text-ink-500">{u}</span></>}</span></div>)}
            </div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="Before vs after — key metrics">
          <Bars data={[{ m: "Avg wait", before: b.avg_wait, after: a.avg_wait }, { m: "Max wait", before: b.max_wait, after: a.max_wait }, { m: "Max queue", before: b.max_queue, after: a.max_queue }, { m: "Waste %", before: b.waste_rate, after: a.waste_rate }]} x="m"
            series={[{ key: "before", name: "Before", color: C.before }, { key: "after", name: "After", color: C.after }]} />
        </ChartCard>
        <ChartCard title="Queue length over time" subtitle="Same students, different counter configuration">
          <Lines data={timeline} x="t" xLabel="minutes" series={[{ key: "before", name: `${b.counters} counters`, color: C.before }, { key: "after", name: `${a.counters} counters`, color: C.after }]} />
        </ChartCard>
      </div>
      <ChartCard title="Food waste by dish — current vs forecast-based preparation" subtitle={`Back-test over ${run.params.days} days with ${run.params.buffer_pct}% buffer · shortage ${imp.shortage_portions} portions · fill rate ${imp.fill_rate}% · money saved ${rupee(imp.money_saved)}`} height={300}>
        <Bars data={waste_items} x="name" series={[{ key: "waste_before", name: "Waste now", color: C.before }, { key: "waste_after", name: "Waste optimized", color: C.after }]} />
      </ChartCard>
    </>
  );
}
