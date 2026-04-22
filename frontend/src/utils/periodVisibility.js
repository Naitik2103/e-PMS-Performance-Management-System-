/**
 * Utility functions to check if specific appraisal periods are currently active
 * based on the active cycle dates and today's date
 */

/**
 * Extract date components (YYYY-MM-DD) from a date string or Date object
 * This avoids timezone issues by working with local date representation
 * @param {string|Date|null} dateInput - Date to parse
 * @returns {Object|null} - Object with year, month, day properties
 */
/**
 * Extract date components (YYYY-MM-DD) from a date string or Date object
 * This avoids timezone issues by working with UTC or direct string parts
 * @param {string|Date|null} dateInput - Date to parse
 * @returns {Object|null} - Object with year, month, day properties
 */
const getLocalDateComponents = (dateInput) => {
  if (!dateInput) return null;

  let dateStr;

  if (typeof dateInput === 'string') {
    // If it's an ISO string (contains T or Z) or YYYY-MM-DD format
    // Extract first 10 characters to avoid timezone shifts when parsing
    if (dateInput.match(/^\d{4}-\d{2}-\d{2}/)) {
      dateStr = dateInput.substring(0, 10);
    } else {
      // Fallback for other string formats
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) return null;
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      dateStr = `${year}-${month}-${day}`;
    }
  } else if (dateInput instanceof Date) {
    // For Date objects, use local components as they are usually created from local UI inputs
    // Unless it's the specific "now" from server, but we usually pass strings from server
    const year = dateInput.getFullYear();
    const month = String(dateInput.getMonth() + 1).padStart(2, '0');
    const day = String(dateInput.getDate()).padStart(2, '0');
    dateStr = `${year}-${month}-${day}`;
  } else {
    return null;
  }

  // Parse the date string
  const [year, month, day] = dateStr.split('-');

  return {
    year: parseInt(year),
    month: parseInt(month),
    day: parseInt(day),
    dateStr
  };
};

/**
 * Compare two dates as YYYY-MM-DD strings
 * Returns -1 if dateA < dateB, 0 if equal, 1 if dateA > dateB
 * @param {string|Date} dateA - First date
 * @param {string|Date} dateB - Second date
 * @returns {number} - Comparison result
 */
const compareDates = (dateA, dateB) => {
  const compA = getLocalDateComponents(dateA);
  const compB = getLocalDateComponents(dateB);

  if (!compA || !compB) return 0;

  // Compare as YYYYMMDD numbers for accuracy
  const numA = compA.year * 10000 + compA.month * 100 + compA.day;
  const numB = compB.year * 10000 + compB.month * 100 + compB.day;

  if (numA < numB) return -1;
  if (numA > numB) return 1;
  return 0;
};

/**
 * Check if a date is within a period range
 * Handles timezone issues by comparing local date components only
 * @param {string|Date|null} startDate - Start date (ISO string or Date object)
 * @param {string|Date|null} endDate - End date (ISO string or Date object)
 * @param {string|Date|null} now - Reference date (defaults to current system date)
 * @returns {boolean} - True if today is within the period
 */
const isDateInPeriod = (startDate, endDate, now = new Date()) => {
  if (!startDate || !endDate) return false;

  const today = now || new Date();

  const isAfterOrEqualStart = compareDates(today, startDate) >= 0;
  const isBeforeOrEqualEnd = compareDates(today, endDate) <= 0;
  return isAfterOrEqualStart && isBeforeOrEqualEnd;
};

/**
 * Check if the goal setting period is currently active
 * @param {Object|null} cycle - Active cycle object with date fields
 * @param {string|Date|null} now - Reference date override
 * @returns {boolean}
 */
export const isGoalSettingPeriodActive = (cycle, now = null) => {
  if (!cycle) return false;

  // Favor the backend's pre-calculated flag if it exists, unless an override is provided
  if (!now && typeof cycle.isGoalSettingActive === "boolean") {
    return cycle.isGoalSettingActive;
  }

  const today = now || cycle.serverDate || new Date();

  if (!cycle.goalSettingStart || !cycle.goalSettingEnd) {
    return false;
  }

  return isDateInPeriod(cycle.goalSettingStart, cycle.goalSettingEnd, today);
};

/**
 * Check if the six-month progress review period is currently active
 * @param {Object|null} cycle - Active cycle object with date fields
 * @param {string|Date|null} now - Reference date override
 * @returns {boolean}
 */
export const isSixMonthReviewPeriodActive = (cycle, now = null) => {
  if (!cycle) return false;

  // Favor the backend's pre-calculated flag if it exists, unless an override is provided
  if (!now && typeof cycle.isSixMonthReviewActive === "boolean") {
    return cycle.isSixMonthReviewActive;
  }

  const today = now || cycle.serverDate || new Date();
  return isDateInPeriod(cycle.sixMonthProgressReviewStart, cycle.sixMonthProgressReviewEnd, today);
};

