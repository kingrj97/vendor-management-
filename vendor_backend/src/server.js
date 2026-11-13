const dotenv = require("dotenv");

// .env sabse pehle load karo, db.js import hone se pehle
dotenv.config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const multer = require("multer");

const pool = require("./db");
const auth = require("./middleware/auth.middleware");
const vendorRoutes = require("./routes/vendor.routes");

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// uploads folder: src/ se ek level upar (backend root)
const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads");


// ==========================================
// STARTUP CHECKS
// ==========================================

if (IS_PRODUCTION) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be set and be at least 32 characters in production.");
  }

  if (!process.env.CORS_ORIGIN) {
    throw new Error("CORS_ORIGIN must be set in production.");
  }
}

// Comma se alag multiple origins: https://a.com,https://www.a.com
const allowedOrigins = String(
  process.env.CORS_ORIGIN || "http://localhost:4200"
)
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);


// ==========================================
// PROXY (Nginx / Render / Heroku ke peeche ho to TRUST_PROXY=1)
// Iske bina rate limit sabko ek hi IP samjhega
// ==========================================

if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}


// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

// Default helmet protections ON (frameguard, CSP, nosniff, HSTS...)
// Sirf cross-origin resource policy relax: Angular (4200) se API/files load ho sakein
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

app.use(
  cors({
    origin(origin, callback) {
      // Origin header nahi hota (curl, server-to-server, health check): allow
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,                      // cookie ke liye zaroori
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(cookieParser());                    // req.cookies ke liye (auth.middleware padhta hai)
app.use(express.json({ limit: "1mb" }));


// ==========================================
// UPLOADED FILES (PROTECTED)
// Login zaroori. Admin sab dekh sakta hai, vendor sirf apni files.
// ==========================================

// Vendor ki files "<vendorId>_<naam>/..." folder me hoti hain
// (vendor.controller.js ka createSafeFolderName). Isliye path ka pehla folder
// "<apni id>_" se shuru hona chahiye. DB query ki zarurat nahi.
function checkFileAccess(req, res, next) {
  // Admin ko sab files
  if (req.user?.is_admin === 1) {
    return next();
  }

  let relativePath;

  try {
    relativePath = decodeURIComponent(req.path).replace(/^\/+/, "");
  } catch {
    return res.status(400).json({ success: false, message: "Invalid file path." });
  }

  if (
    !relativePath ||
    relativePath.includes("..") ||
    relativePath.includes("\\")
  ) {
    return res.status(400).json({ success: false, message: "Invalid file path." });
  }

  const rootFolder = relativePath.split("/")[0];

  if (rootFolder.startsWith(`${req.user.id}_`)) {
    return next();
  }

  // 404 (403 nahi), taaki file ke exist karne ka pata na chale
  return res.status(404).json({ success: false, message: "File not found." });
}

const SAFE_INLINE_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);

app.use(
  "/uploads",
  auth,
  checkFileAccess,
  (req, res, next) => {
    // PDF ko Angular iframe me dikhane ki permission (sirf is route par)
    res.removeHeader("X-Frame-Options");
    res.setHeader(
      "Content-Security-Policy",
      `frame-ancestors 'self' ${allowedOrigins.join(" ")}`
    );

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");

    // PDF/image ke alawa koi bhi file browser me khulne ki jagah download hogi
    // (uploaded HTML/SVG me script chalne se bachav)
    const extension = path.extname(req.path).toLowerCase();

    if (!SAFE_INLINE_EXTENSIONS.has(extension)) {
      res.setHeader("Content-Disposition", "attachment");
    }

    next();
  },
  express.static(UPLOADS_DIR, {
    dotfiles: "deny",
    index: false
  })
);


// ==========================================
// ROUTES
// ==========================================

// Database health check
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      success: true,
      message: "Vendor backend and database are working."
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed."
    });
  }
});

// Vendor routes
app.use("/api/vendors", vendorRoutes);

// Unknown route
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found."
  });
});


// ==========================================
// CENTRAL ERROR HANDLER
// ==========================================

app.use((error, req, res, next) => {
  // Poora stack log karo (sirf server console me)
  console.error(error.stack || error.message);

  // CORS reject
  if (error.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "Origin not allowed."
    });
  }

  // Multer errors
  if (error instanceof multer.MulterError) {
    let message = "Upload limit exceeded. Please check the uploaded files.";

    if (error.code === "LIMIT_FILE_SIZE") {
      message = "File is too large. Maximum incoming file size is 25 MB.";
    } else if (error.code === "LIMIT_UNEXPECTED_FILE") {
      message = "Unexpected file field in the upload.";
    } else if (error.code === "LIMIT_FILE_COUNT") {
      message = "Too many files uploaded.";
    }

    return res.status(400).json({
      success: false,
      message
    });
  }

  // Galat JSON body
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body."
    });
  }

  // Humne jo errors khud banaye (status ke saath), unka message user ko dikhao
  if (error.status && error.status < 500) {
    return res.status(error.status).json({
      success: false,
      message: error.message
    });
  }

  // Baaki sab (DB errors, code bugs): andar ki detail user ko mat dikhao
  res.status(500).json({
    success: false,
    message: "Internal server error.",
    ...(IS_PRODUCTION ? {} : { detail: error.message })
  });
});


// ==========================================
// PROCESS SAFETY
// ==========================================

process.on("unhandledRejection", reason => {
  console.error("Unhandled promise rejection:", reason);
});


// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log(`Vendor API running at http://localhost:${PORT}`);
  console.log(`Serving protected uploads from: ${UPLOADS_DIR}`);
});