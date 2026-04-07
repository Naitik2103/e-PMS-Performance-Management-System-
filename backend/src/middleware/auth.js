import { authenticate } from "./authenticate.js";

const protect = authenticate;

export { protect, authenticate };
