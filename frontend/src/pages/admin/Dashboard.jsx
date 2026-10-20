import { Link } from "react-router-dom";
import { ResponsiveContainer } from "recharts";
import useFetch from "../../hooks/useFetch";
import { Admin, Sim } from "../../services/api";
import { PageHeader, Kpi, Card, Loading, ErrorBox, Icon, rupee, toast } from "../../components/ui";
import { ChartCard, Bars, Lines, C } from "../../components/charts";

export default function AdminDashboard() {
  const { data, loading, error, reload } = useFetch(Admin.dashboard, [], { interval: 30000 });
  if (loading && !data) return <Loading label="Crunching today's numbers…" />;
  if (!data) return <ErrorBox error={error} onRetry={reload} />;
  const k = data.kpis, ch = data.charts;
  const runOpt = async () => { await Sim.beforeAfter({ before_counters: 2, after_counters: 3 }); toast("Optimization comparison generated"); reload(true); };

  return (
    <>
      <PageHeader eyebrow="Administrator" title="Operations dashboard" subtitle="Live orders, queue and waste — every number is computed from MongoDB order data and simulation runs.">
        <button className="btn-outline" onClick={() => reload()}><Icon name="refresh" />Refresh</button>
        <Link to="/admin/menu" className="btn-primary"><Icon name="menu" />Manage Menu</Link>
        <Link to="/admin/simulation" className="btn-accent"><Icon name="sim" />Run simulation</Link>
      </PageHeader>
      <ErrorBox error={error} />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
        <Kpi label="Today's orders" value={k.orders_today} icon="orders" />
        <Kpi label="Today's revenue" value={rupee(k.revenue_today)} icon="cash" />
        <Kpi label="Pending orders" value={k.pending_orders} tone="accent" icon="clock" hint={`${k.preparing} preparing`} />
        <Kpi label="Completed" value={k.completed_today} tone="good" icon="check" />
        <Kpi label="Current queue" value={k.current_queue} icon="queue" hint={k.status} />
        <Kpi label="Active counters" value={k.active_counters} icon="counter" hint={`${k.utilization_pct}% utilised`} />
        <Kpi label="Avg waiting time" value={k.avg_wait_min} unit="min" tone={k.avg_wait_min > 10 ? "bad" : "good"} icon="clock" />
        <Kpi label="Max waiting time" value={k.max_wait_min} unit="min" icon="clock" />
        <Kpi label="Max queue today" value={k.max_queue_today} icon="queue" />
        <Kpi label="Food waste (7 d)" value={k.food_waste_7d} unit="portions" tone="bad" icon="trash" hint={`${rupee(k.loss_7d)} lost`} />
        <Kpi label="Waste percentage" value={k.waste_pct_7d} unit="%" tone={k.waste_pct_7d > 15 ? "bad" : "good"} icon="trash" />
        <Kpi label="Popular food" value={<span className="text-base font-sans font-semibold">{k.popular_food}</span>} icon="flame" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard title="1 · Orders by hour" subtitle="Today vs 7-day average — reveals the lunch peak" empty={!ch.orders_by_hour.length}>
          <Bars data={ch.orders_by_hour} x="hour" series={[{ key: "today", name: "Today", color: C.saffron }, { key: "avg_7d", name: "7-day avg", color: C.ink }]} />
        </ChartCard>
        <ChartCard title="2 · Queue length by time" subtitle="Orders placed but not yet ready (today, 15-min samples)" empty={!ch.queue_timeline.length}>
          <Lines data={ch.queue_timeline} x="time" area series={[{ key: "queue", name: "Queue", color: C.saffron }]} />
        </ChartCard>
        <ChartCard title="3 · Average waiting time" subtitle="Actual order-to-ready time per day (min)">
          <Lines data={ch.wait_by_day} x="date" refY={10} refLabel="target" series={[{ key: "avg_wait", name: "Average", color: C.saffron }, { key: "max_wait", name: "Maximum", color: C.muted }]} />
        </ChartCard>
        <ChartCard title="4 · Food demand" subtitle="Last-7-day average vs today's forecast and recommended prep">
          <Bars data={ch.demand} x="name" series={[{ key: "last_avg", name: "7-day avg", color: C.muted }, { key: "forecast", name: "Forecast", color: C.ink }, { key: "recommended", name: "Recommended", color: C.after }]} />
        </ChartCard>
        <ChartCard title="5 · Food waste by item" subtitle="Waste % over the last 7 days — red line marks the 20 % alarm" empty={!ch.waste_by_item.length}>
          <Bars data={ch.waste_by_item} x="name" refY={20} unit="%" series={[{ key: "waste_pct", name: "Waste %", color: C.before }]} />
        </ChartCard>
        <ChartCard title="7 · Counter utilization" subtitle="ρ = λ·s / c per hour today (arrivals × avg service ÷ 60·counters)">
          <Bars data={ch.utilization} x="hour" unit="%" refY={85} series={[{ key: "utilization", name: "Utilization %", color: C.sky }]} />
        </ChartCard>
      </div>

      {data.waste_optimization && <WasteOptimization w={data.waste_optimization} />}

      <Card className="mt-6" title="6 · Before vs after optimization" subtitle="Latest saved comparison (simulation + preparation back-test)"
        action={<Link to="/admin/simulation?tab=optimize" className="btn-outline text-xs">Open optimizer</Link>}>
        {ch.before_after ? <BeforeAfterMini s={ch.before_after} /> : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-ink-500">No comparison saved yet. Generate one with the Phase-21 demo scenario (2 → 3 counters, 5 % buffer).</p>
            <button className="btn-accent" onClick={runOpt}><Icon name="play" />Generate now</button>
          </div>
        )}
      </Card>
    </>
  );
}

