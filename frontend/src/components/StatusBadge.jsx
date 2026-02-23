import React from "react";

const statusMap = {
  draft: "Draft",
  submitted: "Submitted",
  ro_approved: "RO Approved",
  rev_approved: "Review Approved",
  ro_rated: "RO Rated",
  review_approved: "Review Approved",
  accepted: "Accepted",
  open: "Open",
  ro_remarked: "RO Remarked",
  closed: "Closed"
};

const StatusBadge = ({ status }) => {
  return <span className={`status-badge status-${status}`}>{statusMap[status] || status}</span>;
};

export default StatusBadge;
