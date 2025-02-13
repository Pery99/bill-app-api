const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { requireRole } = require("../middleware/roleMiddleware");
const authController = require("../controllers/authController");
const dataPlansController = require("../controllers/dataPlansController");
const adminController = require("../controllers/adminController");

// All routes here require authentication and admin role
router.use(auth, requireRole("admin"));

// Admin routes
router.get("/users", authController.getAllUsers);
router.get("/users/:id", authController.getUserById);
router.put("/users/:id", authController.updateUserById);
router.delete("/users/:id", authController.deleteUser);
router.get("/stats", authController.getStats);

// Dashboard routes
router.get("/dashboard", adminController.getDashboardStats);
router.get("/transactions", adminController.getAllTransactions);
router.get("/transactions/:id", adminController.getTransactionDetails);
router.post(
  "/transactions/:transactionId/refund",
  adminController.processRefund
);

// Data plan management routes
router.post("/data-plans", dataPlansController.createDataPlan);
router.put("/data-plans/:id", dataPlansController.updateDataPlan);
router.delete("/data-plans/:id", dataPlansController.deleteDataPlan);
router.post("/data-plans/clear-cache", dataPlansController.clearDataPlansCache);

module.exports = router;
