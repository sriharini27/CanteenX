import { useState } from "react";
import useFetch from "../../hooks/useFetch";
import { Rewards as R, errMsg } from "../../services/api";
import { PageHeader, Card, Loading, ErrorBox, Badge, Table, ConfirmButton, Icon, rupee, fmtDateTime, toast } from "../../components/ui";

const SEGMENTS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const COLORS = ["#E0740F", "#151A21", "#F3A35B", "#2A333F", "#E0740F", "#151A21", "#F3A35B", "#2A333F", "#E0740F", "#2A333F"];

export default function Rewards() {
  const { data, loading, error, reload } = useFetch(R.get, []);
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState(null);

  const spin = async () => {
    setSpinning(true); setWon(null);
    try {
      const r = await R.spin();
      const idx = SEGMENTS.indexOf(r.points);
      const seg = 360 / SEGMENTS.length;
      setAngle((a) => a - (a % 360) + 360 * 5 + (360 - idx * seg - seg / 2));   // land the pointer on the won segment
      setTimeout(() => { setWon(r.points); setSpinning(false); reload(true); toast(r.message); }, 3200);
    } catch (e) { toast(errMsg(e), "error"); setSpinning(false); }
  };
  const toggleSub = async () => { const r = await R.toggleSubscription(); toast(r.is_subscribed ? "Mess subscription active — 20% off every order" : "Subscription cancelled"); reload(true); };

  if (loading && !data) return <Loading />;
  const seg = 360 / SEGMENTS.length;
  const gradient = SEGMENTS.map((_, i) => `${COLORS[i]} ${i * seg}deg ${(i + 1) * seg}deg`).join(",");

  return (
    <>
      <PageHeader eyebrow="Student" title="Rewards" subtitle="Earn 1 point per ₹10 spent. Redeem 10 points = ₹1 at checkout." />
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="card p-6 bg-ink text-white relative overflow-hidden">
            <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-saffron/30 blur-2xl" />
            <div className="text-xs uppercase tracking-[0.2em] text-ink-300">Your balance</div>
            <div className="num text-5xl font-semibold mt-2">{data.points}</div>
            <div className="text-sm text-ink-300 mt-1">points · worth {rupee(data.points_value)}</div>
            {data.birthday_today && <div className="mt-6 rounded-lg bg-saffron px-3 py-2 text-sm font-semibold">🎂 Happy birthday! ₹{data.rules.birthday_off} off your orders today.</div>}
          </div>

          <Card title="Daily spin & win" subtitle="One free spin per day: 10–100 points">
            <div className="flex flex-col items-center">
              <div className="relative h-48 w-48">
                <div className="absolute left-1/2 -top-1 -translate-x-1/2 z-10 h-0 w-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-before" />
                <div className="h-full w-full rounded-full border-4 border-white shadow-lg" style={{ background: `conic-gradient(${gradient})`, transform: `rotate(${angle}deg)`, transition: "transform 3s cubic-bezier(.17,.67,.21,1)" }}>
                  {SEGMENTS.map((s, i) => (
                    <span key={s} className="absolute left-1/2 top-1/2 text-[11px] font-bold text-white num" style={{ transform: `rotate(${i * seg + seg / 2}deg) translateY(-72px) translateX(-50%)`, transformOrigin: "0 0" }}>{s}</span>
                  ))}
                </div>
                <div className="absolute inset-0 m-auto h-10 w-10 rounded-full bg-white shadow flex items-center justify-center"><Icon name="gift" className="w-5 h-5 text-saffron" /></div>
              </div>
              <button className="btn-accent mt-5" disabled={!data.can_spin || spinning} onClick={spin}>{spinning ? "Spinning…" : data.can_spin ? "Spin now" : "Come back tomorrow"}</button>
              {won && <div className="mt-2 text-sm font-semibold text-after">You won {won} points!</div>}
            </div>
          </Card>

          <Card title="Mess subscription" subtitle={`Subscribers get ${data.rules.subscription_pct}% off every order`}>
            <div className="flex items-center gap-2 mb-4"><span className="text-sm text-ink-500">Status</span>{data.is_subscribed ? <Badge status="SUCCESS">Active</Badge> : <Badge>Not subscribed</Badge>}</div>
            <ul className="text-sm text-ink-700 space-y-1.5 mb-5">
              <li className="flex gap-2"><Icon name="check" className="w-4 h-4 text-after mt-0.5" />{data.rules.subscription_pct}% off all meals</li>
              <li className="flex gap-2"><Icon name="check" className="w-4 h-4 text-after mt-0.5" />Stacks with birthday treat & points</li>
              <li className="flex gap-2"><Icon name="check" className="w-4 h-4 text-after mt-0.5" />Cancel anytime (mock subscription)</li>
            </ul>
            <ConfirmButton className={data.is_subscribed ? "btn-outline w-full" : "btn-primary w-full"} title={data.is_subscribed ? "Cancel subscription?" : "Start mess subscription?"}
              message={data.is_subscribed ? "You will lose the 20% discount on future orders." : "This is a simulated subscription — no payment is taken."} onConfirm={toggleSub}>
              {data.is_subscribed ? "Cancel subscription" : "Subscribe now"}
            </ConfirmButton>
            <div className="mt-4 text-xs text-ink-500">Birthday on file: <span className="num">{data.date_of_birth || "not set"}</span></div>
          </Card>

          <Card title="Points history" className="lg:col-span-3" bodyClass="pb-2">
            <Table rows={data.history} empty="No reward activity yet" columns={[
              { key: "created_at", label: "When", render: (r) => fmtDateTime(r.created_at) },
              { key: "type", label: "Type", render: (r) => <Badge>{r.type}</Badge> },
              { key: "note", label: "Details" },
              { key: "points", label: "Points", align: "right", render: (r) => <span className={r.points >= 0 ? "text-after" : "text-before"}>{r.points > 0 ? "+" : ""}{r.points}</span> },
            ]} />
          </Card>
        </div>
      )}
    </>
  );
}
