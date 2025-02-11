const axios = require("axios");
const NodeCache = require("node-cache");

const User = require("../models/User");
const Transaction = require("../models/Transaction");

// Initialize cache with 5 minute TTL
const cache = new NodeCache({ stdTTL: 300 });
const CACHE_KEY = "data_plans";

const apiUrl = process.env.AIRTIME_API_URL;
const apiToken = process.env.API_TOKEN;

const api = axios.create({
  headers: {
    Authorization: `Token ${process.env.API_TOKEN}`,
    "Content-Type": "application/json",
  },
});

async function checkAndDeductBalance(userId, amount) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  await user.updateBalance(amount, "debit");
  return user;
}

const getDataPlans = async (req, res) => {
  try {
    // Check cache first
    const cachedPlans = cache.get(CACHE_KEY);
    if (cachedPlans) {
      return res.json([cachedPlans]);
    }

    // If not in cache, fetch from API
    const response = await api.get(`${process.env.AIRTIME_API_URL}/user`);
    const dataPlans = response.data.Dataplans;

    // Store in cache
    cache.set(CACHE_KEY, dataPlans);

    res.json([dataPlans]);
  } catch (error) {
    console.error("Error fetching data plans:", error);
    res.status(500).json({
      error: "Failed to fetch data plans",
      details: error.response?.data || error.message,
    });
  }
};

// Function to manually clear cache if needed
const clearDataPlansCache = () => {
  cache.del(CACHE_KEY);
};

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

    // Check for various success indicators
    const isSuccess =
      response.data.Status === "successful" ||
      response.data.status === "success" ||
      response.data.message?.toLowerCase().includes("success");

    if (isSuccess) {
      transaction.status = "completed";
      await transaction.save();

      // Add points for successful transaction
      await user.addPoints("data");

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

module.exports = {
  getDataPlans,
  clearDataPlansCache,
  purchaseData,
};
