import { Navigate } from "react-router-dom";
import { useAuth, hasPermission } from "../context/AuthContext";

export default function RequirePermission({ code, children }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user || !hasPermission(user, code)) return <Navigate to="/profile" replace />;

  return children;
}
