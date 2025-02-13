const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const compression = require("compression");
const cron = require("node-cron");
const axios = require("axios");

require("dotenv").config();

const app = express();

app.use(compression());

const allowedOrigins = [
  "http://localhost:5173",
  "https://quick-bills.vercel.app",
  "https://www.shaabanexpress.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (allowedOrigins.includes(origin) || !origin) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Access-Control-Allow-Origin",
    ],
  })
);

app.use(express.json());
app.use(cookieParser());

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Routes
const authRoutes = require("./routes/auth");
const transactionRoutes = require("./routes/transactions");
const adminRoutes = require("./routes/admin"); 

app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/admin", adminRoutes); 

cron.schedule("*/5 * * * *", async () => {
  try {
    await axios.get("https://bill-app-api.onrender.com/");
    console.log("Pinged server to prevent cold start");
  } catch (error) {
    console.error("Error pinging server:", error.message);
  }
});

// Protected route example
const auth = require("./middleware/auth");
app.get("/protected", auth, (req, res) => {
  res.json({ message: "This is a protected route" });
});

app.get("/", (req, res) => {
  res.send("Shaaban Express API");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
