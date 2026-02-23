const express = require("express");
const { createUser, listUsers, updateUser, hierarchy } = require("../controllers/userController");
const { createUserValidation, updateUserValidation } = require("../validation/userValidation");
const { validate } = require("../middleware/validate");
const { protect } = require("../middleware/auth");
const { allowRoles } = require("../middleware/roles");

const router = express.Router();

router.use(protect, allowRoles("Admin"));

router.post("/", createUserValidation, validate, createUser);
router.get("/", listUsers);
router.get("/hierarchy", hierarchy);
router.put("/:id", updateUserValidation, validate, updateUser);

module.exports = router;
