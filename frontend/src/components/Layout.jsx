import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Topbar from "./Topbar";
import Sidebar from "./Sidebar";
import Footer from "./Footer";
import { useAuth } from "../context/AuthContext";
import { useRealtimeContext } from "../context/RealtimeContext";

export default function Layout() {
  const { user, updateCoinBalance } = useAuth();
  const { subscribe } = useRealtimeContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const isAdmin = user?.is_admin_role || user?.permissions === null;

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!user) return;
    return subscribe((data) => {
      if (data.entity === "coin_balance" && data.target_user_id === user.id) {
        updateCoinBalance(data.balance);
      }
    });
  }, [subscribe, user?.id, updateCoinBalance]);

  const toggleSidebar = () => {
    if (isMobile) {
      setSidebarOpen((o) => !o);
    } else if (isAdmin) {
      setCollapsed((c) => !c);
    }
  };

  const closeMobileSidebar = () => setSidebarOpen(false);

  const showSidebar = isAdmin || isMobile;
  const marginLeft = isMobile ? 0 : isAdmin ? (collapsed ? "4rem" : "14rem") : 0;

  return (
    <div className="app-shell">
      <Topbar onToggleSidebar={toggleSidebar} isAdmin={isAdmin} isMobile={isMobile} />
      {showSidebar && (
        <Sidebar
          open={sidebarOpen}
          collapsed={collapsed}
          onNavigate={closeMobileSidebar}
        />
      )}
      <main
        className="app-main transition-[margin] duration-300"
        style={{ marginLeft }}
      >
        <Outlet />
        <Footer />
      </main>
    </div>
  );
}
