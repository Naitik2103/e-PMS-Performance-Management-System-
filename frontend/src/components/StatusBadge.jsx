import React from "react";

const statusMap = {
  draft: "Draft",
  submitted: "Submitted",
  ro_approved: "RO Approved",
  rev_approved: "Review Approved",
  ro_rated: "RO Rated",
  review_approved: "Review Approved",
  accepted: "Accepted",
  approved: "Approved",
  rejected: "Rejected",
  returned: "Returned",
  pending_ro: "Pending RO",
  pending_revo: "Pending RevO",
  pending_ao: "Pending AO",
  finalized: "Finalized",
  ro_reviewed: "RO Reviewed",
  revo_reviewed: "RevO Reviewed",
  ao_finalized: "AO Finalized",
  open: "Open",
  ro_remarked: "RO Remarked",
  closed: "Closed"
};

const StatusBadge = ({ status }) => {
  return <span className={`status-badge status-${status}`}>{statusMap[status] || status}</span>;
};

export default StatusBadge;
