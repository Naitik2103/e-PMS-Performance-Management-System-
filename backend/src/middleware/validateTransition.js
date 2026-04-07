import { normalizeRole } from "../constants/rbac.js";

const transitions = {
  draft: { submit_goals: { role: "employee", next: "submitted" } },
  submitted: {
    approve_goals: { role: "reporting_officer", next: "ro_approved" },
    sendback_goals: { role: "reporting_officer", next: "draft" }
  },
  ro_approved: { submit_self_appraisal: { role: "employee", next: "self_appraisal_done" } },
  self_appraisal_done: { submit_ro_rating: { role: "reporting_officer", next: "ro_rated" } },
  ro_rated: { submit_revo_rating: { role: "reviewing_officer", next: "revo_rated" } },
  revo_rated: { accept_appraisal: { role: "accepting_officer", next: "ao_accepted" } },
  ao_accepted: { complete_appraisal: { role: "accepting_officer", next: "completed" } }
};

const validateTransition = ({ current, action, role }) => {
  const from = transitions[current] || {};
  const candidate = from[action];
  if (!candidate || normalizeRole(role) !== candidate.role) {
    return { ok: false, error: "Action not allowed in current appraisal state", required: candidate?.role || "valid transition", current };
  }
  return { ok: true, next: candidate.next };
};

const enforceTransition = ({ current, action, role, res }) => {
  const result = validateTransition({ current, action, role });
  if (!result.ok) {
    res.status(409).json({
      error: "Action not allowed in current appraisal state",
      required: result.required,
      current
    });
    return null;
  }
  return result.next;
};

export { transitions, validateTransition, enforceTransition };
