import React from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLES, roleLabel } from "../constants/rbac";
import { roleHomePath } from "../rbac/accessMap";
import { User, Users, ClipboardCheck, ShieldCheck } from "lucide-react";

const roleMeta = {
  [ROLES.EMPLOYEE]: {
    title: "Employee",
    desc: "View and manage your own goals, progress review, and self-appraisal.",
    icon: User
  },
  [ROLES.REPORTING_OFFICER]: {
    title: "Reporting Officer",
    desc: "Approve goals and rate the employees who report to you.",
    icon: Users
  },
  [ROLES.REVIEWING_OFFICER]: {
    title: "Reviewing Officer",
    desc: "Provide independent ratings for employees under your review.",
    icon: ClipboardCheck
  },
  [ROLES.ACCEPTING_OFFICER]: {
    title: "Accepting Officer",
    desc: "Give final acceptance and trigger score computation for your panel.",
    icon: ShieldCheck
  }
};

const RoleSelect = () => {
  const { preAuth, user, selectRole, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = React.useState("");
  const [submittingRole, setSubmittingRole] = React.useState(null);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (user) return <Navigate to={roleHomePath(user.selectedRole || user.role)} replace />;
  if (!preAuth?.token || !preAuth?.user) return <Navigate to="/login" replace />;

  const availableRoles = (preAuth.availableRoles || preAuth.user.availableRoles || []).filter(Boolean);
  const name = preAuth.user.name || preAuth.user.email || "User";

  const handlePick = async (role) => {
    setError("");
    setSubmittingRole(role);
    try {
      const nextUser = await selectRole(role);
      navigate(roleHomePath(nextUser?.selectedRole || nextUser?.role), { replace: true });
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Unable to select role");
    } finally {
      setSubmittingRole(null);
    }
  };

  return (
    <div className="login-page">
      <div className="login-split">
        <div className="login-brand">
          <div className="login-brand-logo">e-PMS</div>
          <h2 className="login-brand-title">Choose your role context</h2>
          <p className="login-brand-sub">
            Welcome, <strong>{name}</strong>. Select how you want to operate in this session.
          </p>
          <div className="login-brand-features">
            <div className="lbf-item">Current: {roleLabel(preAuth.user.selectedRole || preAuth.user.role)}</div>
            <div className="lbf-item">Available: {availableRoles.length} role{availableRoles.length !== 1 ? "s" : ""}</div>
          </div>
        </div>

        <div className="login-form-side">
          <div className="login-card" style={{ width: "min(680px, 92vw)" }}>
            <div className="login-card-header">
              <div className="login-card-logo">e-PMS</div>
              <h2>Select Role</h2>
              <p>Your selected context controls dashboard, sidebar, and permissions.</p>
            </div>

            {error && <div className="error-text">{error}</div>}

            <div className="stat-cards-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              {availableRoles.map((role) => {
                const meta = roleMeta[role] || { title: roleLabel(role), desc: "Continue in this context." };
                const Icon = meta.icon || User;
                const disabled = Boolean(submittingRole);
                return (
                  <button
                    key={role}
                    type="button"
                    className="stat-card"
                    onClick={() => handlePick(role)}
                    disabled={disabled}
                    style={{ textAlign: "left", cursor: disabled ? "not-allowed" : "pointer" }}
                  >
                    <div className="stat-card-top">
                      <div className="stat-card-icon" style={{ background: "#eef2fb", color: "#2b5fbf" }}>
                        <Icon size={22} />
                      </div>
                      <div className="stat-card-meta">
                        <div className="stat-card-label">{meta.title}</div>
                        <div className="muted" style={{ marginTop: 6 }}>
                          {meta.desc}
                        </div>
                        {submittingRole === role && (
                          <div className="muted" style={{ marginTop: 10 }}>
                            Switching...
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoleSelect;

