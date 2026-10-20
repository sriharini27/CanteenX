import { Link } from "react-router-dom";
import useFetch from "../../hooks/useFetch";
import { Student, Queue, Orders, Rewards } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { PageHeader, Card, Kpi, Loading, ErrorBox, Empty, Badge, Icon, rupee } from "../../components/ui";
import { OrderTracker, EtaPanel, QueueStrip } from "../../components/canteen";

const STATUS_TONE = { Quiet: "good", Busy: "accent", "Very busy": "bad" };

export default function StudentDashboard() {
  const { user } = useAuth();
  const home = useFetch(Student.dashboard, [], { interval: 15000 });
  const q = useFetch(Queue.status, [], { interval: 10000 });
  const mine = useFetch(() => Orders.list({ limit: 30 }), [], { interval: 10000 });
  const rw = useFetch(Rewards.get, []);

  if (home.loading && !home.data) return <Loading />;
  const d = home.data, live = q.data;
  const today = new Date().toDateString();
  const myToday = (mine.data || []).filter((o) => new Date(o.created_at).toDateString() === today);
  const active = (mine.data || []).filter((o) => ["PENDING", "CONFIRMED", "PREPARING", "READY"].includes(o.status));
  const unpaid = (mine.data || []).filter((o) => o.status === "AWAITING_PAYMENT");

  return (
    <>
      <PageHeader eyebrow="Student" title={`Hi, ${user.name.split(" ")[0]} 👋`} subtitle="Check the queue before you walk over — order ahead and pick up when it's ready.">
        <Link to="/student/menu" className="btn-accent"><Icon name="menu" />Order food</Link>
      </PageHeader>
      <ErrorBox error={home.error} onRetry={home.reload} />
      {unpaid.map((o) => (
        <div key={o.id} className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          <Icon name="alert" className="w-5 h-5 text-orange-700" />
          <div className="flex-1 text-sm"><b>Order #{o.order_no} — payment not completed.</b> It will join the queue once paid ({rupee(o.total)}).</div>
          <Link to={`/student/payment/${o.id}`} className="btn-accent !py-1.5">Pay Now</Link>
        </div>
      ))}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Kpi label="Canteen status" value={d?.status} tone={STATUS_TONE[d?.status]} icon="counter" hint={`${d?.active_counters} counters open`} />
        <Kpi label="Queue length" value={live?.queue_length ?? d?.queue_length} unit="orders" icon="queue" />
        <Kpi label="Est. wait if you order now" value={Math.round(live?.est_wait_new_min ?? d?.est_wait_min)} unit="min" icon="clock" tone="accent" />
        <Kpi label="Food available" value={`${d?.available_count}/${d?.total_items}`} icon="box" />
        <Kpi label="Reward points" value={rw.data?.points ?? "—"} icon="gift" hint={rw.data ? `worth ${rupee(rw.data.points_value)}` : ""} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Live queue" subtitle="Each figure is an order ahead of you">
            {live ? <QueueStrip pending={live.pending} confirmed={live.confirmed} preparing={live.preparing} ready={live.ready} /> : <Loading />}
          </Card>
          <Card title="Your active orders" subtitle="Updates automatically every 10 seconds">
            {active.length === 0 ? (
              <Empty title="No active orders" text="Place an order and track its queue position and pickup time here." icon="orders">
                <Link to="/student/menu" className="btn-outline">Browse menu</Link>
              </Empty>
            ) : (
              <div className="space-y-5">
                {active.map((o) => (
                  <div key={o.id} className="rounded-xl border border-paper-300 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500 truncate">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</div>
                      <Badge status={o.status} />
                    </div>
                    <OrderTracker status={o.status} />
                    <EtaPanel order={o} />
                    {o.status === "READY" && <div className="rounded-lg bg-emerald-50 text-emerald-800 px-3 py-2 text-sm font-semibold">Your food is ready — please collect it at the counter.</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Popular this week">
            {d?.popular?.length ? (
              <ol className="space-y-2">
                {d.popular.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-3 text-sm">
                    <span className="num h-6 w-6 rounded-full bg-saffron-50 text-saffron-700 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                    <span className="flex-1">{p.name}</span><span className="num text-ink-500 text-xs">{p.qty} sold</span>
                  </li>
                ))}
              </ol>
            ) : <Empty title="No sales yet" />}
          </Card>
          <Card title="Today">
            <div className="flex justify-between text-sm py-1"><span className="text-ink-500">Your orders today</span><span className="num font-semibold">{myToday.length}</span></div>
            <div className="flex justify-between text-sm py-1"><span className="text-ink-500">Canteen orders today</span><span className="num font-semibold">{d?.orders_today}</span></div>
            {d?.low_stock?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-paper-200">
                <div className="label">Running low</div>
                {d.low_stock.map((s) => <div key={s.name} className="flex justify-between text-sm py-0.5"><span>{s.name}</span><span className="num text-before">{s.remaining} left</span></div>)}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
