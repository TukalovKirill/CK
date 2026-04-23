import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Spinner from "./Spinner";

export default function RequireAuth() {
  const { loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;

  const token = localStorage.getItem("accessToken");
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;

  return <Outlet />;
}
