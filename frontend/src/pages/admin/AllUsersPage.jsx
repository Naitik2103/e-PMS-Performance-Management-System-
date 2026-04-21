import React, { useEffect, useState } from "react";
import { apiClient } from "../../api/client";

const AllUsersPage = () => {
  const [users, setUsers] = useState([]);
  const [success, setSuccess] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [formError, setFormError] = useState("");

  const loadUsers = async () => {
    try {
      const listRes = await apiClient.get("/users");
      setUsers(listRes.data || []);
    } catch {
      setUsers([]);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleEdit = (user) => {
    setEditingUser(user);
    setEditForm({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: user.phone || ""
    });
    setFormError("");
  };

  const handlePhoneChange = (value) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 10);
    setEditForm(p => ({ ...p, phone: cleaned }));
  };

  const saveProfile = async () => {
    setSuccess("");
    setFormError("");
    
    if (editForm.phone && editForm.phone.length !== 10) {
      setFormError("Phone number must be exactly 10 digits");
      return;
    }

    try {
      await apiClient.put(`/admin/users/${editingUser.id}`, editForm);
      setSuccess("User profile updated.");
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      setFormError(err.response?.data?.error || err.response?.data?.message || "Unable to update profile");
    }
  };

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-header">
          <h2>All Users</h2>
        </div>
        {success && <div className="success-text">{success}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
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
                    <button className="btn outline" type="button" onClick={() => handleEdit(user)}>Edit Profile</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingUser && (
        <div className="modal-backdrop">
          <div className="modal-panel" style={{ maxWidth: "400px" }}>
            <h3>Edit Profile: {editingUser.email}</h3>
            <div className="form-group" style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "4px" }}>First Name</label>
              <input 
                type="text" 
                className="input"
                style={{ width: "100%" }}
                value={editForm.firstName} 
                onChange={e => setEditForm(p => ({ ...p, firstName: e.target.value }))} 
              />
            </div>
            <div className="form-group" style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "4px" }}>Last Name</label>
              <input 
                type="text" 
                className="input"
                style={{ width: "100%" }}
                value={editForm.lastName} 
                onChange={e => setEditForm(p => ({ ...p, lastName: e.target.value }))} 
              />
            </div>
            <div className="form-group" style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "4px" }}>Phone Number</label>
              <input 
                type="text" 
                className="input"
                style={{ width: "100%" }}
                maxLength={10}
                value={editForm.phone} 
                onChange={e => handlePhoneChange(e.target.value)} 
              />
            </div>
            {formError && <div className="error-text" style={{ marginBottom: "12px" }}>{formError}</div>}
            <div className="action-row" style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => setEditingUser(null)}>Cancel</button>
              <button className="btn" onClick={saveProfile}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllUsersPage;
