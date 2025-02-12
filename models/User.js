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
    points: {
      type: Number,
      default: 0,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
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

// Add method to handle points
userSchema.methods.addPoints = async function (transactionType) {
  const pointsMap = {
    airtime: 2,
    data: 5,
    electricity: 3,
    tv: 3,
  };

  this.points += pointsMap[transactionType] || 0;
  await this.save();
  return this.points;
};

// Add method to convert points to balance
userSchema.methods.convertPointsToBalance = async function () {
  if (this.points < 100) {
    throw new Error("Minimum 100 points required for conversion");
  }

  const conversionRate = 200 / 100; // 200 naira per 100 points
  const pointsToConvert = Math.floor(this.points / 100) * 100;
  const amountToAdd = pointsToConvert * conversionRate;

  this.points -= pointsToConvert;
  this.balance += amountToAdd;

  await this.save();
  return {
    convertedPoints: pointsToConvert,
    amountAdded: amountToAdd,
    remainingPoints: this.points,
    newBalance: this.balance,
  };
};

userSchema.methods.getFormattedBalance = function () {
  const mainUnit = Math.floor(this.balance);
  const kobo = Math.round((this.balance - mainUnit) * 100);
  return {
    formatted: mainUnit.toLocaleString("en-NG"),
    kobo: kobo,
    raw: this.balance,
    full: `₦${mainUnit.toLocaleString("en-NG")}${
      kobo > 0 ? `.${kobo.toString().padStart(2, "0")}` : ".00"
    }`,
  };
};

module.exports = mongoose.model("User", userSchema);
