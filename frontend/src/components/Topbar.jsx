import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useAMLNotifications from "../hooks/useAMLNotifications";
import { CoinsIcon } from "./Icons";
import { Bell, LogOut } from "lucide-react";

export default function Topbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pendingCount, canReview } = useAMLNotifications();

  const coinBalance = user?.coin_balance ?? 0;

  return (
    <header className="app-topbar px-4">
      <button
        onClick={onToggleSidebar}
        className="logo-toggle"
      >
        <span className="text-white font-extrabold text-[0.5rem] leading-tight text-center uppercase select-none">
          Своя<br />Компа-<br />ния
        </span>
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-ghost text-sm font-medium"
          onClick={() => navigate("/shop")}
          title="СК Коины"
        >
          <CoinsIcon size={20} color="var(--n-accent)" />
          <span>{coinBalance}</span>
        </button>
        <button
          className="w-10 h-10 flex items-center justify-center rounded-lg btn-ghost relative"
          onClick={() => navigate("/shop/aml")}
          title="AML Мониторинг"
        >
          <Bell size={32} strokeWidth={2} />
          {pendingCount > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: "#ef4444" }}
            >
              {pendingCount > 99 ? "99+" : pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => { logout(); navigate("/login"); }}
          className="w-10 h-10 flex items-center justify-center rounded-lg btn-ghost"
          title="Выйти"
        >
          <LogOut size={32} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
