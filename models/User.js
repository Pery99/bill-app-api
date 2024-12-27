const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullname: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    balance: {
      type: Number,
      default: 0,
    },
    lastFunded: {
      type: Date,
      default: null,
    },
    fundingHistory: [
      {
        amount: Number,
        paymentMethod: String,
        reference: String,
        status: {
          type: String,
          enum: ["pending", "completed", "failed"],
          default: "pending",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

// Add method to update balance
userSchema.methods.updateBalance = async function (amount, type = "credit") {
  if (type === "debit" && this.balance < amount) {
    throw new Error("Insufficient balance");
  }

  this.balance =
    type === "credit" ? this.balance + amount : this.balance - amount;

  if (type === "credit") {
    this.lastFunded = new Date();
    this.fundingHistory.push({
      amount,
      paymentMethod: "paystack",
      status: "completed",
    });
  }

  return this.save();
};

module.exports = mongoose.model("User", userSchema);
