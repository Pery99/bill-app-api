const axios = require("axios");

const api = axios.create({
  headers: {
    Authorization: `Token ${process.env.API_TOKEN}`,
    "Content-Type": "application/json",
  },
});

const getDataPlans = async (req, res) => {
  try {
    const { provider } = req.params;
    const response = await api.get(`${process.env.AIRTIME_API_URL}/user`);
    const dataPlans = response.data.Dataplans;
    res.json([dataPlans]);
  } catch (error) {
    console.error("Error fetching data plans:", error);
    res.status(500).json({
      error: "Failed to fetch data plans",
      details: error.response?.data || error.message,
    });
  }
};

module.exports = {
  getDataPlans,
};
