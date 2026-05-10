require("dotenv").config();

const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const http = require("http");
const jwt = require("jsonwebtoken");

const app = express();
const server = http.createServer(app);

// ==========================
// CORS origin resolver
// Works for: localhost dev, ANY *.vercel.app deploy,
// and any custom domain set via CLIENT_URL env var on Render.
// ==========================
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // allow server-to-server / Postman / mobile
  if (origin === "http://localhost:5173") return true;
  if (origin === "http://localhost:3000") return true;
  if (origin.endsWith(".vercel.app")) return true;  // ← any Vercel URL
  if (process.env.CLIENT_URL && origin === process.env.CLIENT_URL) return true;
  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
};

// ==========================
// Models
// ==========================
const Product = require("./models/Product");
const Order = require("./models/Order");

// ==========================
// Database
// ==========================
console.log("Connecting DB...");
connectDB();

// ==========================
// Middleware
// ==========================
app.use(cors(corsOptions)); // handles preflight OPTIONS automatically
app.use(express.json({ limit: '10mb' }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// ==========================
// Health Route
// ==========================
app.get("/", (req, res) => {
  res.send("CampusCart Backend Running 🚀");
});

// ==========================
// Routes
// ==========================
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));

// ==========================
// Public General Routes
// ==========================
app.get("/api/public/stats", async (req, res) => {
  try {
    const [totalUsers, totalProducts, totalOrders] = await Promise.all([
      require("./models/User").countDocuments({ isAdmin: false }),
      require("./models/Product").countDocuments({}),
      require("./models/Order").countDocuments({})
    ]);
    res.json({ totalUsers, totalProducts, totalOrders });
  } catch (err) {
    console.error("Public stats error:", err.message);
    res.status(500).json({ msg: "Server Error" });
  }
});


// ==========================
// Error Handler
// ==========================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ msg: "Server Error", error: err.message });
});

// ==========================
// Start Server
// ==========================
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // ✅ Keep-alive ping: prevents Render free tier from sleeping
  // Pings itself every 14 minutes (Render sleeps after 15 min idle)
  if (process.env.RENDER_EXTERNAL_URL) {
    const pingUrl = process.env.RENDER_EXTERNAL_URL;
    setInterval(() => {
      require("https").get(pingUrl, (res) => {
        console.log(`[Keep-alive] Pinged ${pingUrl} → ${res.statusCode}`);
      }).on("error", (err) => {
        console.warn("[Keep-alive] Ping failed:", err.message);
      });
    }, 14 * 60 * 1000); // every 14 minutes
  }
});