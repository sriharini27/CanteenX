import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Orders, Payments, errMsg } from "../../services/api";
import { PageHeader, Card, Loading, ErrorBox, Badge, Icon, Spinner, ConfirmButton, rupee, fmtDateTime, toast } from "../../components/ui";
import { EtaPanel, OrderTracker } from "../../components/canteen";
import { METHODS } from "./Checkout";

const DECLINE_CARD = "4000000000000002";
const STEPS = { UPI: ["Contacting your UPI app…", "Processing payment…", "Verifying payment…"],
                CARD: ["Contacting the bank…", "Processing payment…", "Verifying payment…"],
                CASH: ["Reserving your order…", "Adding you to the queue…"] };
const luhn = (n) => [...n].reverse().reduce((s, d, i) => s + (i % 2 ? ((d * 2) > 9 ? d * 2 - 9 : d * 2) : +d), 0) % 10 === 0;
const PAYABLE = ["PENDING", "FAILED", "CANCELLED"];

/** /student/payment/:orderId — dummy payment page (no real gateway). */
export default function Payment() {
  const { orderId } = useParams();
  const nav = useNavigate();
  const [order, setOrder] = useState(null);
  const [log, setLog] = useState([]);
  const [error, setError] = useState("");
  const [method, setMethod] = useState("UPI");
  const [upi, setUpi] = useState("student@upi");
  const [card, setCard] = useState({ number: "4111 1111 1111 1111", expiry: "12/29", cvv: "123", name: "" });
  const [phase, setPhase] = useState("form");      // form | processing | failed
  const [step, setStep] = useState(0);
  const [result, setResult] = useState(null);

  const load = async () => {
    try {
      const o = await Orders.get(orderId);
      setOrder(o); setMethod((m) => (phase === "form" && o.payment?.method) || m);
      setLog(await Payments.forOrder(orderId));
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { load(); }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = () => {
    if (method === "UPI" && !/^[\w.\-]{2,}@[a-z]{2,}$/i.test(upi.trim())) return "Enter a valid UPI ID, e.g. student@upi";
    if (method === "CARD") {
      const n = card.number.replace(/\s/g, "");
      if (!/^\d{16}$/.test(n) || !luhn(n)) return "Enter a valid 16-digit card number";
      const m = card.expiry.match(/^(\d{2})\/(\d{2})$/);
      if (!m || +m[1] < 1 || +m[1] > 12 || new Date(2000 + +m[2], +m[1]) < new Date()) return "Enter a valid future expiry (MM/YY)";
      if (!/^\d{3}$/.test(card.cvv)) return "CVV must be 3 digits";
    }
    return "";
  };

  const pay = async () => {
    const v = validate();
    if (v) return setError(v);
    setError(""); setPhase("processing"); setStep(0);
    const steps = STEPS[method];
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 850);
    // Card details are only checked here in the browser — the request carries the method and a test flag, never the card.
    const body = method === "UPI" ? { method, upi_id: upi.trim() }
      : method === "CARD" ? { method, test_decline: card.number.replace(/\s/g, "") === DECLINE_CARD } : { method };
    const minDelay = new Promise((r) => setTimeout(r, steps.length * 850 + 300));
    try {
      const [o] = await Promise.all([Payments.pay(orderId, body), minDelay]);
      setOrder(o); setLog(await Payments.forOrder(orderId));
      if (o.payment.status === "FAILED") { setPhase("failed"); setResult(o.payment.failure_reason); }
      else { setPhase("form"); toast(o.payment.status === "SUCCESS" ? "Payment successful" : "Order confirmed — pay at the counter"); }
    } catch (e) {
      await minDelay; setPhase("failed"); setResult(errMsg(e)); load();
    } finally { clearInterval(timer); }
  };

  const cancelPayment = async () => {
    try { const o = await Payments.cancel(orderId); setOrder(o); setPhase("form"); setLog(await Payments.forOrder(orderId)); toast("Payment cancelled — you can pay later from My Orders"); }
    catch (e) { toast(errMsg(e), "error"); }
  };

  if (!order) return error ? <ErrorBox error={error} onRetry={load} /> : <Loading label="Loading order…" />;
  const ps = order.payment?.status;
  const total = rupee(order.total);

  /* ---------- paid / cash confirmed ---------- */
  if (ps === "SUCCESS" || ps === "PAY_AT_COUNTER" || ps === "REFUNDED" || order.status === "CANCELLED") {
    const ok = ps === "SUCCESS" || ps === "PAY_AT_COUNTER";
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card p-6 md:p-8 text-center">
          <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center ${ok ? "bg-emerald-100 text-after" : "bg-paper-200 text-ink-500"}`}>
            <Icon name={ok ? "check" : "x"} className="w-8 h-8" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold mt-4">{ps === "SUCCESS" ? "✓ Payment Successful" : ps === "PAY_AT_COUNTER" ? "Order confirmed — pay at the counter" : "Order cancelled"}</h1>
          <p className="text-sm text-ink-500 mt-1">{ps === "PAY_AT_COUNTER" ? "Please pay at the canteen counter when collecting your order." : ps === "REFUNDED" ? "Your payment has been refunded (simulated)." : ok ? "Your order has entered the queue." : ""}</p>
          <div className="grid grid-cols-2 gap-3 text-left mt-6">
            <Info label="Order" value={`#${order.order_no}`} /><Info label="Amount" value={total} />
            <Info label="Payment method" value={order.payment.method} /><Info label="Payment status" value={<Badge status={ps} />} />
            <Info label="Transaction ID" value={order.payment.txn_id || "— (issued when cash is received)"} wide />
          </div>
          {ok && <div className="mt-6 text-left space-y-4"><OrderTracker status={order.status} /><EtaPanel order={order} /></div>}
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/student/orders" className="btn-primary"><Icon name="orders" />Track Order</Link>
            <Link to="/student/menu" className="btn-outline">Order more</Link>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- unpaid: pay now ---------- */
  const steps = STEPS[method];
  return (
    <>
      <PageHeader eyebrow="Student · Payment" title={`Pay for order #${order.order_no}`} subtitle="Dummy payment gateway for the college project — no real money is charged and no card details leave your browser." />
      {ps !== "PENDING" && phase === "form" && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 mb-5 flex items-center gap-3">
          <Icon name="alert" className="w-5 h-5 text-orange-700" />
          <div className="flex-1 text-sm"><b>Payment not completed</b> — {order.payment.failure_reason || "the last attempt was not finished"}. Your order is waiting and is <b>not</b> in the queue yet.</div>
        </div>
      )}
      <ErrorBox error={error} />
      <div className="grid lg:grid-cols-3 gap-6 mt-2">
        <Card className="lg:col-span-2" title="Payment" subtitle={`Order #${order.order_no} · placed ${fmtDateTime(order.ordered_at || order.created_at)}`}
          action={<Badge status={phase === "processing" ? "PROCESSING" : ps} />}>
          {phase === "processing" ? (
            <div className="py-10 flex flex-col items-center">
              <Spinner className="w-10 h-10 text-saffron" />
              <div className="mt-6 space-y-2 w-full max-w-xs">
                {steps.map((s, i) => (
                  <div key={s} className={`flex items-center gap-2 text-sm transition ${i <= step ? "text-ink" : "text-ink-300"}`}>
                    {i < step ? <Icon name="check" className="w-4 h-4 text-after" strokeWidth={3} /> : i === step ? <Spinner className="w-4 h-4" /> : <span className="w-4 h-4 rounded-full border border-paper-300" />}
                    {s}
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-500 mt-6">Please don't close this page.</p>
            </div>
          ) : phase === "failed" ? (
            <div className="py-8 text-center">
              <div className="mx-auto h-14 w-14 rounded-full bg-rose-100 text-before flex items-center justify-center"><Icon name="x" className="w-7 h-7" strokeWidth={2.5} /></div>
              <h2 className="text-xl font-bold mt-3">Payment failed</h2>
              <p className="text-sm text-ink-500 mt-1">{result || "Please try again."}</p>
              <p className="text-xs text-ink-500 mt-1">Your order has not joined the queue and no money was taken.</p>
              <div className="flex justify-center gap-2 mt-5">
                <button className="btn-accent" onClick={() => setPhase("form")}><Icon name="refresh" />Try again</button>
                <Link className="btn-outline" to="/student/orders">Pay later</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {METHODS.map(([v, l, icon]) => (
                  <button key={v} onClick={() => { setMethod(v); setError(""); }} className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition ${method === v ? "border-saffron bg-saffron-50" : "border-paper-300 bg-white hover:border-ink-300"}`}>
                    <Icon name={icon} className="w-4 h-4" />{l}
                  </button>
                ))}
              </div>
              {method === "UPI" && (
                <div className="space-y-4 max-w-sm">
                  <h3 className="font-display font-semibold">UPI Payment</h3>
                  <div><label className="label">UPI ID</label><input className="input" value={upi} onChange={(e) => setUpi(e.target.value)} /></div>
                  <AmountLine total={total} />
                  <button className="btn-accent w-full !py-2.5" onClick={pay}>Pay {total}</button>
                </div>
              )}
              {method === "CARD" && (
                <div className="space-y-4 max-w-md">
                  <h3 className="font-display font-semibold">Card Payment</h3>
                  <div><label className="label">Card number</label>
                    <input className="input num" inputMode="numeric" autoComplete="off" value={card.number}
                      onChange={(e) => setCard({ ...card, number: e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ") })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">Expiry (MM/YY)</label><input className="input num" autoComplete="off" value={card.expiry}
                      onChange={(e) => setCard({ ...card, expiry: e.target.value.replace(/[^\d]/g, "").slice(0, 4).replace(/^(\d{2})(\d)/, "$1/$2") })} /></div>
                    <div><label className="label">CVV</label><input className="input num" type="password" autoComplete="off" value={card.cvv}
                      onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></div>
                  </div>
                  <AmountLine total={total} />
                  <button className="btn-accent w-full !py-2.5" onClick={pay}>Pay {total}</button>
                  <p className="text-[11px] text-ink-500 flex items-center gap-1"><Icon name="info" className="w-3.5 h-3.5" />Card details are validated in your browser only and are never sent or stored.</p>
                </div>
              )}
              {method === "CASH" && (
                <div className="space-y-4 max-w-sm">
                  <h3 className="font-display font-semibold">Cash Payment</h3>
                  <AmountLine total={total} />
                  <p className="text-sm text-ink-700 rounded-lg bg-paper/70 px-3 py-2">Pay at the canteen counter when collecting your order. Your order joins the queue now; staff mark it paid when they receive the cash.</p>
                  <button className="btn-primary w-full !py-2.5" onClick={pay}>Confirm Pay at Counter</button>
                </div>
              )}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-paper-200">
                {ps !== "CANCELLED"
                  ? <ConfirmButton className="btn-ghost text-sm text-ink-500" title="Cancel this payment?" message="Your order will wait unpaid (not in the queue). You can pay later from My Orders." confirmLabel="Cancel payment" onConfirm={cancelPayment}>Cancel payment</ConfirmButton>
                  : <span />}
                <button className="btn-ghost text-sm" onClick={() => nav("/student/orders")}>Pay later</button>
              </div>
            </>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Order summary">
            <div className="divide-y divide-paper-200 text-sm">
              {order.items.map((i) => <div key={i.food_id} className="flex justify-between py-1.5"><span>{i.qty} × {i.name}</span><span className="num">{rupee(i.qty * i.price)}</span></div>)}
              <div className="flex justify-between py-2 font-semibold text-base"><span>Total</span><span className="num">{total}</span></div>
            </div>
            <div className="text-xs text-ink-500 space-y-1 mt-2">
              <div>Selected method: <b>{method}</b></div>
              <div>Payment status: <Badge status={ps} /></div>
              <div>Attempts: <span className="num">{order.payment.attempts || 0}</span></div>
            </div>
          </Card>
          <Card title="Transaction log" bodyClass="px-5 pb-4">
            {log.length === 0 ? <p className="text-xs text-ink-500">No payment attempts yet.</p> : log.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-xs py-1.5 border-b border-paper-200 last:border-0 gap-2">
                <Badge status={l.status} /><span className="num truncate flex-1 text-right">{l.txn_id || l.method}</span><span className="text-ink-500">{fmtDateTime(l.at)}</span>
              </div>
            ))}
          </Card>
          <div className="rounded-xl border border-dashed border-paper-300 p-4 text-xs text-ink-500">
            <div className="label">Dummy gateway test values</div>
            UPI ID ending in <b className="num">@fail</b> → declined.<br />Card <b className="num">4000 0000 0000 0002</b> → declined.<br />Any other valid input → success.
          </div>
        </div>
      </div>
    </>
  );
}

const Info = ({ label, value, wide }) => (
  <div className={`rounded-lg bg-paper/70 border border-paper-300/60 px-3 py-2 ${wide ? "col-span-2" : ""}`}>
    <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-500">{label}</div>
    <div className="num font-semibold mt-0.5 break-all">{value}</div>
  </div>
);
const AmountLine = ({ total }) => (
  <div className="flex items-center justify-between rounded-lg bg-paper/70 px-3 py-2"><span className="text-sm text-ink-500">Amount</span><span className="num text-xl font-semibold">{total}</span></div>
);
export { PAYABLE };
