import React from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useAuth } from "../context/AuthContext";

const Layout = ({ children }) => {
  const { authEpoch } = useAuth();
  return (
    <div className="app-shell" key={authEpoch}>
      <Sidebar />
      <main className="app-content">
        <Topbar />
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
