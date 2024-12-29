const Transaction = require("../models/Transaction");
const axios = require("axios");
const User = require("../models/User");
const paystack = require("../config/paystack");

const apiUrl = process.env.AIRTIME_API_URL;
const apiToken = process.env.API_TOKEN;

// Configure axios defaults for authentication
const api = axios.create({
  headers: {
    Authorization: `Token ${apiToken}`,
    "Content-Type": "application/json",
  },
});

async function checkAndDeductBalance(userId, amount) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  await user.updateBalance(amount, "debit");
  return user;
}

const purchaseData = async (req, res) => {
  let transaction;
  let userBalance;

  try {
    const { mobile_number, network, plan, amount } = req.body;

    // Validate required fields
    if (!mobile_number || !network || !plan || !amount) {
      return res.status(400).json({
        error: "Phone, network, plan and amount are required",
      });
    }

    // Check user balance first before proceeding
    const user = await User.findById(req.user._id);
    if (user.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Generate unique reference
    const reference = `DAT${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(5, "0")}`;

    // Create transaction first with pending status
    transaction = new Transaction({
      user: req.user._id,
      type: "data",
      transaction_type: "debit",
      amount,
      provider: network,
      phone: mobile_number,
      plan,
      reference,
      status: "pending",
    });
    await transaction.save();

    // Store original balance and deduct
    userBalance = user.balance;
    await checkAndDeductBalance(req.user._id, amount);

    // Make API call to purchase data with modified parameters
    const response = await api.post(`${apiUrl}/data/`, {
      network: network,
      mobile_number: mobile_number,
      plan: plan,
      Ported_number: true,
    });

    // Log the response for debugging
    console.log("API Response:", response.data);

    // Check for various success indicators
    const isSuccess =
      response.data.Status === "successful" ||
      response.data.status === "success" ||
      response.data.message?.toLowerCase().includes("success");

    if (isSuccess) {
      transaction.status = "completed";
      await transaction.save();
      res.json({
        ...response.data,
        reference,
        message: "Data purchase successful",
      });
    } else {
      // If data purchase failed, rollback the balance
      user.balance = userBalance;
      await user.save();

      transaction.status = "failed";
      await transaction.save();

      throw new Error(
        response.data.message || response.data.Status || "Data purchase failed"
      );
    }
  } catch (error) {
    // Add more detailed error logging
    console.error("Full Error Object:", error);
    console.error("API Response:", error.response?.data);

    // Rollback balance if error occurs and balance was deducted
    if (userBalance !== undefined) {
      try {
        const user = await User.findById(req.user._id);
        user.balance = userBalance;
        await user.save();
      } catch (rollbackError) {
        console.error("Rollback Error:", rollbackError);
      }
    }

    // Update transaction to failed if it exists
    if (transaction) {
      transaction.status = "failed";
      try {
        await transaction.save();
      } catch (saveError) {
        console.error("Transaction Save Error:", saveError);
      }
    }

    res.status(500).json({
      error: "Data purchase failed",
      message: error.message,
      details: error.response?.data || "No additional details",
    });
  }
};

const purchaseElectricity = async (req, res) => {
  try {
    const { meterNumber, provider, amount } = req.body;

    // Validate required fields
    if (!meterNumber || !provider || !amount) {
      return res.status(400).json({
        error: "Meter number, provider, and amount are required",
      });
    }

    // Make sure we have the user ID from auth middleware
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        error: "User not authenticated properly",
      });
    }

    // Validate and deduct balance first
    await checkAndDeductBalance(req.user._id, amount);

    const transaction = new Transaction({
      user: req.user._id, // Use _id instead of id
      type: "electricity",
      transaction_type: "debit", // Add this line
      amount,
      provider,
      meterNumber,
    });

    const response = await api.post(`${apiUrl}/billpayment`, {
      meter_number: meterNumber,
      provider,
      amount,
    });

    transaction.status =
      response.data.status === "success" ? "completed" : "failed";
    transaction.reference = response.data.reference || Date.now().toString();

    await transaction.save();
    res.json(response.data);
  } catch (error) {
    if (error.message === "Insufficient balance") {
      return res.status(400).json({ error: "Insufficient balance" });
    }
    console.error("Transaction Error:", error);
    res.status(500).json({
      error: error.message,
      details: error.response?.data || "No additional details",
    });
  }
};

const purchaseTv = async (req, res) => {
  try {
    const { smartCardNumber, provider, plan } = req.body;

    // Validate required fields
    if (!smartCardNumber || !provider || !plan) {
      return res.status(400).json({
        error: "Smart card number, provider, and plan are required",
      });
    }

    // Make sure we have the user ID from auth middleware
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        error: "User not authenticated properly",
      });
    }

    // Validate and deduct balance first
    await checkAndDeductBalance(req.user._id, req.body.amount);

    const transaction = new Transaction({
      user: req.user._id, // Use _id instead of id
      type: "tv",
      transaction_type: "debit", // Add this line
      amount: req.body.amount,
      provider,
      smartCardNumber,
      plan,
    });

    const response = await api.post(`${apiUrl}/cablesub`, {
      smart_card_number: smartCardNumber,
      provider,
      plan,
    });

    transaction.status =
      response.data.status === "success" ? "completed" : "failed";
    transaction.reference = response.data.reference || Date.now().toString();

    await transaction.save();
    res.json(response.data);
  } catch (error) {
    if (error.message === "Insufficient balance") {
      return res.status(400).json({ error: "Insufficient balance" });
    }
    console.error("Transaction Error:", error);
    res.status(500).json({
      error: error.message,
      details: error.response?.data || "No additional details",
    });
  }
};

