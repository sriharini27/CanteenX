import { Link } from "react-router-dom";
import useFetch from "../../hooks/useFetch";
import { Orders, errMsg } from "../../services/api";
import { PageHeader, Card, Loading, ErrorBox, Empty, Badge, Table, ConfirmButton, Icon, rupee, fmtDateTime, toast } from "../../components/ui";
import { OrderTracker, EtaPanel } from "../../components/canteen";

export default function MyOrders() {
  const { data, loading, error, reload } = useFetch(() => Orders.list({ limit: 100 }), [], { interval: 10000 });
  const orders = data || [];
  const active = orders.filter((o) => ["PENDING", "CONFIRMED", "PREPARING", "READY"].includes(o.status));
  const unpaid = orders.filter((o) => o.status === "AWAITING_PAYMENT");
  const past = orders.filter((o) => !active.includes(o) && !unpaid.includes(o));

  const cancel = async (o) => {
    try { await Orders.cancel(o.id); toast(`Order #${o.order_no} cancelled`); reload(true); }
    catch (e) { toast(errMsg(e), "error"); }
  };

  return (
    <>
      <PageHeader eyebrow="Student" title="My orders" subtitle="Live status, queue position and pickup time for your orders." />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <div className="space-y-6">
          {unpaid.map((o) => (
            <div key={o.id} className="card border-2 border-orange-200 p-5 flex flex-wrap items-center gap-4">
              <div className="h-11 w-11 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center"><Icon name="alert" className="w-5 h-5" /></div>
              <div className="flex-1 min-w-[220px]">
                <div className="font-semibold">Order #{o.order_no} · <span className="text-orange-700">Payment Pending</span></div>
                <div className="text-sm text-ink-500">Payment not completed{o.payment?.failure_reason ? ` — ${o.payment.failure_reason}` : ""}. Not in the queue yet.</div>
                <div className="text-xs text-ink-500 mt-0.5">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")} · <Badge status={o.payment?.status} /></div>
              </div>
              <div className="num text-xl font-semibold">{rupee(o.total)}</div>
              <div className="flex gap-2">
                <Link to={`/student/payment/${o.id}`} className="btn-accent">Pay Now</Link>
                <ConfirmButton className="btn-ghost text-xs text-before" title={`Cancel order #${o.order_no}?`} message="Nothing has been charged. The order will be removed." confirmLabel="Cancel order" danger onConfirm={() => cancel(o)}>Cancel</ConfirmButton>
              </div>
            </div>
          ))}
          {active.map((o) => (
            <Card key={o.id} title={`Order #${o.order_no}`} subtitle={`${fmtDateTime(o.created_at)} · ${o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}`}
              action={<div className="flex items-center gap-2"><Badge status={o.status} />
                {o.status === "PENDING" && <ConfirmButton className="btn-ghost !py-1 text-xs text-before" title="Cancel order?" message={o.payment?.status === "SUCCESS" ? "Your payment (simulated) and reward points will be refunded." : "Your order will be removed from the queue."} confirmLabel="Cancel order" danger onConfirm={() => cancel(o)}>Cancel</ConfirmButton>}</div>}>
              <div className="space-y-5"><OrderTracker status={o.status} /><EtaPanel order={o} />
                {o.live && <p className="text-[11px] text-ink-500 num">Estimate: {o.live.formula}</p>}</div>
            </Card>
          ))}
          <Card title="Order history" bodyClass="pb-2">
            {past.length === 0 ? <Empty title="No past orders" /> : (
              <Table rows={past} columns={[
                { key: "order_no", label: "Order", render: (o) => <span className="num font-semibold">#{o.order_no}</span> },
                { key: "created_at", label: "Placed", render: (o) => fmtDateTime(o.created_at) },
                { key: "items", label: "Items", render: (o) => <span className="text-ink-700">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</span> },
                { key: "wait_min", label: "Wait", align: "right", render: (o) => (o.wait_min != null ? `${o.wait_min} min` : "—") },
                { key: "payment", label: "Payment", render: (o) => <span className="text-xs">{o.payment?.method} <Badge status={o.payment?.status} /></span> },
                { key: "total", label: "Total", align: "right", render: (o) => rupee(o.total) },
                { key: "status", label: "Status", render: (o) => <Badge status={o.status} /> },
              ]} />
            )}
          </Card>
        </div>
      )}
    </>
  );
}
