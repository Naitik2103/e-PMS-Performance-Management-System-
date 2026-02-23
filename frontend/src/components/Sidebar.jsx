import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Sidebar = () => {
  const { user } = useAuth();
  const role = user?.role;
  return (
    <aside className="sidebar">
      <div className="logo">e-PMS</div>
      <nav>
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/goals">Goals</NavLink>
        <NavLink to="/tracking">Six-Month Tracking</NavLink>
        <NavLink to="/reviews">Year-End Reviews</NavLink>
        {role === "Admin" && <NavLink to="/admin">Admin Panel</NavLink>}
      </nav>
    </aside>
  );
};

export default Sidebar;
