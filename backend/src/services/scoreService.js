const { Goal, SelfAppraisalGoalRating, QuantitativeAttributeRating, QuantitativeAttributeMaster } = require("../models");

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
    ReportingOfficer: "roRating",
    ReviewingOfficer: "revoRating",
    AcceptingOfficer: "aoRating"
  };

  const goalScore = await getGoalScoreByRole(selfAppraisalId, cycleId, roleFieldMap[ratedByRole]);
  const valuesScore = await getAttributeCategoryAvg(reviewId, ratedByRole, "Values");
  const competenciesScore = await getAttributeCategoryAvg(reviewId, ratedByRole, "Competencies");

  return goalScore * 0.7 + valuesScore * 0.1 + competenciesScore * 0.2;
};

module.exports = {
  getRoleFinalScore,
  average
};
