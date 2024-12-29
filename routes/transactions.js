const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const transactionController = require("../controllers/transactionController");
const dataPlansController = require("../controllers/dataPlansController");

router.post("/airtime", auth, transactionController.purchaseAirtime);
router.post("/data", auth, transactionController.purchaseData);
router.post("/electricity", auth, transactionController.purchaseElectricity);
router.post("/tv", auth, transactionController.purchaseTv);
// Update the history route to accept query parameters
router.get("/history", auth, transactionController.getTransactions);
router.get("/balance", auth, transactionController.getBalance);
router.get("/funding-history", auth, transactionController.getFundingHistory);
router.post(
  "/initialize-payment",
  auth,
  transactionController.initializePayment
);
router.get(
  "/verify-payment/:reference",
  auth,
  transactionController.verifyPayment
);

// Add new route for data plans
router.get("/data-plans", auth, dataPlansController.getDataPlans);

// Add new route for points conversion
router.post("/convert-points", auth, transactionController.convertPoints);

// Add new route to check points balance
router.get("/points", auth, transactionController.getPoints);

module.exports = router;
