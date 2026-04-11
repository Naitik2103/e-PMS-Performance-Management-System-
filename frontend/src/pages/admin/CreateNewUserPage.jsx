import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Select from "react-select";
import { apiClient } from "../../api/client";
import { useToast } from "../../hooks/useToast";

const ROLE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "hr_admin", label: "Admin" }
];

const initials = (name) =>
  (name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const CreateNewUserPage = () => {
  const { toast, showToast } = useToast();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    departmentId: "",
    role: "employee",
    temporaryPassword: "",
    reportingTo: ""
  });
  const [fieldErrors, setFieldErrors] = useState({});

  const { data: meta } = useQuery({
    queryKey: ["meta", "departments-designations"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/meta/departments-designations");
      return res.data;
    }
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["allUsers"],
    queryFn: async () => {
      const res = await apiClient.get("/admin/users/all");
      return res.data;
    }
  });

  const reportingOptions = useMemo(
    () =>
      allUsers.map((u) => ({
        value: u.id,
        label: u.fullName,
        data: u
      })),
    [allUsers]
  );

  const formatReportingOption = (option) => {
    const u = option.data;
    return (
      <div className="admin-rs-option">
        <span className="admin-mp-avatar">{initials(u.fullName)}</span>
        <div>
          <div>{u.fullName}</div>
          <div className="muted small">
            {[u.designation, u.department].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
      </div>
    );
  };

  const validate = () => {
    const err = {};
    if (!form.firstName.trim()) err.firstName = "Required";
    if (!form.lastName.trim()) err.lastName = "Required";
    if (!form.email.trim()) err.email = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) err.email = "Invalid email";
    if (!form.departmentId) err.departmentId = "Required";
    if (!form.role) err.role = "Required";
    if (!form.temporaryPassword || form.temporaryPassword.length < 8) {
      err.temporaryPassword = "Required, min 8 characters";
    }
    setFieldErrors(err);
    return Object.keys(err).length === 0;
  };

  const createMutation = useMutation({
    mutationFn: (body) => apiClient.post("/admin/users", body),
    onSuccess: () => {
      showToast("User created successfully");
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        departmentId: "",
        role: "employee",
        temporaryPassword: "",
        reportingTo: ""
      });
      setFieldErrors({});
    },
    onError: (e) => {
      const status = e.response?.status;
      const d = e.response?.data;
      if (status === 409 && d?.field && d?.error) {
        setFieldErrors((prev) => ({ ...prev, [d.field]: d.error }));
      } else {
        showToast(d?.error || "Unable to create user", "error");
      }
    }
  });

  const submit = () => {
    if (!validate()) return;
    createMutation.mutate({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || undefined,
      departmentId: form.departmentId,
      role: form.role,
      reportingTo: form.reportingTo || null,
      temporaryPassword: form.temporaryPassword
    });
  };

  const departments = meta?.departments || [];

  return (
    <div>
      {toast && (
        <div className={`app-toast app-toast--${toast.variant}`} role="status">
          {toast.message}
        </div>
      )}
      <div className="card admin-create-user-card">
        <div className="card-header admin-create-user-header">
          <div>
            <h2>Create user</h2>
            <p className="admin-create-user-subtitle">Add a user account (org chart roles for appraisals are set per cycle elsewhere).</p>
          </div>
        </div>

        <div className="admin-info-banner">
          RO, RevO, and AO for this person&apos;s appraisal will be assigned in Appraisal Cycles → Manage Participants. Do not set
          them here.
        </div>

        <div className="form-grid admin-create-user-grid">
          <div className="form-row">
            <div>
              <label>First name</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              {fieldErrors.firstName && <div className="error-text">{fieldErrors.firstName}</div>}
            </div>
            <div>
              <label>Last name</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              {fieldErrors.lastName && <div className="error-text">{fieldErrors.lastName}</div>}
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              {fieldErrors.email && <div className="error-text">{fieldErrors.email}</div>}
            </div>
            <div>
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Department</label>
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">Select…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {fieldErrors.departmentId && <div className="error-text">{fieldErrors.departmentId}</div>}
            </div>
            <div>
              <label>Base role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {fieldErrors.role && <div className="error-text">{fieldErrors.role}</div>}
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Temporary password</label>
              <input
                type="password"
                value={form.temporaryPassword}
                onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })}
              />
              {fieldErrors.temporaryPassword && <div className="error-text">{fieldErrors.temporaryPassword}</div>}
            </div>
            <div />
          </div>
          <div className="form-row">
            <div className="admin-rs-wrap">
              <label>Reporting to</label>
              <Select
                isClearable
                placeholder="Search people…"
                options={reportingOptions}
                formatOptionLabel={formatReportingOption}
                value={reportingOptions.find((o) => o.value === form.reportingTo) || null}
                onChange={(opt) => setForm({ ...form, reportingTo: opt?.value || "" })}
                filterOption={(option, input) => {
                  const u = option.data;
                  if (!input) return true;
                  const q = input.toLowerCase();
                  return (
                    (u?.fullName || "").toLowerCase().includes(q) ||
                    (u?.department || "").toLowerCase().includes(q) ||
                    (u?.designation || "").toLowerCase().includes(q)
                  );
                }}
              />
            </div>
            <div />
          </div>
          <div className="action-row">
            <button type="button" className="btn admin-create-user-btn" onClick={submit} disabled={createMutation.isPending}>
              Create user
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateNewUserPage;
