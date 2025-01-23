const CablePlan = require('../models/CablePlan');

const getCablePlans = async (req, res) => {
  try {
    const { provider } = req.query;
    let response = {};

    if (provider) {
      const plans = await CablePlan.find({ 
        cable: provider.toUpperCase() 
      }).sort({ plan_amount: 1 });
      response = plans;
    } else {
      const [gotvPlans, dstvPlans, startimePlans] = await Promise.all([
        CablePlan.find({ cable: 'GOTV' }).sort({ plan_amount: 1 }),
        CablePlan.find({ cable: 'DSTV' }).sort({ plan_amount: 1 }),
        CablePlan.find({ cable: 'STARTIME' }).sort({ plan_amount: 1 })
      ]);

      response = {
        Cableplan: {
          GOTVPLAN: gotvPlans,
          DSTVPLAN: dstvPlans,
          STARTIMEPLAN: startimePlans,
          cablename: [
            { id: 1, name: 'GOTV' },
            { id: 2, name: 'DSTV' },
            { id: 3, name: 'STARTIME' }
          ]
        }
      };
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getCablePlans
};
