import { useState } from "react";
import useFetch from "../../hooks/useFetch";
import { Foods, errMsg } from "../../services/api";
import { PageHeader, Card, Kpi, Loading, ErrorBox, Table, ConfirmButton, Icon, Meter, toast } from "../../components/ui";

export default function Inventory() {
  const [buffer, setBuffer] = useState(5);
  const { data, loading, error, reload } = useFetch(() => Foods.inventory({ buffer }), [buffer], { interval: 20000 });
  const [edit, setEdit] = useState({});
  const items = data?.items || [];
  const tracked = items.filter((i) => i.prepared != null);
  const prepared = tracked.reduce((s, i) => s + i.prepared, 0), sold = tracked.reduce((s, i) => s + i.sold, 0);

  const saveStock = async (row) => {
    const v = edit[row.id];
    try { await Foods.setStock(row.id, v === "" ? null : +v); toast(`${row.name}: prepared set to ${v || "untracked"}`); setEdit((e) => ({ ...e, [row.id]: undefined })); reload(true); }
    catch (e) { toast(errMsg(e), "error"); }
  };

  return (
    <>
      <PageHeader eyebrow="Administrator" title="Food inventory" subtitle="Today's prepared stock → sold → remaining. Closing the day turns leftovers into waste records automatically.">
        <div className="flex items-center gap-2 text-sm"><span className="text-ink-500">Safety buffer</span>
          <input type="number" className="input !w-20 num" value={buffer} min={0} max={50} onChange={(e) => setBuffer(+e.target.value || 0)} />%</div>
        <ConfirmButton className="btn-outline" title="Apply recommended quantities?" message={`Sets today's prepared quantity of every dish to the forecast + ${buffer}% buffer.`} onConfirm={async () => { const r = await Foods.applyRecommended(buffer); toast(`${r.updated} items updated`); reload(true); }}>
          <Icon name="chart" />Apply recommended
        </ConfirmButton>
        <ConfirmButton className="btn-accent" title="Close the day?" message="Creates a waste record (prepared − sold) for every tracked dish for today. You can run it again; records are updated, not duplicated." onConfirm={async () => { const r = await Foods.closeDay(); toast(`${r.created} waste records saved`); reload(true); }}>
          <Icon name="check" />Close day → log waste
        </ConfirmButton>
      </PageHeader>
      <ErrorBox error={error} onRetry={reload} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi label="Portions prepared" value={prepared} icon="box" />
        <Kpi label="Sold so far" value={sold} tone="good" icon="check" />
        <Kpi label="Remaining" value={prepared - sold} tone="accent" icon="trash" />
        <Kpi label="Sell-through" value={prepared ? Math.round((sold / prepared) * 100) : 0} unit="%" icon="chart" hint={data?.closed ? "Day closed" : "Day open"} />
      </div>
      <Card bodyClass="pb-2">
        {loading && !data ? <Loading /> : (
          <Table rows={items} columns={[
            { key: "name", label: "Dish", render: (r) => <div><div className="font-semibold">{r.name}</div><div className="text-xs text-ink-500">{r.category}{!r.available && " · disabled"}</div></div> },
            { key: "forecast", label: "Forecast", align: "right", render: (r) => r.forecast ?? "—" },
            { key: "recommended", label: "Recommended", align: "right", render: (r) => <span className="text-after font-semibold">{r.recommended ?? "—"}</span> },
            { key: "prepared", label: "Prepared today", render: (r) => (
              <div className="flex items-center gap-1">
                <input className="input !w-20 !py-1 num" type="number" min={r.sold} placeholder="—" value={edit[r.id] ?? r.prepared ?? ""} onChange={(e) => setEdit((x) => ({ ...x, [r.id]: e.target.value }))} />
                {edit[r.id] !== undefined && <button className="btn-primary !px-2 !py-1 text-xs" onClick={() => saveStock(r)}>Save</button>}
              </div>) },
            { key: "sold", label: "Sold", align: "right" },
            { key: "remaining", label: "Remaining", align: "right", render: (r) => r.remaining == null ? "∞" : <span className={r.remaining <= 5 ? "text-before font-semibold" : ""}>{r.remaining}</span> },
            { key: "bar", label: "Sell-through", render: (r) => r.prepared ? <div className="w-32"><Meter value={(r.sold / r.prepared) * 100} tone={r.sold / r.prepared > 0.8 ? "good" : "accent"} /></div> : <span className="text-xs text-ink-500">untracked</span> },
          ]} />
        )}
      </Card>
    </>
  );
}
