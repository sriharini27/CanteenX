import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { Payments, Orders, Foods, errMsg } from "../../services/api";
import { PageHeader, Card, Loading, ErrorBox, Icon, Spinner, rupee } from "../../components/ui";

export const METHODS = [
  ["UPI", "UPI", "phone", "Pay with any UPI app (dummy gateway)"],
  ["CARD", "Card", "card", "Debit / credit card (dummy gateway)"],
  ["CASH", "Cash at counter", "cash", "Pay when you collect your order"],
];

/** Checkout = review bill + choose method. The order is created as AWAITING_PAYMENT and the
    student is sent to /student/payment/:orderId — it only joins the queue after payment. */
export default function Checkout() {
  const cart = useCart();
  const nav = useNavigate();
  const [usePoints, setUsePoints] = useState(false);
  const [method, setMethod] = useState("UPI");
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { Foods.list().then(cart.sync).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cart.items.length) return;
    Payments.quote({ items: cart.payload, use_points: usePoints }).then(setQuote).catch((e) => setError(errMsg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usePoints, cart.items]);

  const proceed = async () => {
    setBusy(true); setError("");
    try {
      const order = await Orders.place({ items: cart.payload, payment_method: method, use_points: usePoints });
      cart.clear();
      nav(`/student/payment/${order.id}`, { replace: true });
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  };

  if (!cart.items.length && !busy) return <Navigate to="/student/cart" replace />;

  return (
    <>
      <PageHeader eyebrow="Student" title="Checkout" subtitle="Review your bill and choose how to pay. Payments are simulated — no real money moves." />
      <ErrorBox error={error} />
      {!quote ? <Loading label="Calculating your bill…" /> : (
        <div className="grid lg:grid-cols-3 gap-6 mt-4">
          <div className="lg:col-span-2 space-y-6">
            <Card title="Order summary">
              <div className="divide-y divide-paper-200">
                {quote.items.map((i) => (
                  <div key={i.food_id} className="flex justify-between py-2 text-sm"><span>{i.qty} × {i.name}</span><span className="num">{rupee(i.qty * i.price)}</span></div>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-paper/70 px-3 py-2 text-xs text-ink-700 flex items-center gap-2">
                <Icon name="clock" />Estimated waiting time once paid: <b className="num">{Math.round(quote.est_wait_min)} min</b> (work time {quote.work_min} min)
              </div>
            </Card>
            <Card title="Select payment method" subtitle="You will complete the payment on the next screen">
              <div className="grid sm:grid-cols-3 gap-3">
                {METHODS.map(([v, l, icon, hint]) => (
                  <button key={v} onClick={() => setMethod(v)} className={`text-left rounded-xl border-2 p-3 transition ${method === v ? "border-saffron bg-saffron-50" : "border-paper-300 bg-white hover:border-ink-300"}`}>
                    <Icon name={icon} className="w-5 h-5" /><div className="font-semibold mt-2">{l}</div><div className="text-[11px] text-ink-500">{hint}</div>
                  </button>
                ))}
              </div>
            </Card>
          </div>
          <Card title="Bill">
            <Row label="Subtotal" value={rupee(quote.subtotal)} />
            {quote.discounts.birthday > 0 && <Row label="🎂 Birthday treat" value={`− ${rupee(quote.discounts.birthday)}`} good />}
            {quote.discounts.subscription > 0 && <Row label="Mess subscription (20%)" value={`− ${rupee(quote.discounts.subscription)}`} good />}
            {quote.discounts.points > 0 && <Row label={`Points (${quote.points_redeemed})`} value={`− ${rupee(quote.discounts.points)}`} good />}
            <div className="flex justify-between text-xl font-semibold py-3 border-t border-paper-200 mt-2"><span>Total</span><span className="num">{rupee(quote.total)}</span></div>
            {quote.available_points > 0 && (
              <label className="flex items-center gap-2 text-sm rounded-lg border border-paper-300 px-3 py-2 cursor-pointer">
                <input type="checkbox" className="accent-saffron" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} />
                Redeem my {quote.available_points} points <span className="text-xs text-ink-500">(10 pts = ₹1)</span>
              </label>
            )}
            <div className="text-xs text-ink-500 mt-2">You'll earn <b className="num">{quote.points_earned}</b> points once the payment succeeds.</div>
            <button className="btn-accent w-full mt-4 !py-2.5" disabled={busy} onClick={proceed}>
              {busy ? <><Spinner className="w-4 h-4" />Creating order…</> : <>Continue to payment <Icon name="arrowUp" className="w-4 h-4 rotate-90" /></>}
            </button>
          </Card>
        </div>
      )}
    </>
  );
}

const Row = ({ label, value, good }) => (
  <div className="flex justify-between text-sm py-1"><span className="text-ink-500">{label}</span><span className={`num ${good ? "text-after font-semibold" : ""}`}>{value}</span></div>
);
