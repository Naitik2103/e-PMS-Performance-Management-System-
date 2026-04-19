import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { apiClient } from "../api/client";
import { roleHomePath } from "../rbac/accessMap";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);

  const resetForgotPasswordState = () => {
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
  };

  const openForgotPassword = () => {
    setAuthMode("forgot");
    setError("");
    setSuccess("");
    setResetEmail((email || "").trim().toLowerCase());
    resetForgotPasswordState();
  };

  const backToSignIn = () => {
    setAuthMode("signin");
    setError("");
    setSuccess("");
    resetForgotPasswordState();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result?.type === "auth") {
        navigate(roleHomePath(result.user?.selectedRole || result.user?.role), { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestResetLink = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!resetEmail) {
      setError("Please enter your official email address.");
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post("/auth/forgot-password", { email: resetEmail });
      setSuccess(response.data?.message || "Reset link sent. Check your email.");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to send reset link. Please try again.");
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
          <div className="login-brand-features">
            <div className="lbf-item">🎯 Annual goal setting</div>
            <div className="lbf-item">📊 Six-month review tracking</div>
            <div className="lbf-item">🏆 Year-end evaluation</div>
            <div className="lbf-item">👥 Hierarchical review flow</div>
          </div>
        </div>
        <div className="login-form-side">
          <div className="login-card">
            <div className="login-card-header">
              <div className="login-card-logo">e-PMS</div>
              <h2>{authMode === "signin" ? "Welcome back" : "Forgot password"}</h2>
              <p>
                {authMode === "signin"
                  ? "Sign in with your official credentials to access your dashboard."
                  : "Enter your official email to receive a password reset link."}
              </p>
            </div>
            {authMode === "signin" ? (
              <form className="form-grid" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="login-email">Official Email Address</label>
                  <input
                    id="login-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div>
                  <div className="login-password-row">
                    <label htmlFor="login-password">Password</label>
                    <button className="login-forgot-link" type="button" onClick={openForgotPassword}>
                      Forgot password?
                    </button>
                  </div>
                  <div className="login-password-wrap">
                    <input
                      id="login-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      className="login-password-toggle"
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {error && <div className="error-text">{error}</div>}
                {success && <div className="success-text">{success}</div>}
                <div className="login-support-note">Use your work email and password issued by your organization.</div>
                <button className="btn login-submit-btn" type="submit" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
            ) : (
              <>
                <form className="form-grid" onSubmit={handleRequestResetLink}>
                  <div>
                    <label htmlFor="reset-email">Official Email Address</label>
                    <input
                      id="reset-email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      type="email"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  {error && <div className="error-text">{error}</div>}
                  {success && <div className="success-text">{success}</div>}
                  <button className="btn login-submit-btn" type="submit" disabled={loading}>
                    {loading ? "Sending Link..." : "Send Reset Link"}
                  </button>
                </form>

                <button className="login-mode-switch" type="button" onClick={backToSignIn}>
                  Back to sign in
                </button>
              </>
            )}
            <div className="login-back">
              <Link to="/" className="login-back-link">
                <ArrowLeft size={14} />
                <span>Back to Home</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
