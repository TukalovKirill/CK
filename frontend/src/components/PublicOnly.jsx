import { Navigate } from "react-router-dom";

export default function PublicOnly({ children }) {
  const token = localStorage.getItem("accessToken");
  if (token) return <Navigate to="/profile" replace />;
  return children;
}
