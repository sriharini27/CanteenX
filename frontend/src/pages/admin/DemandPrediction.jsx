import { useEffect, useState } from "react";
import useFetch from "../../hooks/useFetch";
import { Demand } from "../../services/api";
import { PageHeader, Card, Kpi, Loading, ErrorBox, Table, Icon, rupee, toast } from "../../components/ui";
import { ChartCard, Bars, Lines, C } from "../../components/charts";

const BUFFERS = [0, 5, 10, 15, 20];

export default function DemandPrediction() {
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [buffer, setBuffer] = useState(5);
  const [period, setPeriod] = useState("");
  const [sel, setSel] = useState(null);
  const pred = useFetch(() => Demand.prediction({ date, buffer, period: period || undefined }), [date, buffer, period]);
  const peak = useFetch(Demand.peakHours, []);
  const bt = useFetch(() => Demand.backtest({ days: 7, buffer }), [buffer]);
  const trade = useFetch(() => Promise.all(BUFFERS.map((b) => Demand.backtest({ days: 7, buffer: b }))), []);
  const [hist, setHist] = useState([]);

  const items = pred.data?.items || [];
  const item = sel ? items.find((i) => i.food_id === sel) : items[0];
  useEffect(() => { if (item) Demand.history(item.food_id).then(setHist).catch(() => setHist([])); }, [item?.food_id]);

  const t = bt.data?.totals;
  const weights = item ? item.history.slice(-5).map((h, i) => ({ ...h, w: i + 1 })) : [];
  return (
    <>
      <PageHeader eyebrow="Administrator" title="Demand prediction & smart preparation" subtitle="Forecast each dish from historical orders, then prepare forecast + safety buffer instead of habitual batch sizes.">
        <input type="date" className="input !w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="input !w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="">All meal periods</option>{["BREAKFAST", "LUNCH", "SNACKS"].map((p) => <option key={p}>{p}</option>)}
        </select>
        <div className="card px-3 py-1.5 flex items-center gap-2 text-sm"><span className="text-ink-500">Buffer</span>
          <input type="range" min="0" max="30" value={buffer} onChange={(e) => setBuffer(+e.target.value)} className="accent-saffron w-24" /><span className="num font-semibold w-9">{buffer}%</span></div>
        <button className="btn-outline" onClick={async () => { const r = await Demand.rebuild(); toast(`${r.records} demand records rebuilt from orders`); pred.reload(); }}><Icon name="refresh" />Rebuild from orders</button>
      </PageHeader>
      <ErrorBox error={pred.error} onRetry={pred.reload} />
      {pred.loading && !pred.data ? <Loading label="Forecasting…" /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Kpi label="Total forecast" value={pred.data.total_forecast} unit="portions" icon="chart" />
            <Kpi label="Recommended prep" value={pred.data.total_recommended} unit="portions" tone="good" icon="check" hint={`forecast + ${buffer}%`} />
            <Kpi label="Current habitual prep" value={pred.data.total_current} unit="portions" tone="bad" icon="box" hint="avg of last 14 days" />
            <Kpi label="Portions saved / day" value={Math.max(0, pred.data.total_current - pred.data.total_recommended)} tone="good" icon="trash" />
          </div>

          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            <Card title="Method (explainable)" subtitle={pred.data.method}>
              <ol className="text-sm space-y-2 list-decimal list-inside text-ink-700">
                <li><b>Weighted moving average</b> of the last 5 operating days, weights 1…5 (newest heaviest).</li>
                <li><b>Day-of-week index</b> = avg on this weekday ÷ overall avg (0.7–1.3).</li>
                <li><b>Forecast</b> = WMA × index.</li>
                <li><b>Recommended</b> = ⌈forecast × (1 + buffer)⌉.</li>
              </ol>
              {item && (
                <div className="mt-4 rounded-lg bg-paper/70 p-3 text-xs num leading-relaxed">
                  <div className="font-sans font-semibold text-sm mb-1">{item.name}</div>
                  WMA = ({weights.map((h) => `${h.w}×${h.qty}`).join(" + ")}) ÷ {weights.reduce((s, h) => s + h.w, 0)} = {item.wma}<br />
                  Forecast = {item.wma} × {item.dow_factor} = <b>{item.forecast}</b><br />
                  Recommended = ⌈{item.forecast} × {(1 + buffer / 100).toFixed(2)}⌉ = <b className="text-after">{item.recommended}</b>
                </div>
              )}
            </Card>
            <ChartCard title={item ? `${item.name} — daily demand` : "Daily demand"} subtitle="Click a row in the table to change dish">
              <Lines data={hist} x="date" refY={item?.forecast} refLabel="forecast" series={[{ key: "quantity", name: "Sold", color: C.saffron }]} />
            </ChartCard>
            <ChartCard title="Peak hours" subtitle="Average orders per hour (last 14 days)">
              <Bars data={peak.data || []} x="hour" series={[{ key: "avg_orders", name: "Orders / hr", color: C.ink }]} />
            </ChartCard>
          </div>

          <Card title="Forecast & recommended preparation" subtitle="Current strategy (habitual batches) vs optimized strategy (forecast + buffer)" className="mb-6" bodyClass="pb-2">
            <Table rows={items} rowKey={(r) => r.food_id} onRowClick={(r) => setSel(r.food_id)} columns={[
              { key: "name", label: "Dish", render: (r) => <span className={`font-semibold ${item?.food_id === r.food_id ? "text-saffron-600" : ""}`}>{r.name}</span> },
              { key: "history", label: "Last 5 days", render: (r) => <span className="num text-xs text-ink-500">{r.history.slice(-5).map((h) => h.qty).join(", ")}</span> },
              { key: "sma", label: "SMA", align: "right" }, { key: "wma", label: "WMA", align: "right" },
              { key: "dow_factor", label: "Day idx", align: "right" },
              { key: "forecast", label: "Forecast", align: "right", render: (r) => <b>{r.forecast}</b> },
              { key: "current_prep", label: "Current prep", align: "right", render: (r) => <span className="text-before">{r.current_prep ?? "—"}</span> },
              { key: "recommended", label: "Optimized prep", align: "right", render: (r) => <b className="text-after">{r.recommended}</b> },
              { key: "w", label: "Exp. waste (cur → opt)", align: "right", render: (r) => r.expected_waste_current != null ? `${r.expected_waste_current} → ${r.expected_waste_optimized}` : "—" },
              { key: "saving", label: "Saving / day", align: "right", render: (r) => r.saving > 0 ? <span className="text-after">{rupee(r.saving)}</span> : "—" },
            ]} />
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card title="Back-test: last 7 days replayed" subtitle={`What if each day had been prepared with forecast + ${buffer}% (forecast uses only data before that day)?`}>
              {!t ? <Loading /> : (
                <div className="grid grid-cols-2 gap-3">
                  <Kpi label="Waste — current" value={t.waste_before} unit="portions" tone="bad" hint={`${t.waste_rate_before}% of prepared`} />
                  <Kpi label="Waste — optimized" value={t.waste_after} unit="portions" tone="good" hint={`${t.waste_rate_after}% of prepared`} />
                  <Kpi label="Waste reduction" value={t.waste_reduction_pct} unit="%" tone="good" />
                  <Kpi label="Money saved" value={rupee(t.loss_before - t.loss_after)} tone="good" />
                  <Kpi label="Shortage (missed portions)" value={t.shortage} tone="accent" hint="the cost of a smaller buffer" />
                  <Kpi label="Demand fill rate" value={t.fill_rate} unit="%" />
                </div>
              )}
            </Card>
            <ChartCard title="Buffer trade-off" subtitle="Higher buffer → fewer shortages but more waste (7-day back-test)" empty={!trade.data}>
              <Bars data={(trade.data || []).map((r) => ({ buffer: `${r.buffer_pct}%`, waste: r.totals.waste_after, shortage: r.totals.shortage }))} x="buffer"
                series={[{ key: "waste", name: "Waste", color: C.before }, { key: "shortage", name: "Shortage", color: C.sky }]} />
            </ChartCard>
          </div>
        </>
      )}
    </>
  );
}
