import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { errMsg } from "../services/api";
import { Spinner, Icon } from "../components/ui";
import GoogleSignIn from "../components/GoogleSignIn";

const DEMO = [["Admin", "admin", "admin123"], ["Staff", "staff", "staff123"], ["Student", "student", "student123"], ["Birthday student", "birthday", "birthday123"]];

export function AuthShell({ children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden lg:flex flex-col justify-between bg-ink text-white p-12 relative overflow-hidden">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-saffron/20 blur-3xl" />
        <div className="flex items-center gap-3 relative">
          <div className="h-10 w-10 rounded-lg bg-saffron flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 17h16M6 13a6 6 0 0 1 12 0M12 5v2" /></svg>
          </div>
          <span className="font-display text-2xl font-bold">CanteenX</span>
        </div>
        <div className="relative">
          <div className="text-[11px] uppercase tracking-[0.25em] text-saffron mb-4">Simulation Using Modern Tools</div>
          <h1 className="font-display text-4xl xl:text-5xl font-bold leading-[1.05]">College canteen operations, <span className="text-saffron">measured</span> and optimised.</h1>
          <p className="mt-5 text-ink-300 max-w-md">Live queue tracking, discrete-event simulation and demand forecasting to cut student waiting time and food waste.</p>
          <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
            {[["Queue", "M/M/c + DES"], ["Demand", "WMA forecast"], ["Waste", "Prep optimiser"]].map(([a, b]) => (
              <div key={a} className="border-l-2 border-saffron/60 pl-3"><div className="font-semibold">{a}</div><div className="text-xs text-ink-300">{b}</div></div>
            ))}
          </div>
        </div>
        <div className="text-xs text-ink-500 relative"></div>
      </div>
      <div className="flex items-center justify-center p-6">{children}</div>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [params] = useSearchParams();
  const [f, setF] = useState({ username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("expired") ? "Your session expired — please log in again." : "");

  const submit = async (e) => {
    e.preventDefault();
    if (!f.username || !f.password) return setError("Enter your username and password");
    setBusy(true); setError("");
    try { await login(f.username.trim(), f.password); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm">
        <h2 className="text-3xl font-bold">Welcome back</h2>
        <p className="text-sm text-ink-500 mt-1">Sign in to order food or run the canteen.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div><label className="label">Username or email</label><input className="input" autoFocus value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
          <div><label className="label">Password</label><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          {error && <div className="text-sm text-before flex items-center gap-2"><Icon name="alert" />{error}</div>}
          <button className="btn-primary w-full !py-2.5" disabled={busy}>{busy && <Spinner className="w-4 h-4" />}Sign in</button>
        </form>
        <div className="flex items-center gap-3 my-5"><div className="h-px flex-1 bg-paper-300" /><span className="text-xs font-semibold text-ink-500">OR</span><div className="h-px flex-1 bg-paper-300" /></div>
        <GoogleSignIn onError={setError} />
        <p className="text-[11px] text-ink-500 text-center mt-2">New Google users get a student account automatically.</p>
        <p className="text-sm text-ink-500 mt-4">New student? <Link to="/register" className="text-saffron-600 font-semibold">Create an account</Link></p>
        <div className="mt-8 rounded-xl border border-dashed border-paper-300 p-4">
          <div className="label">Demo accounts</div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {DEMO.map(([label, u, p]) => (
              <button key={u} type="button" onClick={() => setF({ username: u, password: p })} className="text-left rounded-lg bg-white border border-paper-300 px-3 py-2 hover:border-saffron transition">
                <div className="text-xs font-semibold">{label}</div><div className="text-[11px] text-ink-500 num">{u} / {p}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
