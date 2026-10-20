import { useState } from "react";
import useFetch from "../../hooks/useFetch";
import { Admin } from "../../services/api";
import { PageHeader, Card, Loading, ErrorBox, Table, Icon } from "../../components/ui";
import { ChartCard, Bars, Lines, SERIES } from "../../components/charts";

const REPORTS = [
  ["daily", "Daily Operations", "Orders, revenue, waits and waste for one day"],
  ["weekly", "Weekly Operations", "Day-by-day operations for the period"],
  ["waiting", "Waiting Time", "Wait distribution, by hour, estimate accuracy"],
  ["queue", "Queue Analysis", "Arrivals, utilization and peak queues"],
  ["waste", "Food Waste", "Waste by item and day, high-waste items"],
  ["demand", "Demand Prediction", "Forecast vs recommended vs current prep"],
  ["simulation", "Simulation", "All saved simulation runs"],
  ["before-after", "Before / After Optimization", "Latest measured improvement"],
];
const label = (k) => k.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

function toCsv(table) {
  const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const lines = [table.columns.map(esc).join(","), ...table.rows.map((r) => table.columns.map((c) => esc(r[c])).join(","))];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${table.title.replace(/\W+/g, "_")}.csv` });
  a.click(); URL.revokeObjectURL(url);
}

export default function Reports() {
  const [kind, setKind] = useState("daily");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [days, setDays] = useState(7);
  const { data, loading, error, reload } = useFetch(() => Admin.report(kind, { date, days }), [kind, date, days]);

  return (
    <>
      <PageHeader eyebrow="Administrator" title="Reports" subtitle="Generated live from MongoDB. Print to PDF or export any table as CSV.">
        <input type="date" className="input !w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="input !w-auto" value={days} onChange={(e) => setDays(+e.target.value)}>{[7, 14, 30].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select>
        <button className="btn-primary" onClick={() => window.print()}><Icon name="print" />Print / PDF</button>
      </PageHeader>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2 mb-6 no-print">
        {REPORTS.map(([k, t, d]) => (
          <button key={k} onClick={() => setKind(k)} className={`text-left rounded-xl border-2 px-4 py-3 transition ${kind === k ? "border-saffron bg-saffron-50" : "border-paper-300 bg-white hover:border-ink-300"}`}>
            <div className="font-semibold text-sm">{t}</div><div className="text-[11px] text-ink-500">{d}</div>
          </button>
        ))}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading ? <Loading label="Building report…" /> : data && (
        <div className="space-y-6">
          <div className="card p-5">
            <div className="text-[11px] uppercase tracking-[0.18em] text-saffron-600 font-semibold">CanteenX · SMT report</div>
            <h2 className="text-xl font-bold mt-1">{data.title}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mt-4">
              {Object.entries(data.summary || {}).filter(([, v]) => typeof v !== "object").map(([k, v]) => (
                <div key={k} className="rounded-lg bg-paper/70 px-3 py-2"><div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">{label(k)}</div><div className="num font-semibold text-lg">{String(v)}</div></div>
              ))}
            </div>
          </div>
          {data.charts?.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-6">
              {data.charts.map((c) => (
                <ChartCard key={c.title} title={c.title} empty={!c.data?.length}>
                  {c.type === "line"
                    ? <Lines data={c.data} x={c.x} series={c.series.map((k, i) => ({ key: k, name: label(k), color: SERIES[i] }))} />
                    : <Bars data={c.data} x={c.x} series={c.series.map((k, i) => ({ key: k, name: label(k), color: SERIES[i] }))} />}
                </ChartCard>
              ))}
            </div>
          )}
          {data.tables?.map((t) => (
            <Card key={t.title} title={t.title} bodyClass="pb-2" action={t.rows.length > 0 && <button className="btn-outline !py-1 text-xs no-print" onClick={() => toCsv(t)}><Icon name="download" className="w-3.5 h-3.5" />CSV</button>}>
              <Table rows={t.rows} rowKey={(r, i) => i} columns={t.columns.map((c) => ({ key: c, label: label(c), align: typeof t.rows[0]?.[c] === "number" ? "right" : undefined }))} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
