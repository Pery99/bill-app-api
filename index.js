const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require('cookie-parser');
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cookieParser());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Routes
const authRoutes = require("./routes/auth");
const transactionRoutes = require("./routes/transactions");

app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);

// Protected route example
const auth = require("./middleware/auth");
app.get("/protected", auth, (req, res) => {
  res.json({ message: "This is a protected route" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
