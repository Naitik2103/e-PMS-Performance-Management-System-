// Normalize to a "local date" (midnight in the server's local timezone).
// This avoids UTC off-by-one issues when comparing date strings.
const normalizeDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const getEvaluationDate = () => {
  const override = process.env.APPRAISAL_TIME_TRAVEL_DATE;
  if (override) {
    const parsed = normalizeDate(override);
    if (parsed) return parsed;
  }
  return normalizeDate(new Date());
};

const getWindowState = (evaluationDate, start, end) => {
  const startDate = normalizeDate(start);
  const endDate = normalizeDate(end);
  if (!startDate || !endDate) return "closed";

  // Open only if strictly between start and end: start < today < end
  if (evaluationDate <= startDate) return "not_started";
  if (evaluationDate >= endDate) return "closed";
  return "open";
};

// Requirement: open when today is strictly between start and end.
// i.e. `today > start` AND `today < end`
const isWithinWindow = (evaluationDate, start, end) => {
  return getWindowState(evaluationDate, start, end) === "open";
};

const getCycleAccess = (cycle, evaluationDate = getEvaluationDate()) => ({
  evaluationDate,
  goalSettingState: getWindowState(evaluationDate, cycle?.goal_setting_start, cycle?.goal_setting_end),
  goalSettingOpen: isWithinWindow(evaluationDate, cycle?.goal_setting_start, cycle?.goal_setting_end),
  sixMonthState: getWindowState(
    evaluationDate,
    cycle?.six_month_progress_review_start,
    cycle?.six_month_progress_review_end
  ),
  sixMonthOpen: isWithinWindow(
    evaluationDate,
    cycle?.six_month_progress_review_start,
    cycle?.six_month_progress_review_end
  ),
  annualState: getWindowState(evaluationDate, cycle?.annual_appraisal_start, cycle?.annual_appraisal_end),
  annualOpen: isWithinWindow(evaluationDate, cycle?.annual_appraisal_start, cycle?.annual_appraisal_end)
});

const assertCycleWindowOpen = ({ cycle, windowKey, message }) => {
  const access = getCycleAccess(cycle);
  if (!access[windowKey]) {
    const err = new Error(message);
    err.statusCode = 403;
    throw err;
  }
  return access;
};

export { getEvaluationDate, getCycleAccess, assertCycleWindowOpen };
