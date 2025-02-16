const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const transactionController = require("../controllers/transactionController");
const dataPlansController = require("../controllers/dataPlansController");
const cablePlanController = require("../controllers/cablePlanController");

// Verify all controller methods exist before routing
router.post("/airtime", auth, transactionController.purchaseAirtime);
router.post("/data", auth, dataPlansController.purchaseData);
router.post("/electricity", auth, transactionController.purchaseElectricity);
router.post("/tv", auth, transactionController.purchaseTv);
router.get("/history", auth, transactionController.getTransactions);
router.get("/balance", auth, transactionController.getBalance);
router.get("/funding-history", auth, transactionController.getFundingHistory);
router.get("/verify-tv-card", auth, transactionController.verifyTvCard);
router.get(
  "/verify-electricity",
  auth,
  transactionController.verifyElectricityMeter
);
router.get("/data-plans", dataPlansController.getDataPlans);
router.get("/cable-plans", auth, cablePlanController.getCablePlans);
router.post("/convert-points", auth, transactionController.convertPoints);
router.get("/points", auth, transactionController.getPoints);
router.post(
  "/initialize-payment",
  auth,
  transactionController.initializePayment
);
router.post(
  "/initialize-direct-payment",
  auth,
  transactionController.initializeDirectPurchase
);
router.get(
  "/verify-payment/:reference",
  auth,
  transactionController.verifyPayment
);

module.exports = router;
