const Transaction = require("../models/Transaction");
const axios = require("axios");
const User = require("../models/User");
const paystack = require("../config/paystack");
const CablePlan = require("../models/CablePlan");
const { initializeDirectPayment } = require("../utils/paymentHelper");

const apiUrl = process.env.AIRTIME_API_URL;
const apiToken = process.env.API_TOKEN;

// Configure axios defaults for authentication
const api = axios.create({
  headers: {
    Authorization: `Token ${apiToken}`,
    "Content-Type": "application/json",
  },
});

export async function checkAndDeductBalance(userId, amount) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  await user.updateBalance(amount, "debit");
  return user;
}

const purchaseElectricity = async (req, res) => {
  let transaction;
  let userBalance;
  let user;

  try {
    const { disco_name, amount, meter_number, meter_type } = req.body;

    // Validate required fields
    if (!meter_number || !meter_type || !amount || !disco_name) {
      return res.status(400).json({
        error:
          "All fields are required: disco_name, amount, meter_number, meter_type",
      });
    }

    // Get user and check balance first
    user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Store original balance
    userBalance = user.balance;

    // Check balance before proceeding
    if (userBalance < amount) {
      return res.status(400).json({
        error: "Insufficient balance",
        required: amount,
        available: userBalance,
      });
    }

    // Generate reference
    const reference = `ELC${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Create pending transaction first
    transaction = new Transaction({
      user: req.user._id,
      type: "electricity",
      transaction_type: "debit",
      amount,
      provider: disco_name,
      meterNumber: meter_number,
      reference,
      status: "pending",
    });
    await transaction.save();

    // Make API call BEFORE deducting balance
    console.log("Making electricity purchase request:", {
      disco_name,
      amount,
      meter_number,
      MeterType: meter_type,
    });

    const response = await api.post(`${apiUrl}/billpayment`, {
      disco_name,
      amount,
      meter_number,
      MeterType: meter_type,
    });

    // console.log("Electricity API Response:", response.data);

    // Check response status
    const isSuccess =
      response.data.Status === "successful" ||
      response.data.status === "success" ||
      response.data.message?.toLowerCase().includes("success");

    if (!isSuccess) {
      throw new Error(response.data?.message || "Electricity purchase failed");
    }

    // Only deduct balance if API call was successful
    await checkAndDeductBalance(req.user._id, amount);

    // Update transaction to completed
    transaction.status = "completed";
    await transaction.save();

    // Add points
    await user.addPoints("electricity");

    return res.json({
      status: "success",
      message: "Electricity purchase successful",
      reference: transaction.reference,
      details: response.data,
    });
  } catch (error) {
    console.error("Electricity Purchase Error:", error);
    console.error("API Response:", error.response?.data);

    // Always rollback if balance was deducted
    if (userBalance !== undefined && user) {
      try {
        const currentUser = await User.findById(user._id);
        if (currentUser.balance !== userBalance) {
          currentUser.balance = userBalance;
          await currentUser.save();
          console.log("Balance rolled back to:", userBalance);
        }
      } catch (rollbackError) {
        console.error("Critical: Balance rollback failed:", rollbackError);
      }
    }

    // Ensure transaction is marked as failed
    if (transaction) {
      try {
        transaction.status = "failed";
        await transaction.save();
      } catch (txError) {
        console.error("Transaction status update failed:", txError);
      }
    }

    return res.status(500).json({
      status: "error",
      error: "Electricity purchase failed",
      message: error.message,
      reference: transaction?.reference,
      details: error.response?.data || "No additional details",
    });
  }
};

const purchaseTv = async (req, res) => {
  let transaction;
  let userBalance;
  let user;

  try {
    const { smartCardNumber, provider, plan, amount, planID, providerID } =
      req.body;

    console.log("TV Purchase Request:", req.body);

    // Validate inputs
    if (
      !smartCardNumber ||
      !provider ||
      !plan ||
      !amount ||
      !planID ||
      !providerID
    ) {
      return res.status(400).json({
        error: "All fields are required",
      });
    }

    // Get user and check balance first
    user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Store original balance
    userBalance = user.balance;

    // Check balance before proceeding
    if (userBalance < amount) {
      return res.status(400).json({
        error: "Insufficient balance",
        required: amount,
        available: userBalance,
      });
    }

    // Create pending transaction
    transaction = new Transaction({
      user: req.user._id,
      type: "tv",
      transaction_type: "debit",
      amount,
      provider,
      smartCardNumber,
      plan,
      reference: `TV${Date.now()}${Math.floor(Math.random() * 1000)}`,
      status: "pending",
    });
    await transaction.save();

    // Make API call BEFORE deducting balance
    let apiResponse;
    try {
      apiResponse = await api.post(`${apiUrl}/cablesub`, {
        cablename: providerID,
        cableplan: planID,
        smart_card_number: smartCardNumber,
      });

      // Strict validation of API response
      if (
        !apiResponse.data ||
        apiResponse.data.count === 0 ||
        (apiResponse.data.results && apiResponse.data.results.length === 0) ||
        apiResponse.data.error ||
        apiResponse.data.status === "failed"
      ) {
        throw new Error(
          apiResponse.data?.message ||
            "TV subscription failed - Invalid API response"
        );
      }
    } catch (apiError) {
      // API call failed or invalid response
      transaction.status = "failed";
      await transaction.save();

      throw new Error(
        apiError.response?.data?.message ||
          apiError.message ||
          "TV subscription API call failed"
      );
    }

    // Only proceed with balance deduction if API call was successful
    try {
      await checkAndDeductBalance(req.user._id, amount);
    } catch (deductError) {
      transaction.status = "failed";
      await transaction.save();
      throw new Error("Failed to deduct balance: " + deductError.message);
    }

    // Update transaction to completed
    transaction.status = "completed";
    await transaction.save();

    // Add points
    await user.addPoints("tv");

    return res.json({
      status: "success",
      message: "TV subscription successful",
      reference: transaction.reference,
      details: apiResponse.data,
    });
  } catch (error) {
    console.error("TV Purchase Error:", error);
    console.error("Error details:", error.response?.data);

    // Always rollback if balance was deducted
    if (userBalance !== undefined && user) {
      try {
        const currentUser = await User.findById(user._id);
        if (currentUser.balance !== userBalance) {
          currentUser.balance = userBalance;
          await currentUser.save();
        }
      } catch (rollbackError) {
        console.error("Critical: Balance rollback failed:", rollbackError);
      }
    }

    // Ensure transaction is marked as failed
    if (transaction) {
      try {
        transaction.status = "failed";
        await transaction.save();
      } catch (txError) {
        console.error("Transaction status update failed:", txError);
      }
    }

    return res.status(500).json({
      status: "error",
      error: "TV subscription failed",
      message: error.message,
      reference: transaction?.reference,
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

      // Add points for successful transaction
      await user.addPoints("airtime");

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
        .lean(),
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
          to: Math.min(skip + transactions.length, totalCount),
        },
      },
    });
  } catch (error) {
    console.error("Transaction History Error:", error);
    res.status(500).json({
      error: "Failed to fetch transactions",
      message: error.message,
    });
  }
};

const getBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "balance email fullname lastFunded points"
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const recentTransactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5);

    // Format each transaction amount
    const formattedTransactions = recentTransactions.map((t) => ({
      ...t.toObject(),
      formattedAmount: `₦${Math.floor(t.amount).toLocaleString("en-NG")}${
        t.amount % 1 > 0
          ? `.${((t.amount % 1) * 100).toFixed(0).padStart(2, "0")}`
          : ".00"
      }`,
    }));

    res.json({
      ...user.toObject(),
      balance: user.getFormattedBalance(),
      points: user.points || 0,
      recentTransactions: formattedTransactions,
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
  const { reference } = req.params; // Move reference declaration to the top

  try {
    if (!reference) {
      return res.status(400).json({
        status: "failed",
        message: "Payment reference is required",
      });
    }

    const response = await paystack.verifyPayment(reference);

    if (!response.data) {
      return res.status(400).json({
        status: "failed",
        message: "Invalid payment verification response",
        reference,
      });
    }

    switch (response.data.status) {
      case "success":
        return await handleSuccessfulPayment(response.data, req.user._id, res);

      case "abandoned":
        return res.status(400).json({
          status: "failed",
          message: "Payment was abandoned by user",
          details: {
            reference,
            reason: "Transaction not completed",
            status: response.data.status,
          },
        });

      case "failed":
        return res.status(400).json({
          status: "failed",
          message: "Payment failed",
          details: {
            reference,
            reason: response.data.gateway_response || "Transaction failed",
            status: response.data.status,
          },
        });

      default:
        return res.status(400).json({
          status: "failed",
          message: "Payment verification failed",
          details: {
            reference,
            status: response.data.status,
            gateway_response: response.data.gateway_response,
          },
        });
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(500).json({
      status: "error",
      message: "Purchase failed",
      error: error.message,
      reference, // Now reference is available in error case
    });
  }
};

// Helper function to handle successful payments
async function handleSuccessfulPayment(paymentData, userId, res) {
  const metadata = paymentData.metadata || {};
  const amount = paymentData.amount / 100;

  try {
    if (metadata.paymentType === "direct") {
      let serviceResponse;
      switch (metadata.type) {
        case "airtime":
          serviceResponse = await handleAirtimePurchase(
            metadata.serviceDetails,
            amount,
            userId,
            paymentData.reference
          );
          break;

        case "data":
          serviceResponse = await handleDataPurchase(
            metadata.serviceDetails,
            amount,
            userId,
            paymentData.reference
          );
          break;

        case "tv":
          serviceResponse = await handleTvPurchase(
            metadata.serviceDetails,
            amount,
            userId,
            paymentData.reference
          );
          break;

        case "electricity":
          serviceResponse = await handleElectricityPurchase(
            metadata.serviceDetails,
            amount,
            userId,
            paymentData.reference
          );
          break;

        default:
          throw new Error(`Unsupported service type: ${metadata.type}`);
      }

      return res.json({
        status: "success",
        message: `${metadata.type} purchase successful`,
        reference: paymentData.reference,
        details: serviceResponse,
      });
    } else {
      // Handle wallet funding
      const user = await User.findById(userId);
      user.balance += amount;
      await user.save();

      await Transaction.create({
        user: userId,
        amount,
        type: "wallet_funding",
        transaction_type: "credit",
        provider: "paystack",
        reference: paymentData.reference,
        status: "completed",
      });

      return res.json({
        status: "success",
        message: "Wallet funded successfully",
        reference: paymentData.reference,
        amount,
      });
    }
  } catch (error) {
    console.error("Payment processing error:", error);
    throw error;
  }
}

const initializeDirectPurchase = async (req, res) => {
  try {
    const { amount, type, serviceDetails } = req.body;
    const user = await User.findById(req.user._id);

    const metadata = {
      userId: user._id,
      type,
      serviceDetails,
      paymentType: "direct",
      email: user.email, // Add email to metadata for verification
    };

    const response = await initializeDirectPayment(
      amount,
      user.email,
      metadata
    );
    res.json(response);
  } catch (error) {
    console.error("Direct Payment Error:", error);
    res.status(500).json({
      status: "error",
      message: "Payment initialization failed",
      error: error.message,
    });
  }
};

const convertPoints = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const result = await user.convertPointsToBalance();

    await Transaction.create({
      user: user._id,
      type: "wallet_funding",
      transaction_type: "credit",
      amount: result.amountAdded,
      provider: "points_conversion",
      status: "completed",
      reference: `PNT${Date.now()}`,
    });

    res.json({
      message: "Points converted successfully",
      convertedPoints: result.convertedPoints,
      amountAdded: `₦${result.amountAdded.toLocaleString("en-NG")}.00`,
      remainingPoints: result.remainingPoints,
      newBalance: user.getFormattedBalance(),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getPoints = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("points").lean();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      points: user.points || 0,
      pointsWorth: Math.floor((user.points || 0) / 100) * 200, // Convert to naira value
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Add new verification method
const verifyTvCard = async (req, res) => {
  try {
    const { smartCardNumber, cablename } = req.query;

    if (!smartCardNumber || !cablename) {
      return res.status(400).json({
        error: "Smart card number and cable name are required",
      });
    }

    const response = await api.get(
      `https://ultrasmartdata.com/ajax/validate_iuc?smart_card_number=${smartCardNumber}&cablename=${cablename.toUpperCase()}`
    );

    res.json(response.data);
  } catch (error) {
    console.error("Card Verification Error:", error);
    res.status(500).json({
      error: "Card verification failed",
      message: error.message,
      details: error.response?.data || "No additional details",
    });
  }
};
const verifyElectricityMeter = async (req, res) => {
  try {
    const { disco_name, amount, meter_number, MeterType } = req.query;

    if (!disco_name || !amount || !meter_number || !MeterType) {
      return res.status(400).json({
        error: "Disco name, amount, meter number, and meter type are required",
      });
    }

    const meterTypeString = MeterType === "1" ? "PREPAID" : "POSTPAID";

    const response = await api.get(
      `https://ultrasmartdata.com/ajax/validate_meter_number?meternumber=${meter_number}&disconame=${disco_name}&mtype=${meterTypeString}`
    );

    res.json(response.data);
  } catch (error) {
    console.error("Meter Verification Error:", error);
    res.status(500).json({
      error: "Meter verification failed",
      message: error.message,
      details: error.response?.data || "No additional details",
    });
  }
};

