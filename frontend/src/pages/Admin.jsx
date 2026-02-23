import React, { useEffect, useState } from "react";
import { apiClient } from "../api/client";

const Admin = () => {
  const [users, setUsers] = useState([]);
  const [tree, setTree] = useState([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Employee",
    department: "",
    reportingTo: ""
  });
  const [error, setError] = useState("");

  const loadUsers = async () => {
    try {
      const [listRes, treeRes] = await Promise.all([
        apiClient.get("/users"),
        apiClient.get("/users/hierarchy")
      ]);
      setUsers(listRes.data);
      setTree(treeRes.data);
    } catch (err) {
      setUsers([]);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const createUser = async () => {
    setError("");
    try {
      await apiClient.post("/users", form);
      setForm({ name: "", email: "", password: "", role: "Employee", department: "", reportingTo: "" });
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to create user");
    }
  };

  const renderTree = (nodes, depth = 0) => {
    return nodes.map((node) => (
      <div key={node._id} className="tree-node" style={{ marginLeft: depth * 12 }}>
        {node.name} - {node.role}
        {node.reports && renderTree(node.reports, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-header">
          <h2>Create User</h2>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <div>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label>Email</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div>
              <label>Department</label>
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="Employee">Employee</option>
                <option value="ReportingOfficer">Reporting Officer</option>
                <option value="ReviewingOfficer">Reviewing Officer</option>
                <option value="AcceptingOfficer">Accepting Officer</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div>
              <label>Reporting To</label>
              <select value={form.reportingTo} onChange={(e) => setForm({ ...form, reportingTo: e.target.value })}>
                <option value="">None</option>
                {users.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <div className="error-text">{error}</div>}
          <button className="btn" type="button" onClick={createUser}>
            Create User
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Users</h2>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.department}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Reporting Hierarchy</h2>
        </div>
        <div>{renderTree(tree)}</div>
      </div>
    </div>
  );
};

export default Admin;
