const Transaction = require("../models/Transaction");
const axios = require("axios");

const apiUrl = process.env.AIRTIME_API_URL;
const apiToken = process.env.API_TOKEN;

// Configure axios defaults for authentication
const api = axios.create({
  headers: {
    Authorization: `Token ${apiToken}`,
    "Content-Type": "application/json",
  },
});

exports.purchaseData = async (req, res) => {
  try {
    const { phone, provider, plan } = req.body;

    // Validate required fields
    if (!phone || !provider || !plan) {
      return res.status(400).json({
        error: "Phone, provider, and plan are required",
      });
    }

    // Make sure we have the user ID from auth middleware
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        error: "User not authenticated properly",
      });
    }

    const transaction = new Transaction({
      user: req.user._id, // Use _id instead of id
      type: "data",
      amount: req.body.amount,
      provider,
      phone,
      plan,
    });

    const response = await api.post(`${apiUrl}/data`, {
      phone,
      network: provider,
      plan,
    });

    transaction.status =
      response.data.status === "success" ? "completed" : "failed";
    transaction.reference = response.data.reference || Date.now().toString();

    await transaction.save();
    res.json(response.data);
  } catch (error) {
    console.error("Transaction Error:", error);
    res.status(500).json({
      error: error.message,
      details: error.response?.data || "No additional details",
    });
  }
};

exports.purchaseElectricity = async (req, res) => {
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

    const transaction = new Transaction({
      user: req.user._id, // Use _id instead of id
      type: "electricity",
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
    console.error("Transaction Error:", error);
    res.status(500).json({
      error: error.message,
      details: error.response?.data || "No additional details",
    });
  }
};

exports.purchaseTv = async (req, res) => {
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

    const transaction = new Transaction({
      user: req.user._id, // Use _id instead of id
      type: "tv",
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
    console.error("Transaction Error:", error);
    res.status(500).json({
      error: error.message,
      details: error.response?.data || "No additional details",
    });
  }
};

exports.purchaseAirtime = async (req, res) => {
  try {
    const { phone, provider, amount } = req.body;

    // Validate required fields
    if (!phone || !provider || !amount) {
      return res.status(400).json({
        error: "Phone, provider, and amount are required",
      });
    }

    // Make sure we have the user ID from auth middleware
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        error: "User not authenticated properly",
      });
    }

    const transaction = new Transaction({
      user: req.user._id, // Use _id instead of id
      type: "airtime",
      amount,
      provider,
      phone,
    });

    const response = await api.post(`${apiUrl}/topup/`, {
      mobile_number: phone,
      network: provider,
      Ported_number: true,
      airtime_type: "VTU",
      amount,
    });

    transaction.status =
      response.data.Status === "successful" ? "completed" : "failed";
    transaction.reference = response.data.reference || Date.now().toString();

    await transaction.save();
    res.json(response.data);
  } catch (error) {
    console.error("Transaction Error:", error);
    res.status(500).json({
      error: error.message,
      details: error.response?.data || "No additional details",
    });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id }).sort({
      createdAt: -1,
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
