import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("canteenx.token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes("/auth/login")) {
      localStorage.removeItem("canteenx.token");
      localStorage.removeItem("canteenx.user");
      if (!location.pathname.startsWith("/login")) location.href = "/login?expired=1";
    }
    return Promise.reject(err);
  }
);

// Image URLs from MongoDB are either Flask paths (/uploads/...) or absolute http(s) URLs.
const API_ORIGIN = (import.meta.env.VITE_API_URL || "").replace(/\/api\/?$/, "");
export const assetUrl = (u) => (!u ? "" : /^https?:\/\//.test(u) ? u : `${API_ORIGIN}${u}`);

export const errMsg = (e) => e?.response?.data?.error || e?.message || "Something went wrong";
const get = (url, params) => api.get(url, { params }).then((r) => r.data);
const post = (url, body) => api.post(url, body).then((r) => r.data);
const put = (url, body) => api.put(url, body).then((r) => r.data);

export const Auth = {
  login: (b) => post("/auth/login", b),
  register: (b) => post("/auth/register", b),
  me: () => get("/auth/me"),
  config: () => get("/auth/config"),
  google: (credential) => post("/auth/google", { credential }),
};
export const Uploads = {
  foodImage: (file) => {
    const fd = new FormData();
    fd.append("image", file);
    return api.post("/uploads/food-image", fd).then((r) => r.data.url);
  },
};
export const Foods = {
  list: (p) => get("/foods", p),
  create: (b) => post("/foods", b),
  update: (id, b) => put(`/foods/${id}`, b),
  remove: (id) => api.delete(`/foods/${id}`).then((r) => r.data),
  toggle: (id) => api.patch(`/foods/${id}/availability`).then((r) => r.data),
  inventory: (p) => get("/foods/inventory/today", p),
  setStock: (id, prepared) => put(`/foods/${id}/stock`, { prepared }),
  applyRecommended: (buffer_pct) => post("/foods/inventory/apply-recommended", { buffer_pct }),
  closeDay: () => post("/foods/inventory/close-day", {}),
};
export const Orders = {
  list: (p) => get("/orders", p),
  get: (id) => get(`/orders/${id}`),
  place: (b) => post("/orders", b),
  setStatus: (id, status) => put(`/orders/${id}/status`, { status }),
  cancel: (id) => post(`/orders/${id}/cancel`, {}),
};
export const Payments = {
  quote: (b) => post("/payments/quote", b),
  list: () => get("/payments"),
  pay: (orderId, b) => post(`/payments/${orderId}/pay`, b),          // dummy gateway; card numbers are never sent
  cancel: (orderId) => post(`/payments/${orderId}/cancel`, {}),
  confirmCash: (orderId) => post(`/payments/${orderId}/confirm-cash`, {}),
  forOrder: (orderId) => get(`/payments/order/${orderId}`),
};
export const Rewards = {
  get: () => get("/rewards"),
  spin: () => post("/rewards/spin", {}),
  toggleSubscription: () => post("/rewards/subscription", {}),
};
export const Queue = {
  status: () => get("/queue/status"),
  live: () => get("/queue/live"),
  workload: () => get("/queue/workload"),
  events: () => get("/queue/events"),
  counters: () => get("/queue/counters"),
  addCounter: (b) => post("/queue/counters", b),
  updateCounter: (id, b) => put(`/queue/counters/${id}`, b),
  removeCounter: (id) => api.delete(`/queue/counters/${id}`).then((r) => r.data),
};
export const Waste = {
  list: (p) => get("/waste", p),
  create: (b) => post("/waste", b),
  remove: (id) => api.delete(`/waste/${id}`).then((r) => r.data),
};
export const Demand = {
  prediction: (p) => get("/demand/prediction", p),
  history: (id) => get(`/demand/history/${id}`),
  peakHours: () => get("/demand/peak-hours"),
  backtest: (p) => get("/demand/backtest", p),
  rebuild: () => post("/demand/rebuild", {}),
};
export const Sim = {
  defaults: () => get("/simulation/defaults"),
  run: (b) => post("/simulation/run", b),
  compare: (b) => post("/simulation/compare", b),
  runs: (p) => get("/simulation/runs", p),
  removeRun: (id) => api.delete(`/simulation/runs/${id}`).then((r) => r.data),
  beforeAfter: (b) => post("/optimization/before-after", b),
  latest: () => get("/optimization/latest"),
};
export const Admin = {
  dashboard: () => get("/admin/dashboard"),
  report: (kind, p) => get(`/reports/${kind}`, p),
};
export const Student = { dashboard: () => get("/student/dashboard") };
export default api;
