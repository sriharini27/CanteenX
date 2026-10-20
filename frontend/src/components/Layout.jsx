import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Icon } from "./ui";

// Each role only ever sees its own navigation.
const NAV = {
  STUDENT: [
    ["/student/dashboard", "Dashboard", "dashboard"], ["/student/menu", "Menu", "menu"], ["/student/cart", "Cart", "cart"],
    ["/student/orders", "My Orders", "orders"], ["/student/rewards", "Rewards", "gift"],
  ],
  STAFF: [["/staff/dashboard", "Dashboard", "dashboard"], ["/staff/orders", "Order Board", "orders"]],
  ADMIN: [
    ["/admin/dashboard", "Dashboard", "dashboard"], ["/admin/orders", "Orders", "orders"], ["/admin/menu", "Menu Management", "menu"],
    ["/admin/inventory", "Food Inventory", "box"], ["/admin/queue", "Queue Management", "queue"], ["/admin/waste", "Waste Management", "trash"],
    ["/admin/demand", "Demand Prediction", "chart"], ["/admin/simulation", "Simulation", "sim"], ["/admin/reports", "Reports", "report"],
  ],
};
const ROLE_LABEL = { STUDENT: "Student", STAFF: "Kitchen Staff", ADMIN: "Administrator" };

export default function Layout() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const doLogout = () => { logout(); nav("/login"); };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-saffron flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 17h16M6 13a6 6 0 0 1 12 0M12 5v2" /></svg>
        </div>
        <div>
          <div className="font-display font-bold text-white text-lg leading-none">CanteenX</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink-300 mt-1">SMT Operations</div>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV[user.role].map(([to, label, icon]) => (
          <NavLink key={to} to={to} onClick={() => setOpen(false)}
            className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? "bg-white/10 text-white font-semibold" : "text-ink-300 hover:text-white hover:bg-white/5"}`}>
            <Icon name={icon} className="w-[18px] h-[18px]" />
            <span className="flex-1">{label}</span>
            {to === "/student/cart" && count > 0 && <span className="num text-[11px] bg-saffron text-white rounded-full px-1.5 min-w-[20px] text-center">{count}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-2">
          {user.profile_image
            ? <img src={user.profile_image} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full object-cover" />
            : <div className="h-8 w-8 rounded-full bg-ink-700 flex items-center justify-center text-white text-sm font-semibold">{user.name?.[0]}</div>}
          <div className="min-w-0 flex-1">
            <div className="text-sm text-white truncate">{user.name}</div>
            <div className="text-[11px] text-ink-300">{ROLE_LABEL[user.role]}</div>
          </div>
        </div>
        <button onClick={doLogout} className="mt-1 w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-300 hover:text-white hover:bg-white/5">
          <Icon name="logout" className="w-[18px] h-[18px]" /> Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 bg-ink">{sidebar}</aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 bg-ink/50" onClick={() => setOpen(false)}>
          <aside className="w-64 h-full bg-ink" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 text-white no-print">
        <button onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" className="w-6 h-6" /></button>
        <span className="font-display font-bold">CanteenX</span>
        <span className="w-6" />
      </div>
      <main className="px-4 py-6 md:px-8 md:py-8 max-w-[1400px] mx-auto"><Outlet /></main>
    </div>
  );
}
