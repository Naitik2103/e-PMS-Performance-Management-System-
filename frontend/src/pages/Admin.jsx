import React, { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { UserPlus, ChevronRight } from "lucide-react";

const Admin = () => {
  const [users, setUsers] = useState([]);
  const [tree, setTree] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [roleDrafts, setRoleDrafts] = useState({});
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department: "",
    reportingTo: ""
  });
  const [cycleForm, setCycleForm] = useState({
    name: `Annual Appraisal ${new Date().getFullYear()}`,
    year: new Date().getFullYear(),
    startDate: `${new Date().getFullYear()}-01-01`,
    endDate: `${new Date().getFullYear()}-12-31`,
    isActive: true,
    status: "active"
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = async () => {
    try {
      const [listRes, treeRes, cyclesRes] = await Promise.all([
        apiClient.get("/users"),
        apiClient.get("/users/hierarchy"),
        apiClient.get("/admin/cycles")
      ]);
      setUsers(listRes.data);
      setTree(treeRes.data);
      setCycles(cyclesRes.data);
      setRoleDrafts(
        listRes.data.reduce((acc, user) => {
          acc[user.id] = user.role;
          return acc;
        }, {})
      );
    } catch {
      setUsers([]);
      setTree([]);
      setCycles([]);
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
      await apiClient.put(`/admin/users/${userId}/role`, { role: roleDrafts[userId] });
      setSuccess("Role updated.");
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to update role");
    }
  };

  const createCycle = async () => {
    setError("");
    setSuccess("");
    try {
      await apiClient.post("/admin/cycles", cycleForm);
      setSuccess("Appraisal cycle created.");
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to create cycle");
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
      <div className="card">
        <div className="card-header">
          <h2><UserPlus size={18} style={{ marginRight: 8, verticalAlign: "middle" }} />Create New User</h2>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <div>
              <label>Full Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label>Email Address</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <label>Department</label>
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Reporting To</label>
              <select value={form.reportingTo} onChange={(e) => setForm({ ...form, reportingTo: e.target.value })}>
                <option value="">None (Top Level)</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name} - {user.role}</option>
                ))}
              </select>
            </div>
          </div>
          {error && <div className="error-text">{error}</div>}
          {success && <div className="success-text">{success}</div>}
          <div className="action-row">
            <button className="btn" type="button" onClick={createUser}>Create User</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Appraisal Cycle Management</h2>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <div>
              <label>Cycle Name</label>
              <input value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} />
            </div>
            <div>
              <label>Year</label>
              <input type="number" value={cycleForm.year} onChange={(e) => setCycleForm({ ...cycleForm, year: Number(e.target.value) })} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Start Date</label>
              <input type="date" value={cycleForm.startDate} onChange={(e) => setCycleForm({ ...cycleForm, startDate: e.target.value })} />
            </div>
            <div>
              <label>End Date</label>
              <input type="date" value={cycleForm.endDate} onChange={(e) => setCycleForm({ ...cycleForm, endDate: e.target.value })} />
            </div>
          </div>
          <div className="action-row">
            <button className="btn" type="button" onClick={createCycle}>Create Active Cycle</button>
          </div>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Year</th><th>Status</th><th>Active</th></tr>
            </thead>
            <tbody>
              {cycles.map((cycle) => (
                <tr key={cycle.id}><td>{cycle.name}</td><td>{cycle.year}</td><td>{cycle.status}</td><td>{cycle.isActive ? "Yes" : "No"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>All Users</h2>
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
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.department || <span className="muted">-</span>}</td>
                <td>
                  <select value={roleDrafts[user.id] || user.role} onChange={(e) => setRoleDrafts((prev) => ({ ...prev, [user.id]: e.target.value }))}>
                    <option value="Employee">Employee</option>
                    <option value="ReportingOfficer">Reporting Officer</option>
                    <option value="ReviewingOfficer">Reviewing Officer</option>
                    <option value="AcceptingOfficer">Accepting Officer</option>
                    <option value="Admin">Admin</option>
                  </select>
                </td>
                <td><button className="btn ghost" type="button" onClick={() => updateRole(user.id)}>Save Role</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
