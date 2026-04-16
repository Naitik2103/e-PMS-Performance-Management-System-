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
const getLocalDateComponents = (dateInput) => {
  if (!dateInput) return null;
  
  let dateStr;
  
  if (typeof dateInput === 'string') {
    // If it's already a string in format YYYY-MM-DD, use it directly
    if (dateInput.match(/^\d{4}-\d{2}-\d{2}/)) {
      dateStr = dateInput.substring(0, 10);
    } else {
      // If it's an ISO string with time, extract just the date part
      const date = new Date(dateInput);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      dateStr = `${year}-${month}-${day}`;
    }
  } else {
    // It's a Date object
    const date = new Date(dateInput);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    dateStr = `${year}-${month}-${day}`;
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
 * @returns {boolean} - True if today is within the period
 */
const isDateInPeriod = (startDate, endDate) => {
  if (!startDate || !endDate) return false;

  const today = new Date();
  
  const isAfterOrEqualStart = compareDates(today, startDate) >= 0;
  const isBeforeOrEqualEnd = compareDates(today, endDate) <= 0;
  return isAfterOrEqualStart && isBeforeOrEqualEnd;
};

/**
 * Check if the goal setting period is currently active
 * @param {Object|null} cycle - Active cycle object with date fields
 * @returns {boolean}
 */
export const isGoalSettingPeriodActive = (cycle) => {
  if (!cycle) {
    return false;
  }

  if (typeof cycle.isGoalSettingActive === "boolean") {
    return cycle.isGoalSettingActive;
  }
  
  if (!cycle.goalSettingStart || !cycle.goalSettingEnd) {
    console.log("  ❌ Goal setting dates are null/undefined");
    console.log("     Start:", cycle.goalSettingStart);
    console.log("     End:", cycle.goalSettingEnd);
    return false;
  }
  
  return isDateInPeriod(cycle.goalSettingStart, cycle.goalSettingEnd);
};

/**
 * Check if the six-month progress review period is currently active
 * @param {Object|null} cycle - Active cycle object with date fields
 * @returns {boolean}
 */
export const isSixMonthReviewPeriodActive = (cycle) => {
  if (!cycle) return false;
  if (typeof cycle.isSixMonthReviewActive === "boolean") {
    return cycle.isSixMonthReviewActive;
  }
  return isDateInPeriod(cycle.sixMonthProgressReviewStart, cycle.sixMonthProgressReviewEnd);
};

/**
 * Check if the annual appraisal period is currently active
 * @param {Object|null} cycle - Active cycle object with date fields
 * @returns {boolean}
 */
export const isAnnualAppraisalPeriodActive = (cycle) => {
  if (!cycle) return false;
  if (typeof cycle.isAnnualAppraisalActive === "boolean") {
    return cycle.isAnnualAppraisalActive;
  }
  return isDateInPeriod(cycle.annualAppraisalStart, cycle.annualAppraisalEnd);
};

/**
 * Get details about all periods for a given cycle
 * @param {Object|null} cycle - Active cycle object with date fields
 * @returns {Object} - Object with boolean flags for each period and their details
 */
export const getPeriodVisibility = (cycle) => {
  return {
    goalSetting: {
      isActive: isGoalSettingPeriodActive(cycle),
      startDate: cycle?.goalSettingStart,
      endDate: cycle?.goalSettingEnd
    },
    sixMonthReview: {
      isActive: isSixMonthReviewPeriodActive(cycle),
      startDate: cycle?.sixMonthProgressReviewStart,
      endDate: cycle?.sixMonthProgressReviewEnd
    },
    annualAppraisal: {
      isActive: isAnnualAppraisalPeriodActive(cycle),
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
