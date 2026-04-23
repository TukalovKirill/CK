import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth, hasPermission } from "../context/AuthContext";
import { LogOut, Users, Building2, BookOpen, User } from "lucide-react";

const NAV_ITEMS = [
  { path: "/profile", label: "Профиль", icon: User, permission: null },
  { path: "/team", label: "Команда", icon: Users, permission: "team.view" },
  { path: "/org", label: "Структура", icon: Building2, permission: "org.view" },
  { path: "/textbooks", label: "Учебники", icon: BookOpen, permission: "textbooks.view" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-lg">CK</span>
          <nav className="flex gap-1">
            {NAV_ITEMS.map((item) => {
              if (item.permission && !hasPermission(user, item.permission)) return null;
              const active = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm ${
                    active
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <item.icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button
            onClick={logout}
            className="text-gray-400 hover:text-red-500 transition-colors"
            title="Выйти"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
