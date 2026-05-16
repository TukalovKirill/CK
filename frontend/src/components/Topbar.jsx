import { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth, hasPermission } from "../context/AuthContext";
import useAMLNotifications from "../hooks/useAMLNotifications";
import { CoinsIcon, HomeIcon } from "./Icons";
import { NAV_GROUPS } from "./Sidebar";
import { Bell, LogOut, ChevronDown } from "lucide-react";

function TopbarNavItem({ to, icon: Icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `topbar-nav-link ${isActive ? "active" : ""}`
      }
    >
      {Icon && <Icon size={18} />}
      <span>{label}</span>
    </NavLink>
  );
}

function TopbarNavGroup({ group, user }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  const visibleLinks = group.links.filter(
    (l) => !l.permission || hasPermission(user, l.permission),
  );

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (visibleLinks.length === 0) return null;

  if (visibleLinks.length === 1) {
    return (
      <TopbarNavItem
        to={visibleLinks[0].to}
        icon={group.icon}
        label={group.label}
      />
    );
  }

  const Icon = group.icon;
  const isActive = visibleLinks.some((l) => location.pathname.startsWith(l.to));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`topbar-nav-link ${isActive ? "active" : ""}`}
      >
        <Icon size={18} />
        <span>{group.label}</span>
        <ChevronDown
          size={12}
          className="transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      {open && (
        <div className="topbar-dropdown">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `topbar-dropdown-item ${isActive ? "active" : ""}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const initial = (user?.first_name?.[0] || user?.email?.[0] || "U").toUpperCase();
  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name?.[0] ? user.last_name[0] + "." : ""}`.trim()
    : user?.email?.split("@")[0] || "";
  const roleTitle = user?.org_role_title || "";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg btn-ghost"
      >
        <div className="topbar-avatar">{initial}</div>
        <div className="flex flex-col items-start text-sm leading-tight">
          <span className="font-medium" style={{ color: "var(--n-fg)" }}>{displayName}</span>
          {roleTitle && (
            <span className="text-xs" style={{ color: "var(--n-muted)" }}>{roleTitle}</span>
          )}
        </div>
        <ChevronDown
          size={14}
          className="transition-transform"
          style={{
            color: "var(--n-muted)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      {open && (
        <div className="topbar-dropdown" style={{ right: 0, left: "auto", minWidth: "160px" }}>
          <NavLink
            to="/profile"
            onClick={() => setOpen(false)}
            className="topbar-dropdown-item"
          >
            Профиль
          </NavLink>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="topbar-dropdown-item w-full text-left"
            style={{ color: "var(--n-accent)" }}
          >
            Выйти из аккаунта
          </button>
        </div>
      )}
    </div>
  );
}

export default function Topbar({ onToggleSidebar, isAdmin, isMobile }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pendingCount } = useAMLNotifications();
  const coinBalance = user?.coin_balance ?? 0;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const showAdminTopbar = isAdmin || isMobile;

  if (showAdminTopbar) {
    return (
      <header className="app-topbar px-4">
        <button onClick={onToggleSidebar} className="logo-toggle">
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
            style={{ padding: 0 }}
            onClick={() => navigate("/shop/coins?tab=aml")}
            title="Подозрительные операции"
          >
            <Bell size={28} strokeWidth={2} />
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
            onClick={handleLogout}
            className="w-10 h-10 flex items-center justify-center rounded-lg btn-ghost"
            style={{ padding: 0 }}
            title="Выйти"
          >
            <LogOut size={28} strokeWidth={2} />
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="app-topbar topbar-employee px-4">
      <NavLink to="/profile" className="logo-toggle">
        <span className="text-white font-extrabold text-[0.5rem] leading-tight text-center uppercase select-none">
          Своя<br />Компа-<br />ния
        </span>
      </NavLink>

      <nav className="topbar-nav">
        <TopbarNavItem to="/profile" icon={HomeIcon} label="Главная" end />
        {NAV_GROUPS.map((group) => (
          <TopbarNavGroup key={group.key} group={group} user={user} />
        ))}
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button
          className="w-10 h-10 flex items-center justify-center rounded-lg btn-ghost relative"
          style={{ padding: 0 }}
          onClick={() => navigate("/shop/coins?tab=aml")}
          title="Уведомления"
        >
          <Bell size={22} strokeWidth={2} />
          {pendingCount > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: "#ef4444" }}
            >
              {pendingCount > 99 ? "99+" : pendingCount}
            </span>
          )}
        </button>

        <UserMenu user={user} onLogout={handleLogout} />
      </div>
    </header>
  );
}
