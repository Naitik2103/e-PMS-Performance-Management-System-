import { protect } from "./auth.js";
import { authorise } from "./authorise.js";
import { ROLES } from "../constants/rbac.js";

/** Alias matching API contract: JWT bearer auth. */
const authenticateJWT = protect;

/** @param {'hr_admin'} ctx */
const authorizeContext = (ctx) => {
  if (ctx !== "hr_admin") {
    throw new Error("authorizeContext: only hr_admin is supported");
  }
  return authorise([ROLES.HR_ADMIN]);
};

export { authenticateJWT, authorizeContext };
