import { Link } from "react-router-dom";
import useFetch from "../../hooks/useFetch";
import { Queue, Orders } from "../../services/api";
import { PageHeader, Card, Kpi, Loading, ErrorBox, Empty, Meter, Icon } from "../../components/ui";
import { QueueStrip } from "../../components/canteen";
import { OrderTicket } from "./Orders";

export default function StaffDashboard() {
  const q = useFetch(Queue.status, [], { interval: 8000 });
  const w = useFetch(Queue.workload, [], { interval: 8000 });
  const next = useFetch(() => Orders.list({ status: "PENDING,CONFIRMED", limit: 50 }), [], { interval: 8000 });
  if (q.loading && !q.data) return <Loading />;
  const s = q.data;
  const reloadAll = () => { q.reload(true); w.reload(true); next.reload(true); };
  const upNext = (next.data || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 4);

  return (
    <>
      <PageHeader eyebrow="Kitchen staff" title="Today at the counter" subtitle="Live workload — work through orders oldest first.">
        <Link to="/staff/orders" className="btn-primary"><Icon name="orders" />Open order board</Link>
      </PageHeader>
      <ErrorBox error={q.error} onRetry={q.reload} />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <Kpi label="Pending" value={s.pending} tone="accent" icon="orders" />
        <Kpi label="Accepted" value={s.confirmed} icon="check" />
        <Kpi label="Preparing" value={s.preparing} icon="flame" />
        <Kpi label="Ready" value={s.ready} tone="good" icon="box" />
        <Kpi label="Completed today" value={s.completed_today} icon="check" />
        <Kpi label="Current queue" value={s.queue_length} unit="orders" icon="queue" />
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Queue"><QueueStrip pending={s.pending} confirmed={s.confirmed} preparing={s.preparing} ready={s.ready} /></Card>
          <Card title="Up next" subtitle="Accept and start the oldest orders first">
            {upNext.length === 0 ? <Empty title="All caught up" text="No pending orders right now." icon="check" /> : (
              <div className="grid sm:grid-cols-2 gap-3">{upNext.map((o) => <OrderTicket key={o.id} o={o} onAction={reloadAll} />)}</div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Preparation workload">
            <div className="num text-3xl font-semibold">{w.data?.total_work_min ?? "—"}<span className="text-sm text-ink-500 font-sans"> min of work queued</span></div>
            <div className="text-xs text-ink-500 mt-1">≈ {w.data?.per_counter_min} min per active counter ({s.active_counters} open)</div>
            <div className="mt-4 space-y-3">
              <Meter label="Counter utilization (last hour)" value={s.utilization_pct} tone={s.utilization_pct > 85 ? "bad" : "accent"} />
              <Meter label="Avg wait today (vs 10-min target)" value={s.avg_wait_min} max={Math.max(10, s.avg_wait_min)} tone={s.avg_wait_min > 10 ? "bad" : "good"} />
            </div>
          </Card>
          <Card title="To prepare now" subtitle="Portions across all queued orders">
            {!w.data?.to_prepare?.length ? <Empty title="Nothing to prepare" /> : (
              <ul className="divide-y divide-paper-200">
                {w.data.to_prepare.map((i) => <li key={i.name} className="flex justify-between py-2 text-sm"><span>{i.name}</span><span className="num font-semibold">{i.qty}</span></li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
