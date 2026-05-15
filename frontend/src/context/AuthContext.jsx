import { createContext, useContext, useEffect, useState } from "react";
import axiosInstance from "../api/axiosInstance";
import { login as apiLogin, logout as apiLogout, refreshToken as apiRefresh } from "../api/auth";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = async () => {
    const res = await axiosInstance.get("me/");
    setUser(res.data);
  };

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        await fetchMe();
      } catch {
        const refreshed = await apiRefresh();
        if (refreshed) {
          try {
            await fetchMe();
          } catch {
            apiLogout();
          }
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = async (email, password) => {
    await apiLogin(email, password);
    await fetchMe();
  };

  const logout = () => {
    apiLogout();
    localStorage.removeItem("devContext");
    setUser(null);
  };

  const reloadMe = async () => {
    setLoading(true);
    await fetchMe();
    setLoading(false);
  };

  const updateCoinBalance = (newBalance) => {
    setUser((prev) => prev ? { ...prev, coin_balance: newBalance } : prev);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, reloadMe, updateCoinBalance }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function hasPermission(user, code) {
  if (!user) return false;
  if (user.permissions === null) return true;
  if (!user.permissions) return false;
  return user.permissions.includes(code);
}

export function getUserUnitsForPermission(user, code) {
  if (!user?.unit_permissions) return null;
  return Object.entries(user.unit_permissions)
    .filter(([, codes]) => codes.includes(code))
    .map(([unitId]) => Number(unitId));
}

export function hasPermissionInUnit(user, code, unitId) {
  if (!user?.unit_permissions) return true;
  const codes = user.unit_permissions[String(unitId)];
  return codes?.includes(code) ?? false;
}
