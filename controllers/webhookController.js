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
    // Find existing transaction
    const transaction = await Transaction.findOne({ reference });

    if (transaction) {
      // Update existing transaction
      transaction.status = "completed";
      await transaction.save();

      // Update user balance
      const user = await User.findById(metadata.userId);
      if (user) {
        await user.updateBalance(amount / 100); // Convert from kobo to naira
      }
    } else {
      // Create new transaction
      await Transaction.create({
        user: metadata.userId,
        type: "wallet_funding",
        transaction_type: "credit",
        amount: amount / 100,
        provider: "paystack",
        reference,
        status: "completed",
        metadata: {
          email: customer.email,
          paymentMethod: data.channel,
        },
      });
    }

    // Send success notification to user (implement your notification system)
    // notifyUser(metadata.userId, 'Payment successful');
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
