import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function RequireAdmin() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user?.isAdmin) return <Navigate to="/login" replace />;
  return <Outlet />;
}
