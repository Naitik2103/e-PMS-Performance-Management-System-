import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Menu, X } from "lucide-react";
import { ROLES } from "../constants/rbac";

const roleHomeMap = {
  [ROLES.EMPLOYEE]: "/dashboard",
  [ROLES.REPORTING_OFFICER]: "/reporting-dashboard",
  [ROLES.REVIEWING_OFFICER]: "/reviewing-dashboard",
  [ROLES.ACCEPTING_OFFICER]: "/accepting-dashboard",
  [ROLES.HR_ADMIN]: "/admin/cycles",
};

const features = [
  {
    icon: "🎯",
    title: "Goal Setting",
    desc: "Define annual KPA-based goals with structured mark allocations. Total must equal 100 for fairness and clarity.",
  },
  {
    icon: "📊",
    title: "Six-Month Progress",
    desc: "Record employee progress in the six-month review with detailed per-KPA progress updates.",
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
  { num: "03", label: "Track Progress", sub: "Six-month review updates" },
  { num: "04", label: "Year-End Appraisal", sub: "Self-summary & rating" },
  { num: "05", label: "Final Acceptance", sub: "Accepting Officer signs off" },
];

const supportEmail = "epmshandler@gmail.com";

const HomePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 769) setMenuOpen(false);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const scrollToSection = (id) => {
    const node = document.getElementById(id);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
    setMenuOpen(false);
  };

  const handleCTA = () => {
    if (user) {
      navigate(roleHomeMap[user.role] || "/dashboard");
    } else {
      navigate("/login");
    }
  };

  return (
    <div className="home-page">
      {menuOpen && <button className="home-mobile-backdrop" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      {/* ── Header ── */}
      <header className="home-header">
        <div className="home-logo">
          <span className="logo-mark">e</span>-PMS
        </div>
        <button className="home-nav-toggle" type="button" aria-label="Toggle navigation" onClick={() => setMenuOpen((prev) => !prev)}>
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <nav className={`home-nav${menuOpen ? " open" : ""}`} aria-label="Primary">
          <button className="home-nav-link" type="button" onClick={() => scrollToSection("features")}>Features</button>
          <button className="home-nav-link" type="button" onClick={() => scrollToSection("workflow")}>Workflow</button>
          <button className="home-nav-link" type="button" onClick={() => scrollToSection("contact")}>Contact</button>
        </nav>
        <button className="btn home-signin-btn" onClick={handleCTA}>
          {user ? "Go to Dashboard" : "Sign In"}
        </button>
      </header>

      {/* ── Hero ── */}
      <section className="home-hero">
        <div className="hero-content">
          <div className="hero-badge">Performance management platform</div>
          <h1 className="hero-title">
            Manage performance.<br />Align teams. Deliver results.
          </h1>
          <p className="hero-subtitle">
            A modern digital workspace for planning goals, tracking progress, and completing
            year-end reviews with clear accountability across every role in the workflow.
          </p>
          <div className="hero-mini-grid" aria-label="Platform highlights">
            <div className="hero-mini-chip">Annual goal setting</div>
            <div className="hero-mini-chip">Six-month review tracking</div>
            <div className="hero-mini-chip">RO to AO workflow</div>
            <div className="hero-mini-chip">Role-based access</div>
          </div>
          <div className="hero-actions">
            <button className="btn hero-btn-primary" onClick={handleCTA}>
              {user ? "Go to Dashboard →" : "Get Started →"}
            </button>
            <div className="hero-note">
              Secure role-based access · Fast setup · No installation required
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
                <span className="hero-stat-label">Total KPA Weight</span>
              </div>
            </div>
            <div className="hero-stat-row">
              <div className="hero-stat">
                <span className="hero-stat-num">1</span>
                <span className="hero-stat-label">Six-month review</span>
              </div>
              <div className="hero-stat">
                <span className="hero-stat-num">360°</span>
                <span className="hero-stat-label">Review chain</span>
              </div>
            </div>
            <div className="hero-progress-demo">
              <div className="demo-label">Sample KPA weight progress</div>
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
        <div className="section-label">Platform capabilities</div>
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
        <div className="section-label">Process flow</div>
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
      <section className="home-cta-banner" id="contact">
        <div className="home-cta-card">
          <div className="section-label section-label-light">Contact</div>
          <h2>Ready to get started?</h2>
          <p>
            Reach out directly if you need help with access or system support.
          </p>
          <div className="home-contact-actions">
            <a className="btn home-contact-email" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
          </div>
        </div>
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
