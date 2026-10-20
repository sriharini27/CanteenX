import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth, HOME } from "./context/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import StudentDashboard from "./pages/student/Dashboard";
import Menu from "./pages/student/Menu";
import Cart from "./pages/student/Cart";
import Checkout from "./pages/student/Checkout";
import Payment from "./pages/student/Payment";
import MyOrders from "./pages/student/Orders";
import Rewards from "./pages/student/Rewards";
import StaffDashboard from "./pages/staff/Dashboard";
import StaffOrders from "./pages/staff/Orders";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminOrders from "./pages/admin/Orders";
import MenuManagement from "./pages/admin/MenuManagement";
import Inventory from "./pages/admin/Inventory";
import QueueManagement from "./pages/admin/QueueManagement";
import WasteManagement from "./pages/admin/WasteManagement";
import DemandPrediction from "./pages/admin/DemandPrediction";
import Simulation from "./pages/admin/Simulation";
import Reports from "./pages/admin/Reports";

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={HOME[user.role]} /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to={HOME[user.role]} /> : <Register />} />

      <Route element={<ProtectedRoute roles={["STUDENT"]} />}>
        <Route element={<Layout />}>
          <Route path="/student/dashboard" element={<StudentDashboard />} />
          <Route path="/student/menu" element={<Menu />} />
          <Route path="/student/cart" element={<Cart />} />
          <Route path="/student/checkout" element={<Checkout />} />
          <Route path="/student/payment/:orderId" element={<Payment />} />
          <Route path="/student/orders" element={<MyOrders />} />
          <Route path="/student/rewards" element={<Rewards />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={["STAFF"]} />}>
        <Route element={<Layout />}>
          <Route path="/staff/dashboard" element={<StaffDashboard />} />
          <Route path="/staff/orders" element={<StaffOrders />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
        <Route element={<Layout />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/orders" element={<AdminOrders />} />
          <Route path="/admin/menu" element={<MenuManagement />} />
          <Route path="/admin/inventory" element={<Inventory />} />
          <Route path="/admin/queue" element={<QueueManagement />} />
          <Route path="/admin/waste" element={<WasteManagement />} />
          <Route path="/admin/demand" element={<DemandPrediction />} />
          <Route path="/admin/simulation" element={<Simulation />} />
          <Route path="/admin/reports" element={<Reports />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={user ? HOME[user.role] : "/login"} replace />} />
    </Routes>
  );
}