module.exports = verifyElectricityMeter;

// Make sure all methods are explicitly exported
module.exports = {
  purchaseElectricity,
  purchaseTv,
  purchaseAirtime,
  getTransactions,
  getBalance,
  getFundingHistory,
  initializePayment,
  verifyPayment,
  convertPoints,
  getPoints,
  verifyTvCard,
  verifyElectricityMeter,
  initializeDirectPurchase,
};

// Helper functions for different service types
async function handleAirtimePurchase(details, amount, userId, reference) {
  try {
    // Format request data according to API requirements
    const requestData = {
      mobile_number: details.phone,
      network: details.network || details.provider, // Handle both possible field names
      Ported_number: true,
      airtime_type: "VTU",
      amount: parseInt(amount), // Ensure amount is a number
      reference: reference, // Include reference in request
    };

    // Make API call with proper error handling
    const response = await api.post(`${apiUrl}/topup/`, requestData);

    // Create transaction regardless of API response
    const transaction = await Transaction.create({
      user: userId,
      type: "airtime",
      transaction_type: "debit",
      amount,
      provider: details.network || details.provider,
      phone: details.phone,
      reference,
      status: "pending",
    });

    // Check response status
    if (
      response.data &&
      (response.data.Status === "successful" ||
        response.data.status === "success")
    ) {
      // Update transaction to completed
      transaction.status = "completed";
      await transaction.save();

      // Add points for successful transaction
      const user = await User.findById(userId);
      if (user) {
        await user.addPoints("airtime");
      }

      return {
        status: "success",
        message: "Airtime purchase successful",
        reference,
        details: response.data,
      };
    } else {
      // Mark transaction as failed
      transaction.status = "failed";
      await transaction.save();

      throw new Error(response.data?.message || "Airtime purchase failed");
    }
  } catch (error) {
    console.error("Airtime Purchase Error:", {
      error: error.message,
      response: error.response?.data,
      details: details,
    });

    // Create failed transaction if not already created
    await Transaction.create({
      user: userId,
      type: "airtime",
      transaction_type: "debit",
      amount,
      provider: details.network || details.provider,
      phone: details.phone,
      reference,
      status: "failed",
    });

    throw new Error(
      `Airtime purchase failed: ${
        error.response?.data?.message || error.message
      }`
    );
  }
}

