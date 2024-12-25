const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const auth = require("../middleware/auth");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", auth, authController.logout);
router.get("/me", auth, authController.getUser);

router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password/:token", authController.resetPassword);

module.exports = router;
