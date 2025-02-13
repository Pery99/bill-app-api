const axios = require("axios");
const NodeCache = require("node-cache");

const User = require("../models/User");
const Transaction = require("../models/Transaction");
const DataPlan = require("../models/DataPlan");

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

async function storePlansInDB(plans) {
  try {
    // Clear existing plans
    await DataPlan.deleteMany({});

    const allPlans = [];

    // Process each network's plans
    for (const [networkKey, networkPlans] of Object.entries(plans)) {
      for (const [category, plans] of Object.entries(networkPlans)) {
        plans.forEach((plan) => {
          allPlans.push({
            ...plan,
            category: category,
          });
        });
      }
    }

    // Insert all plans
    await DataPlan.insertMany(allPlans);
    return true;
  } catch (error) {
    console.error("Error storing plans:", error);
    return false;
  }
}

const getDataPlans = async (req, res) => {
  try {
    // // Check cache first
    // const cachedPlans = cache.get(CACHE_KEY);
    // if (cachedPlans) {
    //   return res.json(cachedPlans);
    // }

    // If not in cache, try database first
    let dataPlans = await DataPlan.find().lean();

    if (dataPlans.length === 0) {
      // If no plans in DB, fetch from API
      const response = await api.get(`${process.env.AIRTIME_API_URL}/user`);
      const apiPlans = response.data.Dataplans;

      // Store in database
      await storePlansInDB(apiPlans);

      // Fetch fresh from database
      dataPlans = await DataPlan.find().lean();
    }

    // Transform data into network categories
    const formattedPlans = {
      MTN_PLAN: { CORPORATE: [], SME: [], GIFTING: [], ALL: [] },
      GLO_PLAN: { ALL: [] },
      AIRTEL_PLAN: { ALL: [] },
      "9MOBILE_PLAN": { ALL: [] },
    };

    dataPlans.forEach((plan) => {
      const networkKey =
        plan.plan_network === "MTN"
          ? "MTN_PLAN"
          : plan.plan_network === "GLO"
          ? "GLO_PLAN"
          : plan.plan_network === "AIRTEL"
          ? "AIRTEL_PLAN"
          : "9MOBILE_PLAN";

      formattedPlans[networkKey][plan.category].push(plan);
    });

    // Store in cache
    cache.set(CACHE_KEY, formattedPlans);

    res.json(formattedPlans);
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

const updateDataPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const plan = await DataPlan.findByIdAndUpdate(id, updateData, {
      new: true,
    });
    if (!plan) {
      return res.status(404).json({ message: "Data plan not found" });
    }

    // Clear cache to reflect changes
    clearDataPlansCache();

    res.json(plan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteDataPlan = async (req, res) => {
  try {
    const { id } = req.params;

    const plan = await DataPlan.findByIdAndDelete(id);
    if (!plan) {
      return res.status(404).json({ message: "Data plan not found" });
    }

    // Clear cache to reflect changes
    clearDataPlansCache();

    res.json({ message: "Data plan deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createDataPlan = async (req, res) => {
  try {
    const plan = new DataPlan(req.body);
    await plan.save();

    // Clear cache to reflect changes
    clearDataPlansCache();

    res.status(201).json(plan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDataPlans,
  clearDataPlansCache,
  purchaseData,
  updateDataPlan,
  deleteDataPlan,
  createDataPlan,
};
