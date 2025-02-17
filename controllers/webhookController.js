const crypto = require("crypto");
const Transaction = require("../models/Transaction");
const User = require("../models/User");

const processPaystackWebhook = async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const event = req.body;

    // Handle the event
    switch (event.event) {
      case "charge.success":
        await handleSuccessfulPayment(event.data);
        break;

      case "transfer.success":
        await handleSuccessfulTransfer(event.data);
        break;

      case "charge.failed":
        await handleFailedPayment(event.data);
        break;
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ error: error.message });
  }
};

async function handleSuccessfulPayment(data) {
  const { reference, amount, metadata, customer } = data;

  try {
    // Check if transaction already exists and is completed
    const existingTransaction = await Transaction.findOne({ reference });
    if (existingTransaction && existingTransaction.status === "completed") {
      console.log("Transaction already processed:", reference);
      return; // Skip if already processed
    }

    let user;
    try {
      user = await User.findById(metadata.userId);
      if (!user) {
        console.error("User not found:", metadata.userId);
        return;
      }
    } catch (error) {
      console.error("Error finding user:", error);
      return;
    }

    // Convert amount from kobo to naira
    const amountInNaira = amount / 100;

    if (existingTransaction) {
      // Update existing pending transaction
      existingTransaction.status = "completed";
      await existingTransaction.save();

      // Update user balance only if transaction status changed
      if (existingTransaction.status === "completed") {
        user.balance += amountInNaira;
        await user.save();
        console.log(
          "Balance updated for user:",
          user._id,
          "New balance:",
          user.balance
        );
      }
    } else {
      // Create new transaction and update balance
      const transaction = await Transaction.create({
        user: metadata.userId,
        type: "wallet_funding",
        transaction_type: "credit",
        amount: amountInNaira,
        provider: "paystack",
        reference,
        status: "completed",
        metadata: {
          email: customer.email,
          paymentMethod: data.channel,
        },
      });

      // Update user balance
      user.balance += amountInNaira;
      await user.save();
      console.log(
        "New transaction created:",
        transaction._id,
        "Balance updated:",
        user.balance
      );
    }
  } catch (error) {
    console.error("Payment processing error:", error);
    throw error;
  }
}

async function handleFailedPayment(data) {
  const { reference, metadata } = data;

  try {
    const transaction = await Transaction.findOne({ reference });
    if (transaction) {
      transaction.status = "failed";
      transaction.metadata = {
        ...transaction.metadata,
        failureReason: data.gateway_response,
      };
      await transaction.save();
    }

    // Notify user about failed payment
    // notifyUser(metadata.userId, 'Payment failed');
  } catch (error) {
    console.error("Failed payment handling error:", error);
    throw error;
  }
}

module.exports = {
  processPaystackWebhook,
};
