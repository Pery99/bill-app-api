const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const transactionController = require("../controllers/transactionController");
const dataPlansController = require("../controllers/dataPlansController");

router.post("/airtime", auth, transactionController.purchaseAirtime);
router.post("/data", auth, transactionController.purchaseData);
router.post("/electricity", auth, transactionController.purchaseElectricity);
router.post("/tv", auth, transactionController.purchaseTv);
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

module.exports = router;
