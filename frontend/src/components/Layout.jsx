import React, { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useAuth } from "../context/AuthContext";

const Layout = ({ children }) => {
  const { authEpoch } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className={`app-shell${sidebarOpen ? " sidebar-open" : ""}`} key={authEpoch}>
      <Sidebar isOpen={sidebarOpen} onCloseMobile={closeSidebar} />
      {sidebarOpen && <button className="app-overlay" type="button" aria-label="Close navigation" onClick={closeSidebar} />}
      <main className="app-content">
        <Topbar onToggleSidebar={toggleSidebar} />
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
