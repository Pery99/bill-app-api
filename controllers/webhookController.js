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
  const amountInNaira = amount / 100;

  try {
    // Use findOneAndUpdate to atomically update transaction status
    const transaction = await Transaction.findOneAndUpdate(
      {
        reference,
        status: { $ne: "completed" }, // Only update if not already completed
      },
      {
        $setOnInsert: {
          user: metadata.userId,
          type: "wallet_funding",
          transaction_type: "credit",
          amount: amountInNaira,
          provider: "paystack",
          reference,
          metadata: {
            email: customer.email,
            paymentMethod: data.channel,
          },
        },
        $set: {
          status: "completed",
          updatedAt: new Date(),
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      }
    );

    if (transaction.wasNew || transaction.status === "completed") {
      // Only update balance if this is a new transaction or first time being completed
      const updatedUser = await User.findOneAndUpdate(
        { _id: metadata.userId },
        { $inc: { balance: amountInNaira } },
        { new: true }
      );

      if (!updatedUser) {
        console.error("User not found:", metadata.userId);
        return;
      }

      console.log("Transaction processed:", {
        reference,
        userId: metadata.userId,
        amount: amountInNaira,
        newBalance: updatedUser.balance,
        transactionId: transaction._id,
      });
    } else {
      console.log("Transaction already processed:", reference);
    }
  } catch (error) {
    console.error("Payment processing error:", {
      error: error.message,
      reference,
      metadata,
    });
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