// Add similar handlers for other services
async function handleDataPurchase(details, amount, userId, reference) {
  const response = await api.post(`${apiUrl}/data/`, {
    network: details.network,
    mobile_number: details.phone,
    plan: details.plan,
    Ported_number: true,
  });

  const status = response.data.Status === "successful" ? "completed" : "failed";

  await Transaction.create({
    user: userId,
    type: "data",
    transaction_type: "debit",
    amount,
    provider: details.network,
    phone: details.phone,
    plan: details.plan,
    reference,
    status,
  });

  if (status === "failed") {
    throw new Error("Data purchase failed: " + response.data.message);
  }

  return response.data;
}

async function handleTvPurchase(details, amount, userId, reference) {
  console.log("Processing TV subscription:", details);

  const response = await api.post(`${apiUrl}/cablesub`, {
    cablename: details.providerID,
    cableplan: details.planID,
    smart_card_number: details.smartCardNumber,
  });

  const status = response.data.Status === "successful" ? "completed" : "failed";

  await Transaction.create({
    user: userId,
    type: "tv",
    transaction_type: "debit",
    amount,
    provider: details.provider,
    smartCardNumber: details.smartCardNumber,
    plan: details.plan,
    reference,
    status,
  });

  if (status === "failed") {
    throw new Error("TV subscription failed: " + response.data.message);
  }

  return response.data;
}

async function handleElectricityPurchase(details, amount, userId, reference) {
  console.log("Processing electricity purchase:", details);

  const response = await api.post(`${apiUrl}/billpayment`, {
    disco_name: details.disco_name,
    amount,
    meter_number: details.meter_number,
    MeterType: details.meter_type,
  });

  // console.log("Electricity API Response:", response.data);

  const status =
    response.data.Status === "successful" || response.data.status === "success"
      ? "completed"
      : "failed";

  await Transaction.create({
    user: userId,
    type: "electricity",
    transaction_type: "debit",
    amount,
    provider: details.disco_name,
    meterNumber: details.meter_number,
    reference,
    status,
  });

  if (status === "failed") {
    throw new Error(response.data?.message || "Electricity purchase failed");
  }

  // Add points on successful purchase
  const user = await User.findById(userId);
  if (user) {
    await user.addPoints("electricity");
  }

  return response.data;
}
