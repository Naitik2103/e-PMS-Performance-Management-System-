import React, { useEffect, useState } from "react";
import { apiClient } from "../../api/client";

const CreateNewUserPage = () => {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    department: "",
    reportingTo: "",
    reviewingOfficerId: "",
    acceptingOfficerId: ""
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadMeta = async () => {
    try {
      const [usersRes, departmentsRes] = await Promise.all([
        apiClient.get("/users"),
        apiClient.get("/users/departments")
      ]);
      setUsers(usersRes.data || []);
      setDepartments(departmentsRes.data || []);
    } catch {
      setUsers([]);
      setDepartments([]);
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  const createUser = async () => {
    setError("");
    setSuccess("");
    try {
      await apiClient.post("/users", form);
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        department: "",
        reportingTo: "",
        reviewingOfficerId: "",
        acceptingOfficerId: ""
      });
      setSuccess("User created successfully.");
      loadMeta();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Unable to create user");
    }
  };

  const reportingOfficerOptions = users.filter((user) => user.role === "reporting_officer");
  const reviewingOfficerOptions = users.filter((user) => user.role === "reviewing_officer");
  const acceptingOfficerOptions = users.filter((user) => user.role === "accepting_officer");

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-header">
          <h2>Create New User</h2>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <div>
              <label>First Name</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label>Last Name</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Email Address</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label>Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Department</label>
              <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                <option value="">Select Department</option>
                {departments.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Reporting Officer</label>
              <select value={form.reportingTo} onChange={(e) => setForm({ ...form, reportingTo: e.target.value })}>
                <option value="">Select Reporting Officer</option>
                {reportingOfficerOptions.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Reviewing Officer</label>
              <select value={form.reviewingOfficerId} onChange={(e) => setForm({ ...form, reviewingOfficerId: e.target.value })}>
                <option value="">Select Reviewing Officer</option>
                {reviewingOfficerOptions.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Accepting Officer</label>
              <select value={form.acceptingOfficerId} onChange={(e) => setForm({ ...form, acceptingOfficerId: e.target.value })}>
                <option value="">Select Accepting Officer</option>
                {acceptingOfficerOptions.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
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
    </div>
  );
};

export default CreateNewUserPage;
