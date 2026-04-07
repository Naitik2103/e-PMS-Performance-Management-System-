import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../constants/rbac";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const roleRedirects = {
    [ROLES.EMPLOYEE]: "/dashboard/employee",
    [ROLES.REPORTING_OFFICER]: "/dashboard/ro",
    [ROLES.REVIEWING_OFFICER]: "/dashboard/revo",
    [ROLES.ACCEPTING_OFFICER]: "/dashboard/ao",
    [ROLES.HR_ADMIN]: "/dashboard/admin",
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user) {
        navigate(roleRedirects[user.role] || "/dashboard");
      }
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-split">
        <div className="login-brand">
          <div className="login-brand-logo">e-PMS</div>
          <h2 className="login-brand-title">Performance Management System</h2>
          <p className="login-brand-sub">Track goals, manage appraisals, and drive organizational performance — all in one place.</p>
          <div className="login-brand-features">
            <div className="lbf-item">🎯 Annual Goal Setting</div>
            <div className="lbf-item">📊 Six-Month Tracking</div>
            <div className="lbf-item">🏆 Year-End Evaluation</div>
            <div className="lbf-item">👥 Hierarchical Reviews</div>
          </div>
        </div>
        <div className="login-form-side">
          <div className="login-card">
            <div className="login-card-header">
              <div className="login-card-logo">e-PMS</div>
              <h2>Welcome back</h2>
              <p>Sign in with your official credentials to access your dashboard.</p>
            </div>
            <form className="form-grid" onSubmit={handleSubmit}>
              <div>
                <label>Email Address</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label>Password</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="Enter your password"
                  required
                />
              </div>
              {error && <div className="error-text">{error}</div>}
              <button className="btn login-submit-btn" type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
            <div className="login-back">
              <a href="/">← Back to Home</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
