import React, { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { UserPlus, ChevronRight } from "lucide-react";

const Admin = () => {
  const [users, setUsers] = useState([]);
  const [tree, setTree] = useState([]);
  const [roleDrafts, setRoleDrafts] = useState({});
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department: "",
    reportingTo: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = async () => {
    try {
      const [listRes, treeRes] = await Promise.all([
        apiClient.get("/users"),
        apiClient.get("/users/hierarchy"),
      ]);
      setUsers(listRes.data);
      setTree(treeRes.data);
      setRoleDrafts(
        listRes.data.reduce((acc, user) => {
          acc[user.id] = user.role;
          return acc;
        }, {})
      );
    } catch (err) {
      setUsers([]);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const createUser = async () => {
    setError("");
    setSuccess("");
    try {
      await apiClient.post("/users", form);
      setForm({ name: "", email: "", password: "", department: "", reportingTo: "" });
      setSuccess("User created successfully.");
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to create user");
    }
  };

  const updateRole = async (userId) => {
    setError("");
    setSuccess("");
    try {
      await apiClient.put(`/users/${userId}`, { role: roleDrafts[userId] });
      setSuccess("Role updated.");
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to update role");
    }
  };

  const renderTree = (nodes, depth = 0) => {
    return nodes.map((node) => (
      <div key={node.id} className="tree-node" style={{ marginLeft: depth * 20 }}>
        <ChevronRight size={13} style={{ marginRight: 4, opacity: 0.5 }} />
        <strong>{node.name}</strong>
        <span className="tree-role-chip">{node.role}</span>
        {node.reports && renderTree(node.reports, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="page-content">
      {/* Create User */}
      <div className="card">
        <div className="card-header">
          <h2><UserPlus size={18} style={{ marginRight: 8, verticalAlign: "middle" }} />Create New User</h2>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <div>
              <label>Full Name</label>
              <input placeholder="e.g. Ali Hassan" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label>Email Address</label>
              <input type="email" placeholder="user@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Password</label>
              <input type="password" placeholder="Min. 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <label>Department</label>
              <input placeholder="e.g. Computer Science" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Reporting To</label>
              <select value={form.reportingTo} onChange={(e) => setForm({ ...form, reportingTo: e.target.value })}>
                <option value="">None (Top Level)</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} — {user.role}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="muted">New users are created as <strong>Employee</strong> by default. Update their role from the Users table below.</div>
          {error && <div className="error-text">{error}</div>}
          {success && <div className="success-text">{success}</div>}
          <div className="action-row">
            <button className="btn" type="button" onClick={createUser}>Create User</button>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="card">
        <div className="card-header">
          <h2>All Users</h2>
          <span className="muted">{users.length} users registered</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={5} className="table-empty">No users found.</td></tr>
            )}
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <div className="user-cell">
                    <div className="user-cell-avatar">
                      {user.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <span>{user.name}</span>
                  </div>
                </td>
                <td>{user.email}</td>
                <td>{user.department || <span className="muted">—</span>}</td>
                <td>
                  <select
                    className="role-select"
                    value={roleDrafts[user.id] || user.role}
                    onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [user.id]: e.target.value }))}
                  >
                    <option value="Employee">Employee</option>
                    <option value="ReportingOfficer">Reporting Officer</option>
                    <option value="ReviewingOfficer">Reviewing Officer</option>
                    <option value="AcceptingOfficer">Accepting Officer</option>
                    <option value="Admin">Admin</option>
                  </select>
                </td>
                <td>
                  <button className="btn ghost" type="button" onClick={() => updateRole(user.id)}>Save Role</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hierarchy */}
      <div className="card">
        <div className="card-header">
          <h2>Reporting Hierarchy</h2>
        </div>
        <div className="tree-container">{renderTree(tree)}</div>
      </div>
    </div>
  );
};

export default Admin;
