import { useState } from "react";
import useFetch from "../../hooks/useFetch";
import { Orders, Payments, errMsg } from "../../services/api";
import { PageHeader, Loading, ErrorBox, Icon, Spinner, minsAgo, toast, Badge, ConfirmButton } from "../../components/ui";

export const NEXT = { PENDING: ["CONFIRMED", "Accept"], CONFIRMED: ["PREPARING", "Start preparation"], PREPARING: ["READY", "Mark ready"], READY: ["COMPLETED", "Complete order"] };
const COLS = [["PENDING", "Incoming", "border-t-amber-400"], ["CONFIRMED", "Accepted", "border-t-sky-400"], ["PREPARING", "Preparing", "border-t-violet-400"], ["READY", "Ready for pickup", "border-t-emerald-400"]];

export function OrderTicket({ o, onAction }) {
  const [busy, setBusy] = useState(false);
  const [next, label] = NEXT[o.status] || [];
  const cashDue = o.payment?.status === "PAY_AT_COUNTER";
  const confirmCash = async () => {
    setBusy(true);
    try { await Payments.confirmCash(o.id); toast(`Cash received for #${o.order_no}`); onAction?.(); }
    catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  };
  const act = async (status) => {
    setBusy(true);
    try { await Orders.setStatus(o.id, status); toast(`#${o.order_no} → ${status}`); onAction?.(); }
    catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  };
  const age = minsAgo(o.created_at);
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="num font-semibold">#{o.order_no}</span>
        <span className={`text-[11px] num font-semibold ${age > 15 ? "text-before" : "text-ink-500"}`}><Icon name="clock" className="w-3 h-3 inline -mt-0.5" /> {age}m</span>
      </div>
      <div className="text-xs text-ink-500">{o.user_name}</div>
      <ul className="text-sm space-y-0.5">{o.items.map((i) => <li key={i.food_id}><b className="num">{i.qty}×</b> {i.name}</li>)}</ul>
      <div className="flex items-center justify-between text-[11px] text-ink-500">
        <span>{o.payment?.method}{cashDue && <Badge status="PAY_AT_COUNTER" className="ml-1">collect cash</Badge>}</span>
        {o.live && <span className="num">pos {o.live.queue_position} · ~{Math.round(o.live.est_wait_min)}m</span>}
      </div>
      <div className="flex gap-2">
        {cashDue && o.status === "READY"
          ? <button className="btn-accent flex-1 !py-1.5 text-xs" disabled={busy} onClick={confirmCash}>{busy && <Spinner className="w-3 h-3" />}Confirm cash ₹{o.total}</button>
          : next && <button className="btn-primary flex-1 !py-1.5 text-xs" disabled={busy} onClick={() => act(next)}>{busy && <Spinner className="w-3 h-3" />}{label}</button>}
        {cashDue && o.status !== "READY" && <button className="btn-outline !px-2 !py-1.5 text-[11px]" disabled={busy} onClick={confirmCash} title="Cash received">₹ Paid</button>}
        {["PENDING", "CONFIRMED", "PREPARING"].includes(o.status) && (
          <ConfirmButton className="btn-ghost !px-2 !py-1.5 text-xs text-before" title={`Cancel order #${o.order_no}?`} message="Stock, demand and reward points are restored, and the payment is marked refunded." confirmLabel="Cancel order" danger onConfirm={() => act("CANCELLED")}>
            <Icon name="x" className="w-3.5 h-3.5" />
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}

export default function StaffOrders() {
  const { data, loading, error, reload } = useFetch(() => Orders.list({ scope: "active", limit: 300 }), [], { interval: 8000 });
  const orders = (data || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <>
      <PageHeader eyebrow="Kitchen staff" title="Order board" subtitle="Oldest first (FIFO). Board refreshes every 8 seconds.">
        <button className="btn-outline" onClick={() => reload()}><Icon name="refresh" />Refresh</button>
      </PageHeader>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? <Loading /> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {COLS.map(([st, title, border]) => {
            const list = orders.filter((o) => o.status === st);
            return (
              <div key={st} className={`rounded-xl bg-paper-200/60 border-t-4 ${border} p-3`}>
                <div className="flex items-center justify-between mb-3 px-1"><h3 className="font-display font-semibold">{title}</h3><span className="num text-sm text-ink-500">{list.length}</span></div>
                <div className="space-y-3">
                  {list.length === 0 && <div className="text-center text-xs text-ink-500 py-6">No orders</div>}
                  {list.map((o) => <OrderTicket key={o.id} o={o} onAction={() => reload(true)} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
