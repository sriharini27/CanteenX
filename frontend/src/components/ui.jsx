import { useEffect, useState } from "react";

/* ---------- icons (inline SVG, stroke style) ---------- */
const P = {
  dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  menu: "M4 6h16M4 12h16M4 18h10",
  cart: "M3 3h2l2.4 12.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  orders: "M9 5h10M9 12h10M9 19h10M4 5h.01M4 12h.01M4 19h.01",
  gift: "M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zm0 0h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z",
  queue: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  sim: "M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8",
  report: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
  box: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  plus: "M12 5v14M5 12h14", minus: "M5 12h14", x: "M18 6L6 18M6 6l12 12",
  check: "M20 6L9 17l-5-5", search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  play: "M6 4l14 8-14 8z", refresh: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  flame: "M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-5 5-5 8-1-1-2-2-2-4-2 2-2 5-2 8 0 4 3 7 7 7z",
  arrowDown: "M12 5v14M5 12l7 7 7-7", arrowUp: "M12 19V5M5 12l7-7 7 7",
  print: "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  alert: "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  card: "M2 5h20v14H2zM2 10h20", cash: "M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", phone: "M7 2h10v20H7zM11 18h2",
  counter: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6",
};
export function Icon({ name, className = "w-4 h-4", strokeWidth = 1.8 }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d={P[name] || P.info} />
    </svg>
  );
}

/* ---------- layout pieces ---------- */
export function PageHeader({ title, subtitle, children, eyebrow }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-saffron-600 mb-1">{eyebrow}</div>}
        <h1 className="text-2xl md:text-[28px] font-bold leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 no-print">{children}</div>}
    </div>
  );
}

