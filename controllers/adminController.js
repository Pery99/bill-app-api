const Transaction = require("../models/Transaction");
const User = require("../models/User");
const axios = require("axios");

const api = axios.create({
  headers: {
    Authorization: `Token ${process.env.API_TOKEN}`,
    "Content-Type": "application/json",
  },
});

// Dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const [apiResponse, ...stats] = await Promise.all([
      api.get(`${process.env.AIRTIME_API_URL}/user`),
      // Total transactions amount
      Transaction.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      // Transaction counts by type
      Transaction.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }]),
      // Recent transactions
      Transaction.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("user", "fullname email"),
      // User count
      User.countDocuments(),
      // Failed transactions count
      Transaction.countDocuments({ status: "failed" }),
    ]);

    res.json({
      totalAmount: stats[0][0]?.total || 0,
      transactionsByType: stats[1],
      recentTransactions: stats[2],
      totalUsers: stats[3],
      failedTransactions: stats[4],
      apiBalance: {
        amount: apiResponse.data.user?.wallet_balance || 0,
        formatted: `₦${Number(
          apiResponse.data.user?.wallet_balance || 0
        ).toLocaleString("en-NG")}`,
        lastChecked: new Date(),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Transaction management
const getAllTransactions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      status,
      startDate,
      endDate,
    } = req.query;

    const query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .populate("user", "fullname email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments(query);

    res.json({
      transactions,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Refund functionality
const processRefund = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { reason } = req.body;

    const transaction = await Transaction.findById(transactionId).populate(
      "user"
    );

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (transaction.status === "refunded") {
      return res.status(400).json({ message: "Transaction already refunded" });
    }

    // Process refund
    const user = transaction.user;
    await user.updateBalance(transaction.amount, "credit");

    // Update transaction status
    transaction.status = "refunded";
    transaction.refundReason = reason;
    transaction.refundedAt = new Date();
    transaction.refundedBy = req.user._id;
    await transaction.save();

    // Create refund record
    const refundTransaction = new Transaction({
      user: user._id,
      type: "refund",
      transaction_type: "credit",
      amount: transaction.amount,
      reference: `REF-${transaction.reference}`,
      status: "completed",
      originalTransaction: transaction._id,
      reason: reason,
    });
    await refundTransaction.save();

    res.json({
      message: "Refund processed successfully",
      transaction: refundTransaction,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get transaction details
const getTransactionDetails = async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate("user", "fullname email")
      .populate("refundedBy", "fullname email");

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    res.json(transaction);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add new function to get API balance
const getApiBalance = async (req, res) => {
  try {
    const response = await api.get(`${process.env.AIRTIME_API_URL}/user`);

    res.json({
      balance: response.data.user?.wallet_balance || 0,
      formattedBalance: `₦${Number(
        response.data.user?.wallet_balance || 0
      ).toLocaleString("en-NG")}`,
      lastChecked: new Date(),
    });
  } catch (error) {
    console.error("API Balance Error:", error);
    res.status(500).json({
      error: "Failed to fetch API balance",
      details: error.response?.data || error.message,
    });
  }
};

module.exports = {
  getDashboardStats,
  getAllTransactions,
  processRefund,
  getTransactionDetails,
  getApiBalance,
};
