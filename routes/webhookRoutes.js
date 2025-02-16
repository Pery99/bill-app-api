const express = require("express");
const router = express.Router();
const webhookController = require("../controllers/webhookController");

// Webhook routes (no auth middleware needed)
router.post(
  "/paystack",
  express.raw({ type: "application/json" }),
  webhookController.processPaystackWebhook
);

module.exports = router;
