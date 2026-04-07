import { authorise } from "./authorise.js";

const allowRoles = (...roles) => authorise(roles);
const authorizeRoles = (...roles) => authorise(roles);

export { allowRoles, authorizeRoles, authorise };