const purchaseAirtime = async (req, res) => {
  let transaction;
  let userBalance;

  try {
    const { phone, provider, amount } = req.body;

    // Validate required fields
    if (!phone || !provider || !amount) {
      return res.status(400).json({
        error: "Phone, provider, and amount are required",
      });
    }

    // Check user balance first before proceeding
    const user = await User.findById(req.user._id);
    if (user.balance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Generate reference
    const reference = `AIR${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(5, "0")}`;
    // Create transaction first with pending status
    transaction = new Transaction({
      user: req.user._id,
      type: "airtime",
      transaction_type: "debit",
      amount,
      provider,
      phone,
      reference,
      status: "pending",
    });
    await transaction.save();

    // Store original balance and deduct
    userBalance = user.balance;
    await checkAndDeductBalance(req.user._id, amount);

    // Make API call to purchase airtime
    const response = await api.post(`${apiUrl}/topup/`, {
      mobile_number: phone,
      network: provider,
      Ported_number: true,
      airtime_type: "VTU",
      amount,
    });

    // Update transaction status based on response
    if (response.data.Status === "successful") {
      transaction.status = "completed";
      await transaction.save();
      res.json({
        ...response.data,
        reference: Date.now().toString(16),
        message: "Airtime purchase successful",
      });
    } else {
      // If airtime purchase failed, rollback the balance
      user.balance = userBalance;
      await user.save();
      transaction.status = "failed";
      await transaction.save();

      throw new Error(response.data.message || "Airtime purchase failed");
    }
  } catch (error) {
    // Only attempt rollback if transaction was created
    if (transaction && userBalance !== undefined) {
      try {
        const user = await User.findById(req.user._id);
        user.balance = userBalance;
        await user.save();
      } catch (rollbackError) {
        console.error("Rollback Error:", rollbackError);
      }
    }

    // Update transaction to failed if it exists
    if (transaction) {
      transaction.status = "failed";
      try {
        await transaction.save();
      } catch (saveError) {
        console.error("Transaction Save Error:", saveError);
      }
    }

    console.error("Airtime Transaction Error:", error);
    res.status(500).json({
      error: "Airtime purchase failed",
      message: error.message,
      details: error.response?.data || "No additional details",
    });
  }
};

const getTransactions = async (req, res) => {
  try {
    // Force page to be at least 1 and limit to be between 1 and 50
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 10), 50);
    
    // Calculate correct skip value
    const skip = (page - 1) * limit;

    // Create base query
    const query = { user: req.user._id };

    // Get total count and transactions in parallel
    const [totalCount, transactions] = await Promise.all([
      Transaction.countDocuments(query),
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    // Calculate pagination values
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = page > totalPages ? totalPages : page;
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;

    res.json({
      transactions,
      pagination: {
        currentPage,
        totalPages,
        totalTransactions: totalCount,
        hasNextPage,
        hasPrevPage,
        limit,
        showing: {
          from: totalCount === 0 ? 0 : skip + 1,
          to: Math.min(skip + transactions.length, totalCount)
        }
      }
    });
  } catch (error) {
    console.error('Transaction History Error:', error);
    res.status(500).json({ 
      error: "Failed to fetch transactions",
      message: error.message 
    });
  }
};

const getBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "balance email fullname lastFunded"
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get the last 5 transactions
    const recentTransactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      balance: user.balance,
      email: user.email,
      fullname: user.fullname,
      lastFunded: user.lastFunded,
      recentTransactions,
    });
  } catch (error) {
    console.error("Balance fetch error:", error);
    res.status(500).json({ error: error.message });
  }
};

const getFundingHistory = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("fundingHistory");
    res.json(user.fundingHistory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const initializePayment = async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.user._id);

    const paymentData = {
      email: user.email,
      amount: amount * 100, // Convert to kobo
      callback_url: `${process.env.FRONTEND_URL}/verify-payment`,
      cancel_url: `${process.env.FRONTEND_URL}/fund-wallet`,
      metadata: {
        userId: user._id,
      },
    };

    const response = await paystack.acceptPayment(paymentData);
    res.json(response);
  } catch (error) {
    console.error("Payment Error:", error);
    res
      .status(500)
      .json({ message: "Payment initialization failed", error: error.message });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;
    const response = await paystack.verifyPayment(reference);

    if (response.data.status === "success") {
      const user = await User.findById(req.user._id);
      const amount = response.data.amount / 100; // Convert back from kobo

      user.balance += amount;
      await user.save();

      // Save transaction history with correct enum values
      await Transaction.create({
        user: req.user._id,
        amount,
        type: "wallet_funding", // Changed from 'credit'
        transaction_type: "credit",
        provider: "paystack", // Added required provider
        reference,
        status: "completed", // Changed from 'success'
      });
    }

    res.json(response.data);
  } catch (error) {
    console.error("Verification Error:", error);
    res.status(500).json({
      message: "Payment verification failed",
      error: error.message,
      details: error.errors, // Add validation errors details
    });
  }
};

module.exports = {
  purchaseData,
  purchaseElectricity,
  purchaseTv,
  purchaseAirtime,
  getTransactions,
  getBalance,
  getFundingHistory,
  initializePayment,
  verifyPayment,
};
