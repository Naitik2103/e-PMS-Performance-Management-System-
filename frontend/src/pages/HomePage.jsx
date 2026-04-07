import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLES } from "../constants/rbac";

const roleHomeMap = {
  [ROLES.EMPLOYEE]: "/dashboard",
  [ROLES.REPORTING_OFFICER]: "/reporting-dashboard",
  [ROLES.REVIEWING_OFFICER]: "/reviewing-dashboard",
  [ROLES.ACCEPTING_OFFICER]: "/accepting-dashboard",
  [ROLES.HR_ADMIN]: "/admin-dashboard",
};

const features = [
  {
    icon: "🎯",
    title: "Goal Setting",
    desc: "Define annual KPA-based goals with structured mark allocations. Total must equal 100 for fairness and clarity.",
  },
  {
    icon: "📊",
    title: "Six-Month Tracking",
    desc: "Record employee progress at H1 and H2 checkpoints with detailed per-KPA progress updates.",
  },
  {
    icon: "🏆",
    title: "Year-End Evaluation",
    desc: "Submit self-summaries and receive ratings from your Reporting Officer at the end of each performance year.",
  },
  {
    icon: "👥",
    title: "Hierarchical Review",
    desc: "Multi-level workflow through Reporting Officer → Reviewing Officer → Accepting Officer for complete accountability.",
  },
];

const steps = [
  { num: "01", label: "Set Annual Goals", sub: "Employee sets KPAs" },
  { num: "02", label: "Manager Approval", sub: "RO & RevO approve" },
  { num: "03", label: "Track Progress", sub: "H1 & H2 updates" },
  { num: "04", label: "Year-End Review", sub: "Self-summary & rating" },
  { num: "05", label: "Final Acceptance", sub: "Accepting Officer signs off" },
];

const HomePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleCTA = () => {
    if (user) {
      navigate(roleHomeMap[user.role] || "/dashboard");
    } else {
      navigate("/login");
    }
  };

  return (
    <div className="home-page">
      {/* ── Header ── */}
      <header className="home-header">
        <div className="home-logo">
          <span className="logo-mark">e</span>-PMS
        </div>
        <nav className="home-nav">
          <span className="home-nav-link">Features</span>
          <span className="home-nav-link">Workflow</span>
        </nav>
        <button className="btn home-signin-btn" onClick={handleCTA}>
          {user ? "Go to Dashboard" : "Sign In"}
        </button>
      </header>

      {/* ── Hero ── */}
      <section className="home-hero">
        <div className="hero-content">
          <div className="hero-badge">Electronic Performance Management System</div>
          <h1 className="hero-title">
            Manage Performance.<br />Drive Results.
          </h1>
          <p className="hero-subtitle">
            A structured digital platform for your organization to manage employee performance
            from annual goal setting all the way through to year-end evaluation — with full
            hierarchical review workflows.
          </p>
          <div className="hero-actions">
            <button className="btn hero-btn-primary" onClick={handleCTA}>
              {user ? "Go to Dashboard →" : "Get Started →"}
            </button>
            <div className="hero-note">
              Secure role-based access · No installation required
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-stat-card">
            <div className="hero-stat-row">
              <div className="hero-stat">
                <span className="hero-stat-num">5</span>
                <span className="hero-stat-label">User Roles</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-num">100</span>
                <span className="hero-stat-label">KPA Marks Total</span>
              </div>
            </div>
            <div className="hero-stat-row">
              <div className="hero-stat">
                <span className="hero-stat-num">H1 + H2</span>
                <span className="hero-stat-label">Tracking Periods</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-num">360°</span>
                <span className="hero-stat-label">Review Chain</span>
              </div>
            </div>
            <div className="hero-progress-demo">
              <div className="demo-label">Sample KPA Weight Progress</div>
              <div className="demo-bar-wrap">
                <div className="demo-bar" style={{ width: "78%" }}></div>
              </div>
              <div className="demo-bar-text">78 / 100</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="home-features" id="features">
        <div className="section-label">What you get</div>
        <h2 className="section-title">Everything you need for performance management</h2>
        <div className="features-grid">
          {features.map((f) => (
            <div className="feature-card" key={f.title}>
              <div className="feature-icon">{f.icon}</div>
              <h3 className="feature-card-title">{f.title}</h3>
              <p className="feature-card-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Workflow ── */}
      <section className="home-workflow" id="workflow">
        <div className="section-label">Step by step</div>
        <h2 className="section-title">How the review process works</h2>
        <div className="workflow-row">
          {steps.map((step, i) => (
            <div className="workflow-step" key={step.num}>
              <div className="step-num">{step.num}</div>
              <div className="step-label">{step.label}</div>
              <div className="step-sub">{step.sub}</div>
              {i < steps.length - 1 && <div className="step-arrow">→</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="home-cta-banner">
        <h2>Ready to get started?</h2>
        <p>Sign in with your organizational credentials to access your performance dashboard.</p>
        <button className="btn hero-btn-primary" onClick={handleCTA}>
          {user ? "Go to Dashboard" : "Sign In Now"}
        </button>
      </section>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <div className="footer-logo">e-PMS</div>
        <p className="footer-text">© 2026 Electronic Performance Management System · All Rights Reserved</p>
      </footer>
    </div>
  );
};

export default HomePage;
