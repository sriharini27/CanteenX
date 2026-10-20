import { useState } from "react";
import useFetch from "../../hooks/useFetch";
import { Waste, Foods, errMsg } from "../../services/api";
import { PageHeader, Card, Kpi, Loading, ErrorBox, Table, Modal, Field, Icon, Badge, ConfirmButton, Spinner, Meter, rupee, toast } from "../../components/ui";
import { ChartCard, Bars, Lines, C } from "../../components/charts";

const iso = (d) => d.toLocaleDateString("en-CA");
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

export default function WasteManagement() {
  const [range, setRange] = useState({ from: daysAgo(7), to: iso(new Date()) });
  const { data, loading, error, reload } = useFetch(() => Waste.list(range), [range.from, range.to]);
  const foods = useFetch(() => Foods.list(), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!form.food_id) return setErr("Choose a dish");
    if (+form.sold > +form.prepared) return setErr("Sold cannot exceed prepared");
    setBusy(true); setErr("");
    try { await Waste.create({ ...form, prepared: +form.prepared, sold: +form.sold }); toast("Waste record saved"); setForm(null); reload(true); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const s = data?.summary;
  const preview = form && form.prepared !== "" ? { w: Math.max(0, form.prepared - form.sold), pct: form.prepared > 0 ? ((form.prepared - form.sold) / form.prepared) * 100 : 0 } : null;
  return (
    <>
      <PageHeader eyebrow="Administrator" title="Waste management" subtitle="Waste = Prepared − Sold · Waste % = Waste ÷ Prepared × 100 · Loss = Waste × preparation cost">
        <input type="date" className="input !w-auto" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <span className="text-ink-500 text-sm">to</span>
        <input type="date" className="input !w-auto" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <button className="btn-accent" onClick={() => { setErr(""); setForm({ food_id: "", date: iso(new Date()), prepared: "", sold: "" }); }}><Icon name="plus" />Record waste</button>
      </PageHeader>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : s && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <Kpi label="Total prepared" value={s.total_prepared} unit="portions" />
            <Kpi label="Total sold" value={s.total_sold} unit="portions" tone="good" />
            <Kpi label="Total waste" value={s.total_wasted} unit="portions" tone="bad" />
            <Kpi label="Waste percentage" value={s.waste_pct} unit="%" tone={s.waste_pct > 15 ? "bad" : "good"} />
            <Kpi label="Estimated loss" value={rupee(s.total_loss)} tone="bad" />
          </div>
          {s.high_waste.length > 0 && (
            <div className="rounded-xl border border-before/30 bg-rose-50 p-4 mb-6 flex gap-3">
              <Icon name="alert" className="w-5 h-5 text-before shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-before">High food wastage detected</div>
                <div className="text-sm text-ink-700 mt-1">{s.high_waste.map((h) => `${h.name} (${h.waste_pct}%: prepared ${h.prepared}, sold ${h.sold}, wasted ${h.wasted})`).join(" · ")}</div>
                <div className="text-xs text-ink-500 mt-1">Items above the {s.threshold_pct}% threshold. Use Demand Prediction to switch them to forecast-based preparation.</div>
              </div>
            </div>
          )}
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <ChartCard title="Waste % by item" subtitle="Red line = high-waste threshold" empty={!s.by_item.length}>
              <Bars data={s.by_item} x="name" unit="%" refY={s.threshold_pct} series={[{ key: "waste_pct", name: "Waste %", color: C.before }]} />
            </ChartCard>
            <ChartCard title="Prepared vs wasted per day" empty={!s.by_day.length}>
              <Lines data={s.by_day} x="date" series={[{ key: "prepared", name: "Prepared", color: C.ink }, { key: "wasted", name: "Wasted", color: C.before }]} />
            </ChartCard>
          </div>
          <Card title="By item" className="mb-6" bodyClass="pb-2">
            <Table rows={s.by_item} rowKey={(r) => r.name} columns={[
              { key: "name", label: "Dish", render: (r) => <span className="font-semibold">{r.name}</span> },
              { key: "prepared", label: "Prepared", align: "right" }, { key: "sold", label: "Sold", align: "right" },
              { key: "wasted", label: "Wasted", align: "right" },
              { key: "waste_pct", label: "Waste %", render: (r) => <div className="w-36"><Meter value={r.waste_pct} tone={r.waste_pct > s.threshold_pct ? "bad" : "good"} label=" " /></div> },
              { key: "loss", label: "Loss", align: "right", render: (r) => rupee(r.loss) },
              { key: "flag", label: "", render: (r) => r.waste_pct > s.threshold_pct ? <Badge status="CANCELLED">High waste</Badge> : <Badge status="SUCCESS">OK</Badge> },
            ]} />
          </Card>
          <Card title="Daily records" bodyClass="pb-2">
            <Table rows={data.records} columns={[
              { key: "date", label: "Date", render: (r) => <span className="num">{r.date}</span> },
              { key: "food_name", label: "Dish" }, { key: "meal_period", label: "Meal period", render: (r) => <span className="text-xs">{r.meal_period}</span> },
              { key: "prepared", label: "Prepared", align: "right" }, { key: "sold", label: "Sold", align: "right" },
              { key: "wasted", label: "Waste", align: "right" }, { key: "waste_pct", label: "Waste %", align: "right", render: (r) => <span className={r.high_waste ? "text-before font-semibold" : ""}>{r.waste_pct}%</span> },
              { key: "loss", label: "Loss", align: "right", render: (r) => rupee(r.loss) },
              { key: "source", label: "Source", render: (r) => <Badge>{r.source}</Badge> },
              { key: "x", label: "", render: (r) => <ConfirmButton className="btn-ghost !p-1.5 text-ink-500" title="Delete record?" message={`${r.food_name} on ${r.date}`} confirmLabel="Delete" danger onConfirm={async () => { await Waste.remove(r.id); reload(true); }}><Icon name="trash" className="w-3.5 h-3.5" /></ConfirmButton> },
            ]} />
          </Card>
        </>
      )}
      <Modal open={!!form} title="Record food waste" onClose={() => setForm(null)}
        footer={<><button className="btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner className="w-4 h-4" />}Save</button></>}>
        {form && (
          <div className="space-y-4">
            <Field label="Dish"><select className="input" value={form.food_id} onChange={(e) => setForm({ ...form, food_id: e.target.value })}><option value="">Select…</option>{(foods.data || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
            <Field label="Date"><input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prepared quantity"><input className="input num" type="number" min="0" value={form.prepared} onChange={(e) => setForm({ ...form, prepared: e.target.value })} /></Field>
              <Field label="Sold quantity"><input className="input num" type="number" min="0" value={form.sold} onChange={(e) => setForm({ ...form, sold: e.target.value })} /></Field>
            </div>
            {preview && <div className="rounded-lg bg-paper/70 px-3 py-2 text-sm num">Waste = {form.prepared} − {form.sold || 0} = <b>{preview.w}</b> portions · {preview.pct.toFixed(1)}%</div>}
            {err && <div className="text-sm text-before">{err}</div>}
          </div>
        )}
      </Modal>
    </>
  );
}
