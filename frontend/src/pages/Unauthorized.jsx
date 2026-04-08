import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { roleLabel } from "../constants/rbac";
import { roleHomePath } from "../rbac/accessMap";

const Unauthorized = () => {
  const { user } = useAuth();
  const activeRole = user?.selectedRole || user?.role;

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 680, margin: "24px auto", padding: 24 }}>
        <div className="card-header">
          <h2>Unauthorized</h2>
        </div>
        <p style={{ color: "var(--grey-600)", lineHeight: 1.7 }}>
          You do not have permission to view this page.
          {activeRole ? (
            <>
              {" "}
              Your current role is <strong>{roleLabel(activeRole)}</strong>.
            </>
          ) : null}
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <Link className="btn" to={user ? roleHomePath(activeRole) : "/login"}>
            Go to Dashboard
          </Link>
          <Link className="btn btn-secondary" to="/">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Unauthorized;

