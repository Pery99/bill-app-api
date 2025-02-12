const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { requireRole } = require("../middleware/roleMiddleware");
const authController = require("../controllers/authController");
const dataPlansController = require("../controllers/dataPlansController");

// All routes here require authentication and admin role
router.use(auth, requireRole("admin"));

// Admin routes
router.get("/users", authController.getAllUsers);
router.get("/users/:id", authController.getUserById);
router.put("/users/:id", authController.updateUserById);
router.delete("/users/:id", authController.deleteUser);
router.get("/stats", authController.getStats);

// Data plan management routes
router.post("/data-plans", dataPlansController.createDataPlan);
router.put("/data-plans/:id", dataPlansController.updateDataPlan);
router.delete("/data-plans/:id", dataPlansController.deleteDataPlan);
router.post("/data-plans/clear-cache", dataPlansController.clearDataPlansCache);

module.exports = router;
