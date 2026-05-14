import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Menu, LogOut, Bell, Coins } from "lucide-react";
import { useState } from "react";
import useAMLNotifications from "../hooks/useAMLNotifications";

export default function Topbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [rotated, setRotated] = useState(false);
  const { pendingCount, canReview } = useAMLNotifications();

  const handleToggle = () => {
    setRotated(true);
    onToggleSidebar();
    setTimeout(() => setRotated(false), 300);
  };

  const coinBalance = user?.coin_balance ?? 0;

  return (
    <header className="app-topbar px-4">
      <button
        onClick={handleToggle}
        className={`absolute left-4 w-10 h-10 flex items-center justify-center rounded-lg btn-ghost ${rotated ? "rotate-once" : ""}`}
      >
        <Menu size={22} />
      </button>

      <div className="flex-1 flex justify-center">
        <div
          className="cursor-pointer flex items-center justify-center rounded-lg"
          style={{ background: "#c8102e", width: 40, height: 40, padding: 4 }}
          onClick={() => navigate("/profile")}
        >
          <span className="text-white font-extrabold text-[0.5rem] leading-tight text-center uppercase">Своя<br/>Компа-<br/>ния</span>
        </div>
      </div>

      <div className="absolute right-4 flex items-center gap-2">
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg btn-ghost text-sm font-medium"
          onClick={() => navigate("/shop")}
          title="СК Коины"
        >
          <Coins size={16} style={{ color: "var(--n-accent)" }} />
          <span>{coinBalance}</span>
        </button>
        {canReview && (
          <button
            className="w-10 h-10 flex items-center justify-center rounded-lg btn-ghost relative"
            onClick={() => navigate("/shop/aml")}
            title="AML Мониторинг"
          >
            <Bell size={18} />
            {pendingCount > 0 && (
              <span
                className="absolute top-1 right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: "#ef4444" }}
              >
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </button>
        )}
        <button
          onClick={() => { logout(); navigate("/login"); }}
          className="w-10 h-10 flex items-center justify-center rounded-lg btn-ghost"
          title="Выйти"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
