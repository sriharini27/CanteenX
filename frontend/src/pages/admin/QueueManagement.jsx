import { useState } from "react";
import useFetch from "../../hooks/useFetch";
import { Queue, errMsg } from "../../services/api";
import { PageHeader, Card, Kpi, Loading, ErrorBox, Table, Badge, Icon, Meter, ConfirmButton, fmtTime, toast } from "../../components/ui";
import { QueueStrip } from "../../components/canteen";

export default function QueueManagement() {
  const s = useFetch(Queue.status, [], { interval: 8000 });
  const live = useFetch(Queue.live, [], { interval: 8000 });
  const counters = useFetch(Queue.counters, []);
  const ev = useFetch(Queue.events, [], { interval: 15000 });
  const [newName, setNewName] = useState("");

  const upd = async (c, body) => {
    try { await Queue.updateCounter(c.id, body); counters.reload(true); s.reload(true); live.reload(true); }
    catch (e) { toast(errMsg(e), "error"); }
  };
  const add = async () => {
    if (!newName.trim()) return;
    try { await Queue.addCounter({ name: newName, active: false, avg_service_min: 3 }); setNewName(""); counters.reload(true); toast("Counter added"); }
    catch (e) { toast(errMsg(e), "error"); }
  };

  if (s.loading && !s.data) return <Loading />;
  const m = s.data;
  return (
    <>
      <PageHeader eyebrow="Administrator" title="Queue management" subtitle="Live queue metrics, the waiting-time estimate behind every order, and service-counter capacity." />
      <ErrorBox error={s.error} onRetry={s.reload} />
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
        <Kpi label="Arrival rate (λ)" value={m.arrival_rate_per_hr} unit="/hr" icon="user" hint="orders in last 60 min" />
        <Kpi label="Students waiting" value={m.students_waiting} icon="queue" hint={`${m.ready} ready for pickup`} />
        <Kpi label="Active orders" value={m.active_orders} icon="orders" />
        <Kpi label="Counters (c)" value={`${m.active_counters}/${m.total_counters}`} icon="counter" hint="active / total" />
        <Kpi label="Avg service time (s)" value={m.avg_service_min} unit="min" icon="clock" hint="prep start → ready" />
        <Kpi label="Current queue" value={m.queue_length} tone="accent" icon="queue" />
        <Kpi label="Max queue today" value={m.max_queue_today} icon="queue" />
        <Kpi label="Avg waiting time" value={m.avg_wait_min} unit="min" tone={m.avg_wait_min > 10 ? "bad" : "good"} icon="clock" />
        <Kpi label="Max waiting time" value={m.max_wait_min} unit="min" icon="clock" />
        <Kpi label="Orders completed" value={m.completed_today} tone="good" icon="check" />
        <Kpi label="Throughput" value={m.throughput_per_hr} unit="/hr" icon="chart" />
        <Kpi label="Utilization (ρ)" value={m.utilization_pct} unit="%" tone={m.utilization_pct > 85 ? "bad" : "default"} icon="flame" hint={m.status} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Live queue (FIFO)"><QueueStrip pending={m.pending} confirmed={m.confirmed} preparing={m.preparing} ready={m.ready} max={40} /></Card>
          <Card title="Orders in queue" subtitle="Position, remaining work ahead and estimated wait — recalculated every 8 s" bodyClass="pb-2">
            <Table rows={live.data || []} empty="Queue is empty" columns={[
              { key: "queue_position", label: "Pos", render: (r) => <span className="num font-semibold">{r.queue_position}</span> },
              { key: "order_no", label: "Order", render: (r) => <span className="num">#{r.order_no}</span> },
              { key: "user_name", label: "Student" },
              { key: "items", label: "Items", render: (r) => <span className="text-xs">{r.items.join(", ")}</span> },
              { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> },
              { key: "formula", label: "ETA calculation", render: (r) => <span className="num text-[11px] text-ink-500">{r.formula}</span> },
              { key: "est_pickup_at", label: "Pickup", render: (r) => fmtTime(r.est_pickup_at) },
            ]} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="How waiting time is estimated">
            <div className="text-sm space-y-3">
              <div className="rounded-lg bg-paper/70 p-3 num text-xs leading-relaxed">
                work = longest item time + 0.5 × (portions − 1)<br />
                ETA = Σ remaining work ahead ÷ c + own work<br />
                pickup = now + ETA
              </div>
              <p className="text-ink-500 text-xs">The slowest dish sets the pace of an order and each extra portion adds ~30 s. Orders ahead are shared across the <b>c</b> active counters. Orders already being prepared only count the minutes they still need.</p>
            </div>
          </Card>
          <Card title="Service counters" subtitle="Changing active counters immediately changes every ETA">
            {counters.loading && !counters.data ? <Loading /> : (
              <div className="space-y-2">
                {(counters.data || []).map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-lg border border-paper-300 px-3 py-2">
                    <button onClick={() => upd(c, { active: !c.active })} className={`relative h-6 w-11 shrink-0 rounded-full transition ${c.active ? "bg-after" : "bg-paper-300"}`} aria-label="Toggle counter">
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${c.active ? "left-[22px]" : "left-0.5"}`} /></button>
                    <span className="flex-1 text-sm font-semibold">{c.name}</span>
                    <input className="input !w-16 !py-1 num text-xs" type="number" step="0.5" min="0.5" defaultValue={c.avg_service_min} onBlur={(e) => +e.target.value !== c.avg_service_min && upd(c, { avg_service_min: +e.target.value })} title="avg service min" />
                    <ConfirmButton className="btn-ghost !p-1.5 text-ink-500" title={`Delete ${c.name}?`} message="The counter is removed from capacity planning." confirmLabel="Delete" danger
                      onConfirm={async () => { try { await Queue.removeCounter(c.id); counters.reload(true); } catch (e) { toast(errMsg(e), "error"); } }}><Icon name="trash" className="w-3.5 h-3.5" /></ConfirmButton>
                  </div>
                ))}
                <div className="flex gap-2 pt-2"><input className="input" placeholder="New counter name" value={newName} onChange={(e) => setNewName(e.target.value)} /><button className="btn-outline" onClick={add}><Icon name="plus" /></button></div>
                <div className="pt-3"><Meter label="Utilization of active counters" value={m.utilization_pct} tone={m.utilization_pct > 85 ? "bad" : "accent"} /></div>
              </div>
            )}
          </Card>
          <Card title="Recent queue events" bodyClass="px-5 pb-4 max-h-80 overflow-auto">
            {(ev.data || []).map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs py-1.5 border-b border-paper-200 last:border-0">
                <span className="num">#{e.order_no}</span><Badge status={e.event} /><span className="text-ink-500">queue {e.queue_length}</span><span className="text-ink-500 num">{fmtTime(e.at)}</span>
              </div>
            ))}
            {!ev.data?.length && <div className="text-xs text-ink-500 py-4 text-center">Events appear as orders move through the workflow.</div>}
          </Card>
        </div>
      </div>
    </>
  );
}
