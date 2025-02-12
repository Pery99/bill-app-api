const mongoose = require("mongoose");

const dataPlanSchema = new mongoose.Schema({
  id: Number,
  dataplan_id: String,
  network: Number,
  plan_type: String,
  plan_network: String,
  month_validate: String,
  plan: String,
  plan_amount: String,
  category: String,
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Fix: Simply register the model once
module.exports = mongoose.model("DataPlan", dataPlanSchema);
