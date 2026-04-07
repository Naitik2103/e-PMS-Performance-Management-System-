import { Goal, SelfAppraisalGoalRating, QuantitativeAttributeRating, QuantitativeAttributeMaster } from "../models.js";
import { ROLES, normalizeRole } from "../constants/rbac.js";

const toNumber = (value) => Number(value || 0);

const average = (arr) => {
  if (!arr.length) return 0;
  const sum = arr.reduce((acc, v) => acc + toNumber(v), 0);
  return sum / arr.length;
};

const getGoalScoreByRole = async (selfAppraisalId, cycleId, roleField) => {
  const ratings = await SelfAppraisalGoalRating.findAll({ where: { selfAppraisalId }, include: [{ model: Goal, as: "goal", where: { cycleId }, attributes: ["weightage"] }] });
  if (!ratings.length) return 0;
  const weighted = ratings.reduce((sum, row) => {
    const rating = toNumber(row[roleField]);
    const weight = toNumber(row.goal?.weightage);
    return sum + weight * rating;
  }, 0);
  return weighted / 100;
};

const getAttributeCategoryAvg = async (reviewId, ratedByRole, category) => {
  const rows = await QuantitativeAttributeRating.findAll({
    where: { reviewId, ratedByRole },
    include: [{ model: QuantitativeAttributeMaster, as: "attribute", where: { category }, attributes: [] }],
    attributes: ["rating"]
  });
  return average(rows.map((row) => row.rating));
};

const getRoleFinalScore = async ({ reviewId, selfAppraisalId, cycleId, ratedByRole }) => {
  const roleFieldMap = {
    [ROLES.REPORTING_OFFICER]: "roRating",
    [ROLES.REVIEWING_OFFICER]: "revoRating",
    [ROLES.ACCEPTING_OFFICER]: "aoRating"
  };

  const normalizedRole = normalizeRole(ratedByRole);
  const goalScore = await getGoalScoreByRole(selfAppraisalId, cycleId, roleFieldMap[normalizedRole]);
  const valuesScore = await getAttributeCategoryAvg(reviewId, normalizedRole, "Values");
  const competenciesScore = await getAttributeCategoryAvg(reviewId, normalizedRole, "Competencies");

  return goalScore * 0.7 + valuesScore * 0.1 + competenciesScore * 0.2;
};

export {
  getRoleFinalScore,
  average
};