export function BeforeAfterMini({ s }) {
  const rows = [["Counters", "counters", ""], ["Avg wait", "avg_wait", "min"], ["Max queue", "max_queue", ""], ["Food waste", "food_waste", "portions"], ["Waste rate", "waste_rate", "%"]];
  const data = [{ m: "Avg wait (min)", before: s.before.avg_wait, after: s.after.avg_wait }, { m: "Max queue", before: s.before.max_queue, after: s.after.max_queue }, { m: "Waste rate %", before: s.before.waste_rate, after: s.after.waste_rate }];
  return (
    <div className="grid lg:grid-cols-[1fr_1fr_1.2fr] gap-5 items-center">
      <div className="grid grid-cols-2 gap-3 lg:col-span-2">
        {[["Before", s.before, "before"], ["After", s.after, "after"]].map(([t, v, tone]) => (
          <div key={t} className={`rounded-xl border-2 p-4 ${tone === "before" ? "border-before/30 bg-rose-50/40" : "border-after/30 bg-emerald-50/40"}`}>
            <div className={`text-xs font-bold uppercase tracking-wider ${tone === "before" ? "text-before" : "text-after"}`}>{t} optimization</div>
            {rows.map(([l, key, u]) => <div key={key} className="flex justify-between text-sm py-1"><span className="text-ink-500">{l}</span><span className="num font-semibold">{v[key]} <span className="text-xs text-ink-500 font-sans">{u}</span></span></div>)}
          </div>
        ))}
        <div className="col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Wait reduction" value={s.improvements.wait_reduction_pct} unit="%" tone="good" />
          <Kpi label="Queue reduction" value={s.improvements.queue_reduction_pct} unit="%" tone="good" />
          <Kpi label="Waste reduction" value={s.improvements.waste_reduction_pct} unit="%" tone="good" />
          <Kpi label="Efficiency gain" value={s.improvements.efficiency_gain_pct} unit="%" tone="good" />
        </div>
      </div>
      <div className="h-64">
        <ChartInline data={data} />
      </div>
    </div>
  );
}

const ChartInline = ({ data }) => (
  <ResponsiveContainer width="100%" height="100%">
    <Bars data={data} x="m" series={[{ key: "before", name: "Before", color: C.before }, { key: "after", name: "After", color: C.after }]} />
  </ResponsiveContainer>
);

/** Food-waste optimisation: forecast-based preparation replayed on the last 7 days of real waste records. */
function WasteOptimization({ w }) {
  return (
    <Card className="mt-6" title="Food waste optimization" subtitle={`Smart preparation = ${w.method}, back-tested on the last ${w.days} days of waste records`}
      action={<Link to="/admin/demand" className="btn-outline text-xs">Open demand prediction</Link>}>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 items-center">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Kpi label="Waste — current prep" value={w.waste_before} unit="portions" tone="bad" hint={`${w.waste_rate_before}% of prepared`} />
          <Kpi label="Waste — smart prep" value={w.waste_after} unit="portions" tone="good" hint={`${w.waste_rate_after}% of prepared`} />
          <Kpi label="Waste reduction" value={w.waste_reduction_pct} unit="%" tone="good" />
          <Kpi label="Money saved" value={rupee(w.loss_before - w.loss_after)} tone="good" hint={`over ${w.days} days`} />
          <Kpi label="Portions prepared" value={`${w.prepared} → ${w.rec}`} hint="current → recommended" />
          <Kpi label="Demand fill rate" value={w.fill_rate} unit="%" hint={`${w.shortage} portions short`} />
        </div>
        <ol className="text-sm text-ink-700 space-y-2 list-decimal list-inside rounded-xl bg-paper/60 p-4">
          <li><b>Forecast</b> each dish: weighted moving average of the last 5 days × day-of-week index.</li>
          <li><b>Recommend</b> preparation = forecast + {w.buffer_pct}% safety buffer.</li>
          <li><b>Back-test</b>: replay past days — waste = prepared − sold, shortage = sold − prepared.</li>
          <li><b>Compare</b> with what the canteen actually cooked → waste reduction and money saved.</li>
        </ol>
      </div>
    </Card>
  );
}
