import React from "react";
import { NavLink } from "react-router-dom";

const Admin = () => {
  return (
    <div className="page-content">
      <div className="card">
        <div className="card-header">
          <h2>Admin Panel</h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Use the left sidebar to access each admin module directly.
        </p>
        <div className="action-row">
          <NavLink className="btn ghost" to="/admin/create-user">Create New User</NavLink>
          <NavLink className="btn ghost" to="/admin/cycles">Appraisal Cycle Management</NavLink>
          <NavLink className="btn ghost" to="/admin/all-users">All Users</NavLink>
          <NavLink className="btn ghost" to="/admin/hierarchy">Reporting Hierarchy</NavLink>
        </div>
      </div>
    </div>
  );
};

export default Admin;
