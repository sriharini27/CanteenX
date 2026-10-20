/* Domain components shared by student / staff / admin screens */
import { useEffect, useState } from "react";
import { Icon, Badge, fmtTime } from "./ui";
import { assetUrl } from "../services/api";

/** Dish photo from MongoDB (image_url). Falls back to a neutral placeholder if missing or broken —
    never a broken-image icon, and the box keeps its size so the layout doesn't jump. */
export function FoodImage({ food, className = "aspect-[4/3]", src }) {
  const url = assetUrl(src ?? food?.image_url);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (url && !failed)
    return <img src={url} alt={food?.name || "Dish"} onError={() => setFailed(true)} loading="lazy" className={`w-full object-cover bg-paper-200 ${className}`} />;
  return (
    <div className={`w-full bg-gradient-to-br from-paper-200 to-paper-300/80 flex flex-col items-center justify-center text-ink-500 ${className}`} role="img" aria-label={`${food?.name || "Dish"} (no photo)`}>
      <svg viewBox="0 0 64 64" className="w-1/4 max-w-[56px] min-w-[22px] opacity-60" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="32" cy="34" r="16" /><circle cx="32" cy="34" r="9" opacity=".5" />
        <path d="M8 14v12a4 4 0 0 0 4 4v20M12 14v10M16 14v12a4 4 0 0 1-4 4M54 14c-4 2-5 8-5 14h5v22" />
      </svg>
    </div>
  );
}

const FLOW = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"];
const LABEL = { PENDING: "Placed", CONFIRMED: "Accepted", PREPARING: "Preparing", READY: "Ready", COMPLETED: "Collected" };
export function OrderTracker({ status }) {
  if (status === "CANCELLED") return <Badge status="CANCELLED">Order cancelled</Badge>;
  if (status === "AWAITING_PAYMENT") return <Badge status="AWAITING_PAYMENT">Payment pending — not in the queue yet</Badge>;
  const idx = FLOW.indexOf(status);
  return (
    <div className="flex items-center">
      {FLOW.map((s, i) => (
        <div key={s} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition ${i < idx ? "bg-after text-white" : i === idx ? "bg-saffron text-white ring-4 ring-saffron/20" : "bg-paper-200 text-ink-500"}`}>
              {i < idx ? <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
            </div>
            <span className={`text-[10px] font-semibold ${i <= idx ? "text-ink" : "text-ink-500"}`}>{LABEL[s]}</span>
          </div>
          {i < FLOW.length - 1 && <div className={`h-0.5 flex-1 mx-1 mb-4 rounded ${i < idx ? "bg-after" : "bg-paper-300"}`} />}
        </div>
      ))}
    </div>
  );
}

/** Big "Order #1042 · position 7 · 12 min · pickup 12:42" panel */
export function EtaPanel({ order }) {
  const live = order.live;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat label="Order" value={`#${order.order_no}`} />
      <Stat label="Queue position" value={live ? live.queue_position : order.status === "READY" ? "Ready" : "—"} />
      <Stat label="Est. waiting time" value={live ? `${Math.round(live.est_wait_min)} min` : order.wait_min != null ? `${order.wait_min} min` : "—"} sub={live ? null : order.wait_min != null ? "actual" : null} />
      <Stat label="Expected pickup" value={live ? fmtTime(live.est_pickup_at) : order.ready_at ? fmtTime(order.ready_at) : "—"} />
    </div>
  );
}
const Stat = ({ label, value, sub }) => (
  <div className="rounded-lg bg-paper/70 border border-paper-300/60 px-3 py-2.5">
    <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-500">{label}</div>
    <div className="num text-xl font-semibold mt-0.5">{value}{sub && <span className="text-[11px] text-ink-500 ml-1 font-sans">{sub}</span>}</div>
  </div>
);

/** Visual queue: one figure per waiting order, coloured by status */
export function QueueStrip({ pending = 0, confirmed = 0, preparing = 0, ready = 0, max = 30 }) {
  const people = [
    ...Array(preparing).fill("bg-violet-500"), ...Array(confirmed).fill("bg-sky-500"),
    ...Array(pending).fill("bg-amber-500"),
  ];
  const shown = people.slice(0, max);
  return (
    <div>
      <div className="flex items-end gap-1 flex-wrap min-h-[34px]">
        <div className="flex items-center gap-1 mr-2 text-ink-500"><Icon name="counter" className="w-6 h-6" /></div>
        {shown.length === 0 && <span className="text-sm text-ink-500">No one is waiting — walk right up.</span>}
        {shown.map((c, i) => (
          <div key={i} className="flex flex-col items-center" title={c.includes("violet") ? "Preparing" : c.includes("sky") ? "Accepted" : "Waiting"}>
            <div className={`h-2.5 w-2.5 rounded-full ${c}`} /><div className={`h-4 w-3.5 rounded-t-md mt-0.5 ${c} opacity-80`} />
          </div>
        ))}
        {people.length > max && <span className="text-xs text-ink-500 ml-1">+{people.length - max}</span>}
      </div>
      <div className="flex gap-4 mt-3 text-[11px] text-ink-500">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-violet-500" />Preparing {preparing}</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-sky-500" />Accepted {confirmed}</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-500" />Waiting {pending}</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />Ready for pickup {ready}</span>
      </div>
    </div>
  );
}
