import React, { useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import { ROLES } from "../../constants/rbac";

const AllUsersPage = () => {
  const [users, setUsers] = useState([]);
  const [roleDrafts, setRoleDrafts] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = async () => {
    try {
      const listRes = await apiClient.get("/users");
      setUsers(listRes.data || []);
      setRoleDrafts(
        (listRes.data || []).reduce((acc, user) => {
          acc[user.id] = user.role;
          return acc;
        }, {})
      );
    } catch {
      setUsers([]);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const updateRole = async (userId) => {
    setError("");
    setSuccess("");
    try {
      await apiClient.put(`/admin/users/${userId}`, { role: roleDrafts[userId] });
      setSuccess("Role updated.");
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to update role");
    }
  };

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-header">
          <h2>All Users</h2>
        </div>
        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}
        <div className="table-wrap">
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
                      <option value={ROLES.EMPLOYEE}>Employee</option>
                      <option value={ROLES.REPORTING_OFFICER}>Reporting Officer</option>
                      <option value={ROLES.REVIEWING_OFFICER}>Reviewing Officer</option>
                      <option value={ROLES.ACCEPTING_OFFICER}>Accepting Officer</option>
                      <option value={ROLES.HR_ADMIN}>HR Admin</option>
                    </select>
                  </td>
                  <td><button className="btn ghost" type="button" onClick={() => updateRole(user.id)}>Save Role</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AllUsersPage;
