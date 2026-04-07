import { SelfAppraisalGoalRating, QuantitativeAttributeRating, PerformanceReview, sequelize } from "../models.js";
import { logAction } from "./auditLogger.js";

const avg = (rows) => {
  if (!rows.length) return 0;
  return rows.reduce((s, r) => s + Number(r.score || r.rating || 0), 0) / rows.length;
};

const computeScore = async (appraisalId, { actorId, transaction } = {}) => {
  const ownTx = !transaction;
  const tx = transaction || (await sequelize.transaction());
  try {
    const review = await PerformanceReview.findByPk(appraisalId, { transaction: tx });
    if (!review) {
      throw new Error("Appraisal not found");
    }

    const kpaRows = await SelfAppraisalGoalRating.findAll({ where: { selfAppraisalId: review.selfAppraisalId }, transaction: tx });
    const attrRows = await QuantitativeAttributeRating.findAll({ where: { reviewId: appraisalId }, transaction: tx });

    const roScore = avg([
      ...kpaRows.map((r) => ({ score: r.roRating })),
      ...attrRows.filter((r) => ["reporting_officer", "ReportingOfficer"].includes(r.ratedByRole))
    ]);
    const rewScore = avg([
      ...kpaRows.map((r) => ({ score: r.revoRating })),
      ...attrRows.filter((r) => ["reviewing_officer", "ReviewingOfficer"].includes(r.ratedByRole))
    ]);
    const aoScore = avg([
      ...kpaRows.map((r) => ({ score: r.aoRating })),
      ...attrRows.filter((r) => ["accepting_officer", "AcceptingOfficer"].includes(r.ratedByRole))
    ]);

    const finalScore = roScore * 0.7 + rewScore * 0.1 + aoScore * 0.2;
    review.roScore = roScore;
    review.revoScore = rewScore;
    review.aoScore = aoScore;
    review.finalScore = finalScore;
    await review.save({ transaction: tx });

    await logAction({
      actorId,
      action: "appraisal_completed",
      targetTable: "performance_reviews",
      targetId: appraisalId,
      metadata: { roScore, rewScore, aoScore, finalScore },
      transaction: tx
    });

    if (ownTx) await tx.commit();
    return { roScore, rewScore, aoScore, finalScore };
  } catch (error) {
    if (ownTx) await tx.rollback();
    throw error;
  }
};

export { computeScore };
