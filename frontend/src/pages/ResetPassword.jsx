import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, CheckCircle2, Circle } from "lucide-react";
import { apiClient } from "../api/client";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const requirements = useMemo(() => [
    { label: "Between 8 and 15 characters", met: newPassword.length >= 8 && newPassword.length <= 15 },
    { label: "No spaces allowed", met: newPassword.length > 0 && !/\s/.test(newPassword) },
    { label: "At least one uppercase letter", met: /[A-Z]/.test(newPassword) },
    { label: "At least one lowercase letter", met: /[a-z]/.test(newPassword) },
    { label: "At least one number", met: /\d/.test(newPassword) },
    { label: "At least one special character", met: /[^A-Za-z0-9\s]/.test(newPassword) },
  ], [newPassword]);

  const allMet = useMemo(() => requirements.every(r => r.met), [requirements]);

  useEffect(() => {
    if (!token) {
      setError("Invalid or missing reset token.");
    }
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("Missing reset token.");
      return;
    }
    if (!allMet) {
      setError("Password does not meet all security requirements.");
      return;
    }
    if (!newPassword || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post("/auth/reset-password", {
        token,
        newPassword,
      });
      setSuccess(response.data?.message || "Password reset successful.");
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } catch (err) {
      setError(
        err.response?.data?.error || "Failed to reset password. The link might be expired."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-split">
        <div className="login-brand">
          <div className="login-brand-chip">Secure internal access</div>
          <div className="login-brand-logo">e-PMS</div>
          <h2 className="login-brand-title">Performance management designed for accountability.</h2>
          <p className="login-brand-sub">Track goals, manage appraisals, and keep every review stage organized in one place.</p>
        </div>
        <div className="login-form-side">
          <div className="login-card">
            <div className="login-card-header">
              <div className="login-card-logo">e-PMS</div>
              <h2>Set New Password</h2>
              <p>Enter your new password below.</p>
            </div>

            <form className="form-grid" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="new-password">New Password</label>
                <div className="login-password-wrap">
                  <input
                    id="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value.replace(/\s/g, ""))}
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Create new password"
                    maxLength={15}
                    required
                    disabled={!token || success}
                  />
                  <button
                    className="login-password-toggle"
                    type="button"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    disabled={!token || success}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div className="password-requirements" style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
                  {requirements.map((req, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: "8px", 
                        fontSize: "12px",
                        color: req.met ? "#16a34a" : "#64748b",
                        transition: "color 0.2s ease"
                      }}
                    >
                      {req.met ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                      <span>{req.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: "8px" }}>
                <label htmlFor="confirm-password">Confirm New Password</label>
                <input
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Re-enter new password"
                  required
                  disabled={!token || success}
                />
              </div>

              {error && <div className="error-text">{error}</div>}
              {success && <div className="success-text">{success}</div>}
              
              {!success && (
                <button 
                  className="btn login-submit-btn" 
                  type="submit" 
                  disabled={loading || !token || !allMet}
                  style={{ opacity: (!allMet || loading) ? 0.6 : 1 }}
                >
                  {loading ? "Resetting..." : "Reset Password"}
                </button>
              )}
            </form>

            <div className="login-back" style={{ marginTop: "2rem" }}>
              <Link to="/login" className="login-back-link">
                <ArrowLeft size={14} />
                <span>Back to Login</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
