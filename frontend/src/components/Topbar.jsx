import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Menu, LogOut, Bell, Coins } from "lucide-react";
import { useState } from "react";

export default function Topbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [rotated, setRotated] = useState(false);

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
        <span
          className="text-xl font-bold cursor-pointer"
          style={{ color: "var(--n-accent)" }}
          onClick={() => navigate("/profile")}
        >
          CK
        </span>
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
        <button
          className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg btn-ghost relative"
          onClick={() => navigate("/notifications")}
        >
          <Bell size={18} />
        </button>
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
