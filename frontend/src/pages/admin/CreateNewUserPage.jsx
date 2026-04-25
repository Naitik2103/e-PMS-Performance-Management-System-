import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Select from "react-select";
import { apiClient } from "../../api/client";
import { useToast } from "../../hooks/useToast";

const ROLE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "hr_admin", label: "Admin" }
];
const ORG_LEVEL_OPTIONS = [
  { value: 1, label: "Level 1" },
  { value: 2, label: "Level 2" },
  { value: 3, label: "Level 3" },
  { value: 4, label: "Level 4" },
  { value: 5, label: "Level 5" },
  { value: 6, label: "Level 6" }
];

const namePattern = /^\p{L}+$/u;
const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const phonePattern = /^\d{10}$/;
const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])(?!.*\s).{8,15}$/;
const MIN_NAME_LENGTH = 3;
const isValidName = (value) => namePattern.test(String(value || "").trim());
const isValidNameLength = (value) => String(value || "").trim().length >= MIN_NAME_LENGTH;
const isValidEmail = (value) => emailPattern.test(String(value || "").trim());
const isValidPhone = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return true;
  return phonePattern.test(trimmed);
};
const isStrongPassword = (value) => strongPasswordPattern.test(String(value || ""));

const generateStrongPassword = (length = 14) => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*()-_=+[]{};:,.?";
  const all = upper + lower + digits + symbols;

  const randomInt = (max) => {
    if (window.crypto?.getRandomValues) {
      const array = new Uint32Array(1);
      window.crypto.getRandomValues(array);
      return array[0] % max;
    }
    return Math.floor(Math.random() * max);
  };

  const randomChar = (chars) => chars[randomInt(chars.length)];

  const chars = [
    randomChar(upper),
    randomChar(lower),
    randomChar(digits),
    randomChar(symbols)
  ];

  while (chars.length < length) {
    chars.push(randomChar(all));
  }

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
};

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
    orgLevel: "1",
    temporaryPassword: "",
    reportingTo: ""
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  const handleNameChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    const trimmed = String(value || "").trim();
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (!trimmed) {
        next[field] = "Required";
      } else if (!isValidNameLength(trimmed)) {
        next[field] = `Minimum ${MIN_NAME_LENGTH} characters required`;
      } else if (!isValidName(trimmed)) {
        next[field] = "Only letters are allowed";
      } else {
        delete next[field];
      }
      return next;
    });
  };

  const handleEmailChange = (value) => {
    setForm((prev) => ({ ...prev, email: value }));
    const trimmed = String(value || "").trim();
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (!trimmed) {
        next.email = "Required";
      } else if (!isValidEmail(trimmed)) {
        next.email = "Enter a valid email address";
      } else {
        delete next.email;
      }
      return next;
    });
  };

  const handlePhoneChange = (value) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 10);
    setForm((prev) => ({ ...prev, phone: cleaned }));
    const trimmed = String(value || "").trim();
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (!trimmed) {
        delete next.phone;
      } else if (!isValidPhone(trimmed)) {
        next.phone = "Phone number must be exactly 10 digits";
      } else {
        delete next.phone;
      }
      return next;
    });
  };

  const handlePasswordChange = (value) => {
    setForm((prev) => ({ ...prev, temporaryPassword: value }));
    const trimmed = String(value || "").trim();
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (!trimmed) {
        next.temporaryPassword = "Required, min 12 characters with upper, lower, number and symbol";
      } else if (!isStrongPassword(trimmed)) {
        next.temporaryPassword = "Use 12+ characters with upper, lower, number and symbol";
      } else {
        delete next.temporaryPassword;
      }
      return next;
    });
  };

  const handleGeneratePassword = () => {
    const password = generateStrongPassword();
    setForm((prev) => ({ ...prev, temporaryPassword: password }));
    setShowPassword(true);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.temporaryPassword;
      return next;
    });
  };

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
    else if (!isValidNameLength(form.firstName)) err.firstName = `Minimum ${MIN_NAME_LENGTH} characters required`;
    else if (!isValidName(form.firstName)) err.firstName = "Only letters are allowed";

    if (!form.lastName.trim()) err.lastName = "Required";
    else if (!isValidNameLength(form.lastName)) err.lastName = `Minimum ${MIN_NAME_LENGTH} characters required`;
    else if (!isValidName(form.lastName)) err.lastName = "Only letters are allowed";
    if (!form.email.trim()) err.email = "Required";
    else if (!isValidEmail(form.email)) err.email = "Enter a valid email address";
    if (form.phone.trim() && !isValidPhone(form.phone)) err.phone = "Phone number must be exactly 10 digits";
    if (!form.departmentId) err.departmentId = "Required";
    if (!form.role) err.role = "Required";
    if (!form.orgLevel) err.orgLevel = "Required";
    else if (!["1", "2", "3", "4"].includes(String(form.orgLevel))) err.orgLevel = "Select a valid org level";
    if (!form.temporaryPassword) {
      err.temporaryPassword = "Required, min 12 characters with upper, lower, number and symbol";
    } else if (!isStrongPassword(form.temporaryPassword)) {
      err.temporaryPassword = "Use 12+ characters with upper, lower, number and symbol";
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
        orgLevel: "1",
        temporaryPassword: "",
        reportingTo: ""
      });
      setShowPassword(false);
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
      orgLevel: Number(form.orgLevel),
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
              <input
                value={form.firstName}
                onChange={(e) => handleNameChange("firstName", e.target.value)}
                inputMode="text"
                autoComplete="given-name"
                aria-invalid={Boolean(fieldErrors.firstName)}
              />
              {fieldErrors.firstName && <div className="error-text">{fieldErrors.firstName}</div>}
            </div>
            <div>
              <label>Last name</label>
              <input
                value={form.lastName}
                onChange={(e) => handleNameChange("lastName", e.target.value)}
                inputMode="text"
                autoComplete="family-name"
                aria-invalid={Boolean(fieldErrors.lastName)}
              />
              {fieldErrors.lastName && <div className="error-text">{fieldErrors.lastName}</div>}
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => handleEmailChange(e.target.value)}
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email && <div className="error-text">{fieldErrors.email}</div>}
            </div>
            <div>
              <label>Phone</label>
              <input
                value={form.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                maxLength={10}
                aria-invalid={Boolean(fieldErrors.phone)}
              />
              {fieldErrors.phone && <div className="error-text">{fieldErrors.phone}</div>}
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
              <label>Org level</label>
              <select value={form.orgLevel} onChange={(e) => setForm({ ...form, orgLevel: e.target.value })}>
                {ORG_LEVEL_OPTIONS.map((lvl) => (
                  <option key={lvl.value} value={String(lvl.value)}>
                    {lvl.label}
                  </option>
                ))}
              </select>
              {fieldErrors.orgLevel && <div className="error-text">{fieldErrors.orgLevel}</div>}
            </div>
            <div />
          </div>
          <div className="form-row">
            <div>
              <label>Temporary password</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.temporaryPassword}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={Boolean(fieldErrors.temporaryPassword)}
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn ghost" onClick={handleGeneratePassword}>
                  Generate
                </button>
                <button type="button" className="btn ghost" onClick={() => setShowPassword((prev) => !prev)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <div className="muted small" style={{ marginTop: 6 }}>
                Strong password: 12+ chars, upper + lower case, number, and symbol.
              </div>
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
