import React, { useEffect, useMemo, useState } from "react";
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

  const groupedUsers = useMemo(() => {
    return users.reduce((acc, user) => {
      const dept = user.department || "Other / Unassigned";
      if (!acc[dept]) acc[dept] = [];
      acc[dept].push(user);
      return acc;
    }, {});
  }, [users]);

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
          <h2>All Users by Department</h2>
        </div>
        {success && <div className="success-text" style={{ padding: "0 20px" }}>{success}</div>}
        
        <div style={{ padding: "20px" }}>
          {Object.keys(groupedUsers).sort().map(dept => (
            <div key={dept} className="dept-section" style={{ marginBottom: "40px" }}>
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "12px", 
                marginBottom: "16px",
                paddingBottom: "8px",
                borderBottom: "2px solid #f0f0f0"
              }}>
                <h3 style={{ margin: 0, color: "var(--primary-color)", fontSize: "1.2rem" }}>{dept}</h3>
                <span className="muted small" style={{ backgroundColor: "#f5f5f5", padding: "2px 8px", borderRadius: "12px" }}>
                  {groupedUsers[dept].length} {groupedUsers[dept].length === 1 ? "User" : "Users"}
                </span>
              </div>
              
              <div className="table-wrap" style={{ border: "1px solid #f0f0f0", borderRadius: "8px", overflow: "hidden" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedUsers[dept].map((user) => (
                      <tr key={user.id}>
                        <td style={{ fontWeight: 500 }}>{user.name}</td>
                        <td>{user.email}</td>
                        <td>
                          <button className="btn outline sm" type="button" onClick={() => handleEdit(user)}>Edit Profile</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          
          {users.length === 0 && (
            <div className="muted" style={{ textAlign: "center", padding: "40px" }}>No users found.</div>
          )}
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
