import { useState } from "react";
import useFetch from "../../hooks/useFetch";
import { Orders, Payments, errMsg } from "../../services/api";
import { PageHeader, Card, Kpi, Loading, ErrorBox, Badge, Table, Modal, rupee, fmtDateTime, fmtTime, toast } from "../../components/ui";
import { OrderTracker, EtaPanel } from "../../components/canteen";
import { NEXT } from "../staff/Orders";

const STATUSES = ["ALL", "AWAITING_PAYMENT", "PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"];
const today = () => new Date().toLocaleDateString("en-CA");

export default function AdminOrders() {
  const [status, setStatus] = useState("ALL");
  const [date, setDate] = useState(today());
  const [sel, setSel] = useState(null);
  const { data, loading, error, reload } = useFetch(() => Orders.list({ status, date, limit: 500 }), [status, date], { interval: 15000 });
  const orders = data || [];
  const valid = orders.filter((o) => o.status !== "CANCELLED");
  const waits = valid.filter((o) => o.wait_min != null).map((o) => o.wait_min);

  const confirmCash = async (o) => {
    try { const r = await Payments.confirmCash(o.id); toast(`Cash received for #${o.order_no}`); if (sel) setSel(r); reload(true); }
    catch (e) { toast(errMsg(e), "error"); }
  };
  const payCounts = orders.reduce((m, o) => ({ ...m, [o.payment?.status]: (m[o.payment?.status] || 0) + 1 }), {});

  const setSt = async (o, st) => {
    try { const r = await Orders.setStatus(o.id, st); toast(`#${o.order_no} → ${st}`); setSel(r); reload(true); }
    catch (e) { toast(errMsg(e), "error"); }
  };

  return (
    <>
      <PageHeader eyebrow="Administrator" title="Orders" subtitle="All orders with their real waiting times. Click a row to manage it.">
        <input type="date" className="input !w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
      </PageHeader>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Kpi label="Orders shown" value={orders.length} />
        <Kpi label="Revenue" value={rupee(valid.reduce((s, o) => s + o.total, 0))} />
        <Kpi label="Pending" value={orders.filter((o) => o.status === "PENDING").length} tone="accent" />
        <Kpi label="Avg wait" value={waits.length ? (waits.reduce((a, b) => a + b, 0) / waits.length).toFixed(1) : "—"} unit="min" />
        <Kpi label="Max wait" value={waits.length ? Math.max(...waits) : "—"} unit="min" />
      </div>
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        {["SUCCESS", "PAY_AT_COUNTER", "PENDING", "FAILED", "CANCELLED", "REFUNDED"].map((k) => (
          <span key={k} className="flex items-center gap-1"><Badge status={k} /><span className="num font-semibold">{payCounts[k] || 0}</span></span>
        ))}
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <Card bodyClass="pb-2">
        {loading && !data ? <Loading /> : (
          <Table rows={orders} onRowClick={setSel} empty="No orders for this filter" columns={[
            { key: "order_no", label: "Order", render: (o) => <span className="num font-semibold">#{o.order_no}</span> },
            { key: "created_at", label: "Placed", render: (o) => fmtTime(o.created_at) },
            { key: "user_name", label: "Customer" },
            { key: "items", label: "Items", render: (o) => <span className="text-ink-700 text-xs">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</span> },
            { key: "est", label: "Est / actual wait", align: "right", render: (o) => `${o.est_wait_min ?? "—"} / ${o.wait_min ?? (o.live ? `~${Math.round(o.live.est_wait_min)}` : "—")}` },
            { key: "total", label: "Amount", align: "right", render: (o) => rupee(o.total) },
            { key: "method", label: "Method", render: (o) => <span className="text-xs font-semibold">{o.payment?.method}</span> },
            { key: "pay", label: "Payment", render: (o) => o.payment?.status === "PAY_AT_COUNTER"
                ? <div className="flex items-center gap-1"><Badge status="PAY_AT_COUNTER">PAY AT COUNTER</Badge>
                    <button className="btn-primary !px-2 !py-0.5 text-[11px]" onClick={(e) => { e.stopPropagation(); confirmCash(o); }}>Confirm Payment</button></div>
                : <Badge status={o.payment?.status} /> },
            { key: "status", label: "Order", render: (o) => <Badge status={o.status} /> },
            { key: "txn", label: "Transaction ID", render: (o) => <span className="num text-[11px] text-ink-500">{o.payment?.txn_id || "—"}</span> },
          ]} />
        )}
      </Card>
      <Modal open={!!sel} wide title={sel ? `Order #${sel.order_no} · ${sel.user_name}` : ""} onClose={() => setSel(null)}
        footer={sel && <>
          {sel.payment?.status === "PAY_AT_COUNTER" && <button className="btn-accent" onClick={() => confirmCash(sel)}>Confirm Payment ({rupee(sel.total)})</button>}
          {["PENDING", "CONFIRMED", "PREPARING"].includes(sel.status) && <button className="btn-ghost text-before" onClick={() => setSt(sel, "CANCELLED")}>Cancel order</button>}
          {NEXT[sel.status] && !(sel.status === "READY" && sel.payment?.status !== "SUCCESS") && <button className="btn-primary" onClick={() => setSt(sel, NEXT[sel.status][0])}>{NEXT[sel.status][1]}</button>}
        </>}>
        {sel && (
          <div className="space-y-5">
            <OrderTracker status={sel.status} />
            <EtaPanel order={sel} />
            <div className="text-sm divide-y divide-paper-200">
              {sel.items.map((i) => <div key={i.food_id} className="flex justify-between py-1.5"><span>{i.qty} × {i.name}</span><span className="num">{rupee(i.qty * i.price)}</span></div>)}
              <div className="flex justify-between py-1.5 font-semibold"><span>Total paid</span><span className="num">{rupee(sel.total)}</span></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              {[["Placed", sel.created_at], ["Accepted", sel.confirmed_at], ["Prep started", sel.prep_started_at], ["Ready", sel.ready_at], ["Collected", sel.completed_at], ["Cancelled", sel.cancelled_at]].map(([l, v]) => (
                <div key={l} className="rounded bg-paper/60 px-2 py-1.5"><div className="text-ink-500">{l}</div><div className="num font-semibold">{v ? fmtDateTime(v) : "—"}</div></div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {[["Payment method", sel.payment?.method], ["Payment status", <Badge key="b" status={sel.payment?.status} />], ["Attempts", sel.payment?.attempts ?? 1], ["Transaction ID", sel.payment?.txn_id || "—"]].map(([l, v]) => (
                <div key={l} className="rounded bg-paper/60 px-2 py-1.5"><div className="text-ink-500">{l}</div><div className="num font-semibold break-all">{v}</div></div>
              ))}
            </div>
            {sel.payment?.failure_reason && <div className="text-xs text-before">Last payment issue: {sel.payment.failure_reason}</div>}
            <div className="text-xs text-ink-500 num">work time {sel.work_min} min · meal period {sel.meal_period}</div>
          </div>
        )}
      </Modal>
    </>
  );
}
