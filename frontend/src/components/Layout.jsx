import React from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const Layout = ({ children }) => {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        <Topbar />
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
