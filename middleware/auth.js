const jwt = require("jsonwebtoken");

const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return res
        .status(401)
        .json({ error: "Please provide authentication token" });
    }
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { _id: verified.id };
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

module.exports = auth;
