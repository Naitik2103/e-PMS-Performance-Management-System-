import { validationResult } from "express-validator";

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400);
    return next(new Error(errors.array().map((err) => err.msg).join(", ")));
  }
  return next();
};

export { validate };
