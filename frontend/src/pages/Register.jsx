import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { errMsg } from "../services/api";
import { Spinner, Icon } from "../components/ui";
import { AuthShell } from "./Login";

export default function Register() {
  const { register } = useAuth();
  const [f, setF] = useState({ name: "", username: "", password: "", confirm: "", email: "", date_of_birth: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim() || !f.username.trim()) return setError("Name and username are required");
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(f.username)) return setError("Username: 3-30 letters, digits, _ or .");
    if (f.password.length < 6) return setError("Password must be at least 6 characters");
    if (f.password !== f.confirm) return setError("Passwords do not match");
    setBusy(true); setError("");
    try { await register({ name: f.name, username: f.username, password: f.password, email: f.email || null, date_of_birth: f.date_of_birth || null }); }
    catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm">
        <h2 className="text-3xl font-bold">Create student account</h2>
        <p className="text-sm text-ink-500 mt-1">Add your birthday to unlock a ₹50 birthday treat.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div><label className="label">Full name</label><input className="input" value={f.name} onChange={set("name")} /></div>
          <div><label className="label">Username</label><input className="input" value={f.username} onChange={set("username")} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Password</label><input className="input" type="password" value={f.password} onChange={set("password")} /></div>
            <div><label className="label">Confirm</label><input className="input" type="password" value={f.confirm} onChange={set("confirm")} /></div>
          </div>
          <div><label className="label">Email (optional)</label><input className="input" type="email" value={f.email} onChange={set("email")} /><span className="text-[11px] text-ink-500">Lets you also sign in later with Google using the same email.</span></div>
          <div><label className="label">Date of birth (optional)</label><input className="input" type="date" value={f.date_of_birth} onChange={set("date_of_birth")} /></div>
          {error && <div className="text-sm text-before flex items-center gap-2"><Icon name="alert" />{error}</div>}
          <button className="btn-primary w-full !py-2.5" disabled={busy}>{busy && <Spinner className="w-4 h-4" />}Create account</button>
        </form>
        <p className="text-sm text-ink-500 mt-4">Already registered? <Link to="/login" className="text-saffron-600 font-semibold">Sign in</Link></p>
      </div>
    </AuthShell>
  );
}
