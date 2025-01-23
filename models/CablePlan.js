const mongoose = require('mongoose');

const cablePlanSchema = new mongoose.Schema({
  id: Number,
  cableplan_id: String,
  cable: {
    type: String,
    enum: ['GOTV', 'DSTV', 'STARTIME'],
    required: true
  },
  package: {
    type: String,
    required: true
  },
  plan_amount: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model('CablePlan', cablePlanSchema);
