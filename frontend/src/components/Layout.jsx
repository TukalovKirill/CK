import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Topbar from "./Topbar";
import Sidebar from "./Sidebar";
import Footer from "./Footer";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toggleSidebar = () => {
    if (isMobile) {
      setSidebarOpen((o) => !o);
    } else {
      setCollapsed((c) => !c);
    }
  };

  const closeMobileSidebar = () => setSidebarOpen(false);

  const marginLeft = isMobile ? 0 : collapsed ? "4rem" : "14rem";

  return (
    <div className="app-shell">
      <Topbar onToggleSidebar={toggleSidebar} />
      <Sidebar
        open={sidebarOpen}
        collapsed={collapsed}
        onNavigate={closeMobileSidebar}
      />
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
