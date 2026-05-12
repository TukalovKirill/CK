import { useState, useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import { useAuth, hasPermission } from "../context/AuthContext";
import {
  BookOpen, Settings, Users, MapPin, User, Bell,
  ChevronDown, ClipboardList, ShoppingBag,
} from "lucide-react";

const NAV_GROUPS = [
  {
    key: "textbooks",
    label: "Учебники",
    icon: BookOpen,
    links: [
      { to: "/textbooks", label: "Просмотр", permission: "textbooks.view" },
      { to: "/textbooks/manage", label: "Управление", permission: "textbooks.edit" },
    ],
  },
  {
    key: "quizzes",
    label: "Тесты",
    icon: ClipboardList,
    links: [
      { to: "/quizzes", label: "Мои тесты", permission: "quizzes.take" },
      { to: "/quizzes/results", label: "Результаты", permission: "quizzes.view_stats" },
      { to: "/quizzes/settings", label: "Настройки", permission: "quizzes.manage_templates" },
    ],
  },
  {
    key: "shop",
    label: "Магазин",
    icon: ShoppingBag,
    links: [
      { to: "/shop", label: "Витрина", permission: "shop.view" },
      { to: "/shop/my-items", label: "Мои товары", permission: "shop.view" },
      { to: "/shop/history", label: "История", permission: "shop.view" },
      { to: "/shop/manage", label: "Управление", permission: "shop.edit" },
      { to: "/shop/assignments", label: "Распределение", permission: "shop.edit" },
      { to: "/shop/coins", label: "Коины", permission: "shop.manage_coins" },
      { to: "/shop/orders", label: "Заказы", permission: "shop.manage_orders" },
      { to: "/shop/aml", label: "AML", permission: "shop.review_flagged" },
    ],
  },
  {
    key: "company",
    label: "Компания",
    icon: Settings,
    links: [
      { to: "/company-settings", label: "Оргструктура", permission: "org.view" },
      { to: "/team", label: "Команда", permission: "team.view" },
      { to: "/zones", label: "Зоны", permission: "org.view" },
    ],
  },
];

const STANDALONE_LINKS = [
  { to: "/profile", label: "Профиль", icon: User, permission: null },
];

function NavItem({ to, label, icon: Icon, collapsed, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
          isActive
            ? "font-medium"
            : ""
        }`
      }
      style={({ isActive }) => ({
        color: isActive ? "var(--n-accent)" : "var(--n-muted)",
        background: isActive ? "var(--n-hover)" : "transparent",
        boxShadow: isActive ? "inset 3px 0 0 var(--n-accent)" : "none",
      })}
    >
      {Icon && <Icon size={20} className="shrink-0" />}
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

function GroupAccordion({ group, collapsed, onNavigate }) {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [popupPos, setPopupPos] = useState(null);
  const contentRef = useRef(null);
  const iconRef = useRef(null);

  const visibleLinks = group.links.filter(
    (l) => !l.permission || hasPermission(user, l.permission),
  );

  useEffect(() => {
    const hasActive = visibleLinks.some((l) => location.pathname.startsWith(l.to));
    if (hasActive && !collapsed) setOpen(true);
  }, [location.pathname, collapsed]);

  if (visibleLinks.length === 0) return null;

  const Icon = group.icon;

  if (collapsed) {
    const handleClick = () => {
      if (!iconRef.current) return;
      const r = iconRef.current.getBoundingClientRect();
      setPopupPos({ top: r.top, left: r.right + 8 });
    };

    return (
      <div className="relative">
        <button
          ref={iconRef}
          onClick={handleClick}
          className="w-full flex items-center justify-center py-2.5 rounded-lg btn-ghost"
        >
          <Icon size={20} />
        </button>
        {popupPos &&
          createPortal(
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setPopupPos(null)} />
              <div
                className="fixed z-[9999] min-w-[200px] rounded-lg py-1 dropdown-scroll"
                style={{
                  top: popupPos.top,
                  left: popupPos.left,
                  background: "var(--n-panel)",
                  border: "1px solid var(--n-border)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                }}
              >
                <div className="px-3 py-1.5 text-xs font-semibold" style={{ color: "var(--n-muted)" }}>
                  {group.label}
                </div>
                {visibleLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={() => { setPopupPos(null); onNavigate?.(); }}
                    className="block px-3 py-2 text-sm transition-colors"
                    style={({ isActive }) => ({
                      color: isActive ? "var(--n-accent)" : "var(--n-fg)",
                    })}
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </>,
            document.body,
          )}
      </div>
    );
  }

  const contentHeight = open && contentRef.current ? contentRef.current.scrollHeight : 0;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm btn-ghost"
      >
        <Icon size={20} className="shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          size={14}
          className="shrink-0 transition-transform"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-[height] duration-300"
        style={{ height: contentHeight }}
      >
        <div className="pl-4 pt-0.5 space-y-0.5">
          {visibleLinks.map((link) => (
            <NavItem key={link.to} to={link.to} label={link.label} onClick={onNavigate} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ open, collapsed, onNavigate }) {
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (window.innerWidth < 768 && open) {
      onNavigate?.();
    }
  }, [location.pathname]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onNavigate}
        />
      )}

      <aside
        className={`fixed top-20 bottom-0 left-0 z-40 flex flex-col transition-all duration-300 overflow-y-auto no-scrollbar ${
          collapsed ? "w-16" : "w-56"
        } ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        style={{
          background: "var(--n-panel)",
          borderRight: "1px solid var(--n-border)",
        }}
      >
        <nav className="flex-1 p-2 space-y-1">
          {NAV_GROUPS.map((group) => (
            <GroupAccordion
              key={group.key}
              group={group}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}

          <div className="my-2" style={{ borderTop: "1px solid var(--n-border)" }} />

          {STANDALONE_LINKS.map((link) => {
            if (link.permission && !hasPermission(user, link.permission)) return null;
            return (
              <NavItem
                key={link.to}
                to={link.to}
                label={link.label}
                icon={link.icon}
                collapsed={collapsed}
                onClick={onNavigate}
              />
            );
          })}
        </nav>
      </aside>
    </>
  );
}