export function Card({ title, subtitle, action, children, className = "", bodyClass = "p-5" }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div>
            {title && <h3 className="font-display text-[15px] font-semibold">{title}</h3>}
            {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

const TONES = {
  default: "text-ink", accent: "text-saffron-600", good: "text-after", bad: "text-before", muted: "text-ink-500",
};
export function Kpi({ label, value, unit, hint, icon, tone = "default", trend }) {
  return (
    <div className="card p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between text-ink-500">
        <span className="text-[11px] font-semibold uppercase tracking-wider truncate">{label}</span>
        {icon && <Icon name={icon} className="w-4 h-4 shrink-0" />}
      </div>
      <div className={`num text-2xl font-semibold leading-tight ${TONES[tone]}`}>
        {value ?? "—"}{unit && <span className="text-sm text-ink-500 font-sans ml-1">{unit}</span>}
      </div>
      {(hint || trend) && (
        <div className="text-xs text-ink-500 flex items-center gap-1">
          {trend != null && (
            <span className={`inline-flex items-center gap-0.5 font-semibold ${trend >= 0 ? "text-after" : "text-before"}`}>
              <Icon name={trend >= 0 ? "arrowDown" : "arrowUp"} className="w-3 h-3" />{Math.abs(trend)}%
            </span>
          )}
          {hint}
        </div>
      )}
    </div>
  );
}

const STATUS_STYLE = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  CONFIRMED: "bg-sky-50 text-sky-700 ring-sky-200",
  PREPARING: "bg-violet-50 text-violet-700 ring-violet-200",
  READY: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  COMPLETED: "bg-paper-200 text-ink-500 ring-paper-300",
  CANCELLED: "bg-rose-50 text-rose-700 ring-rose-200",
  SUCCESS: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PAY_AT_COUNTER: "bg-amber-50 text-amber-700 ring-amber-200",
  REFUNDED: "bg-rose-50 text-rose-700 ring-rose-200",
  AWAITING_PAYMENT: "bg-orange-50 text-orange-700 ring-orange-200",
  PROCESSING: "bg-sky-50 text-sky-700 ring-sky-200",
  FAILED: "bg-rose-50 text-rose-700 ring-rose-200",
};
export function Badge({ children, status, className = "" }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap ${STATUS_STYLE[status] || "bg-paper-200 text-ink-700 ring-paper-300"} ${className}`}>
      {children ?? status?.replaceAll("_", " ")}
    </span>
  );
}

export const VegDot = ({ veg }) => (
  <span title={veg ? "Veg" : "Non-veg"} className={`inline-flex h-4 w-4 items-center justify-center rounded-[3px] border-[1.5px] ${veg ? "border-green-600" : "border-red-600"}`}>
    <span className={`h-2 w-2 rounded-full ${veg ? "bg-green-600" : "bg-red-600"}`} />
  </span>
);

export const Spinner = ({ className = "w-5 h-5" }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" /><path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
);
export const Loading = ({ label = "Loading…" }) => (
  <div className="flex items-center justify-center gap-3 py-16 text-ink-500"><Spinner /> <span className="text-sm">{label}</span></div>
);
export const Empty = ({ title = "Nothing here yet", text, icon = "box", children }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-4">
    <div className="h-12 w-12 rounded-full bg-paper-200 flex items-center justify-center text-ink-500 mb-3"><Icon name={icon} className="w-5 h-5" /></div>
    <div className="font-semibold">{title}</div>
    {text && <p className="text-sm text-ink-500 mt-1 max-w-sm">{text}</p>}
    {children && <div className="mt-4">{children}</div>}
  </div>
);
export const ErrorBox = ({ error, onRetry }) =>
  error ? (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-center justify-between gap-3">
      <span className="flex items-center gap-2"><Icon name="alert" />{error}</span>
      {onRetry && <button className="font-semibold underline" onClick={() => onRetry()}>Retry</button>}
    </div>
  ) : null;

export function Modal({ open, title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose?.();
    if (open) window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className={`card w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-auto`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-paper-200">
          <h3 className="font-display font-semibold text-lg">{title}</h3>
          <button className="btn-ghost !p-1.5" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-paper-200 flex justify-end gap-2 bg-paper/40">{footer}</div>}
      </div>
    </div>
  );
}

/** Button that asks for confirmation in a dialog before running onConfirm. */
export function ConfirmButton({ children, title = "Are you sure?", message, onConfirm, className = "btn-outline", confirmLabel = "Confirm", danger }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await onConfirm(); setOpen(false); } finally { setBusy(false); }
  };
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{children}</button>
      <Modal open={open} title={title} onClose={() => setOpen(false)}
        footer={<>
          <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          <button className={danger ? "btn-danger" : "btn-primary"} disabled={busy} onClick={go}>{busy && <Spinner className="w-4 h-4" />}{confirmLabel}</button>
        </>}>
        <p className="text-sm text-ink-700">{message}</p>
      </Modal>
    </>
  );
}

/** columns: [{key, label, render?, className?, align?}] */
export function Table({ columns, rows, empty = "No records", rowKey = (r, i) => r.id || i, onRowClick }) {
  if (!rows?.length) return <Empty title={empty} icon="orders" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead><tr>{columns.map((c) => <th key={c.key} className={`th ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className={`hover:bg-paper/50 ${onRowClick ? "cursor-pointer" : ""}`} onClick={() => onRowClick?.(r)}>
              {columns.map((c) => (
                <td key={c.key} className={`td ${c.align === "right" ? "text-right num" : ""} ${c.className || ""}`}>{c.render ? c.render(r) : r[c.key] ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-500 mt-1">{hint}</span>}
    </label>
  );
}

/** horizontal progress / meter bar */
export function Meter({ value, max = 100, tone = "accent", label }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const col = { accent: "bg-saffron", good: "bg-after", bad: "bg-before", ink: "bg-ink" }[tone];
  return (
    <div>
      {label && <div className="flex justify-between text-xs mb-1"><span className="text-ink-500">{label}</span><span className="num font-semibold">{Math.round(value * 10) / 10}{max === 100 ? "%" : ""}</span></div>}
      <div className="h-2 rounded-full bg-paper-200 overflow-hidden"><div className={`h-full rounded-full ${col} transition-all duration-700`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/* ---------- toast ---------- */
export const toast = (msg, type = "ok") => window.dispatchEvent(new CustomEvent("toast", { detail: { msg, type } }));
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const h = (e) => {
      const id = Math.random();
      setItems((s) => [...s, { id, ...e.detail }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3500);
    };
    window.addEventListener("toast", h);
    return () => window.removeEventListener("toast", h);
  }, []);
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 no-print">
      {items.map((t) => (
        <div key={t.id} className={`rounded-lg px-4 py-3 text-sm font-medium shadow-lg flex items-center gap-2 ${t.type === "error" ? "bg-before text-white" : "bg-ink text-white"}`}>
          <Icon name={t.type === "error" ? "alert" : "check"} />{t.msg}
        </div>
      ))}
    </div>
  );
}

export const rupee = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—");
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
export const minsAgo = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
