import React from "react";
import { useAuth } from "../context/AuthContext";

const Topbar = () => {
  const { user, logout } = useAuth();
  return (
    <header className="topbar">
      <div>
        <h1>Performance Management System</h1>
        <p>Role: {user?.role}</p>
      </div>
      <button className="btn secondary" onClick={logout}>Logout</button>
    </header>
  );
};

export default Topbar;
