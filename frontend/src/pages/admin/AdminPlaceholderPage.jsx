import React from "react";

const AdminPlaceholderPage = ({ title, description }) => (
  <div className="page-content">
    <div className="card">
      <div className="card-header">
        <h2>{title}</h2>
      </div>
      <p className="muted">{description || "This section will be available in a future update."}</p>
    </div>
  </div>
);

export default AdminPlaceholderPage;
