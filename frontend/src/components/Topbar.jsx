import React from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Bell } from "lucide-react";

const pageTitles = {
  "/dashboard": "Dashboard",
  "/reporting-dashboard": "Dashboard",
  "/reviewing-dashboard": "Dashboard",
  "/accepting-dashboard": "Dashboard",
  "/admin-dashboard": "Admin Panel",
  "/goals": "Annual Goal Setting",
  "/tracking": "Six-Month Tracking",
  "/reviews": "Year-End Reviews",
};

const Topbar = () => {
  const { user } = useAuth();
  const location = useLocation();
  const title = pageTitles[location.pathname] || "e-PMS";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">{title}</h1>
        <p className="topbar-date">{today}</p>
      </div>
      <div className="topbar-right">
        <button className="topbar-icon-btn" title="Notifications">
          <Bell size={18} />
        </button>
        <div className="topbar-user-pill">
          <div className="topbar-avatar">
            {user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "U"}
          </div>
          <div>
            <div className="topbar-name">{user?.name}</div>
            <div className="topbar-role">{user?.role}</div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
