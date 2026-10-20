import { Navigate, Outlet } from "react-router-dom";
import { useAuth, HOME } from "../context/AuthContext";

/** Only lets users with one of `roles` through; others go to their own home page. */
export default function ProtectedRoute({ roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  return <Outlet />;
}