/**
 * Check if the six-month progress review period has ended
 * @param {Object|null} cycle - Active cycle object with date fields
 * @param {string|Date|null} now - Reference date override
 * @returns {boolean}
 */
export const isSixMonthReviewPeriodClosed = (cycle, now = null) => {
  if (!cycle || !cycle.sixMonthProgressReviewEnd) return false;

  const today = now || cycle.serverDate || new Date();

  // If it's not active and today is after the end date, it's closed
  return compareDates(today, cycle.sixMonthProgressReviewEnd) > 0;
};

/**
 * Check if the annual appraisal period is currently active
 * @param {Object|null} cycle - Active cycle object with date fields
 * @param {string|Date|null} now - Reference date override
 * @returns {boolean}
 */
export const isAnnualAppraisalPeriodActive = (cycle, now = null) => {
  if (!cycle) return false;

  // Favor the backend's pre-calculated flag if it exists, unless an override is provided
  if (!now && typeof cycle.isAnnualAppraisalActive === "boolean") {
    return cycle.isAnnualAppraisalActive;
  }

  const today = now || cycle.serverDate || new Date();
  return isDateInPeriod(cycle.annualAppraisalStart, cycle.annualAppraisalEnd, today);
};

/**
 * Get details about all periods for a given cycle
 * @param {Object|null} cycle - Active cycle object with date fields
 * @param {string|Date|null} now - Reference date override
 * @returns {Object} - Object with boolean flags for each period and their details
 */
export const getPeriodVisibility = (cycle, now = null) => {
  return {
    goalSetting: {
      isActive: isGoalSettingPeriodActive(cycle, now),
      startDate: cycle?.goalSettingStart,
      endDate: cycle?.goalSettingEnd
    },
    sixMonthReview: {
      isActive: isSixMonthReviewPeriodActive(cycle, now),
      startDate: cycle?.sixMonthProgressReviewStart,
      endDate: cycle?.sixMonthProgressReviewEnd
    },
    annualAppraisal: {
      isActive: isAnnualAppraisalPeriodActive(cycle, now),
      startDate: cycle?.annualAppraisalStart,
      endDate: cycle?.annualAppraisalEnd
    }
  };
};

/**
 * Format a date for display in the UI
 * @param {string|Date|null} date - Date to format
 * @returns {string} - Formatted date string
 */
export const formatDateDisplay = (date) => {
  if (!date) return "Not set";

  let dateStr;
  if (typeof date === 'string') {
    // If it's a string like "2026-04-01", parse it directly
    if (date.match(/^\d{4}-\d{2}-\d{2}/)) {
      dateStr = date.substring(0, 10);
    } else {
      // Otherwise treat as ISO string
      dateStr = new Date(date).toISOString().substring(0, 10);
    }
  } else {
    // It's a Date object
    dateStr = new Date(date).toISOString().substring(0, 10);
  }

  // Parse and format
  const [year, month, day] = dateStr.split('-');
  const d = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/**
 * Debug helper: Log period status and dates for troubleshooting
 * @param {Object|null} cycle - Active cycle object
 * @returns {void}
 */
export const debugPeriodVisibility = (cycle) => {
  if (!cycle) {
    console.log("❌ No active cycle found");
    return;
  }

  const today = new Date();
  const todayComponents = getLocalDateComponents(today);
  const todayStr = `${todayComponents.year}-${todayComponents.month}-${todayComponents.day}`;

  console.log("🔍 Period Visibility Debug:");
  console.log(`📅 Today's Date: ${todayStr} (${today.toISOString()})`);
  console.log(`\n📋 Goal Setting Period:`);
  console.log(`  Start: ${cycle.goalSettingStart} → ${formatDateDisplay(cycle.goalSettingStart)}`);
  console.log(`  End: ${cycle.goalSettingEnd} → ${formatDateDisplay(cycle.goalSettingEnd)}`);
  console.log(`  Active: ${isGoalSettingPeriodActive(cycle) ? "✅ YES" : "❌ NO"}`);

  console.log(`\n📊 Six-Month Review Period:`);
  console.log(`  Start: ${cycle.sixMonthProgressReviewStart} → ${formatDateDisplay(cycle.sixMonthProgressReviewStart)}`);
  console.log(`  End: ${cycle.sixMonthProgressReviewEnd} → ${formatDateDisplay(cycle.sixMonthProgressReviewEnd)}`);
  console.log(`  Active: ${isSixMonthReviewPeriodActive(cycle) ? "✅ YES" : "❌ NO"}`);

  console.log(`\n⭐ Annual Appraisal Period:`);
  console.log(`  Start: ${cycle.annualAppraisalStart} → ${formatDateDisplay(cycle.annualAppraisalStart)}`);
  console.log(`  End: ${cycle.annualAppraisalEnd} → ${formatDateDisplay(cycle.annualAppraisalEnd)}`);
  console.log(`  Active: ${isAnnualAppraisalPeriodActive(cycle) ? "✅ YES" : "❌ NO"}`);
};
