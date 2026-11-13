const express = require("express");
const rateLimit = require("express-rate-limit");

const {
  upload,
  compressUploadedFiles
} = require("../middleware/upload.middleware");

const {
  registerVendor,
  getMyVendors,
  getVendorById,
  updateVendor,
  updateVendorDetails
} = require("../controllers/vendor.controller");

const {
  verifyOtp,
  resendOtp
} = require("../controllers/vendor_otp.controller");

const {
  sendLoginOtp,
  verifyLoginOtp,
  logout
} = require("../controllers/vendor_login.controller");

const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getSites
} = require("../controllers/common.controller");

// Naya auth.middleware.js: module.exports = authenticate,
// aur uske upar .requireAdmin bhi attached hai
const auth = require("../middleware/auth.middleware");
const { requireAdmin } = auth;

const dashboard = require("../controllers/dashboard.controller");

const router = express.Router();


// ==========================================
// RATE LIMITERS (IP based)
// ==========================================

function makeLimiter(windowMinutes, max, message) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message }
  });
}

// SMS bhejne wale routes (login send-otp + resend-otp ek hi counter share karte hain,
// kyunki dono se SMS cost hota hai)
const sendOtpLimiter = makeLimiter(
  15,
  5,
  "Too many OTP requests. Please try again later."
);

// OTP verify try karne wale routes
const verifyOtpLimiter = makeLimiter(
  15,
  20,
  "Too many attempts. Please try again later."
);

// Public registration (file upload bhi hota hai)
const registerLimiter = makeLimiter(
  60,
  10,
  "Too many registration attempts. Please try again later."
);


// ==========================================
// CSRF DEFENSE (Origin check)
// app.js wala hi CORS_ORIGIN use hota hai (comma se multiple origins)
// Cookie auth ke saath sameSite=lax ke upar extra safety.
// ==========================================

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const allowedOrigins = String(
  process.env.CORS_ORIGIN || "http://localhost:4200"
)
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

function verifyOrigin(req, res, next) {

  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const origin = req.headers.origin;

  // Browser POST/PUT/PATCH/DELETE par Origin hamesha bhejta hai.
  // Origin mile aur allowed list me na ho to block.
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({
      success: false,
      message: "Request origin not allowed."
    });
  }

  return next();
}

router.use(verifyOrigin);


// ==========================================
// :id VALIDATION
// Agar vendors.id UUID hai to ye block hata do
// ==========================================

router.param("id", (req, res, next, id) => {

  if (!/^[0-9]+$/.test(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid id."
    });
  }

  return next();
});


// ==========================================
// CONDITIONAL OTP AUTHENTICATION
// REGISTER = PUBLIC
// UPDATE / RENEW = LOGIN REQUIRED
// ==========================================

function conditionalOtpAuth(req, res, next) {

  const mode = String(req.body?.mode || "register").toLowerCase();

  if (!["register", "update", "renew"].includes(mode)) {
    return res.status(400).json({
      success: false,
      message: "Invalid OTP verification mode."
    });
  }

  if (mode === "register") {
    return next();
  }

  return auth(req, res, next);
}


// ==========================================
// COMMON ATTACHMENT FIELDS
// ==========================================

const attachmentFieldNames = [
  "gst_certificate_attachment",
  "pan_card_attachment",
  "drug_licence_attachment",
  "msmed_attachment",
  "cancel_cheque_attachment",
  "company_registration_attachment",
  "authorization_letter_attachment",
  "cin_number_attachment",
  "experience_product_attachment",
  "coa_attachment",
  "experience_with_zydus_attachment",
  "turnover_attachment",
  "assets_attachment",
  "liabilities_attachment",
  "it_return_attachment",
  "client_details"
];

const attachmentFields = attachmentFieldNames.map(name => ({
  name,
  maxCount: 1
}));


// ==========================================
// VENDOR REGISTRATION
// POST /api/vendors/register
// ==========================================

router.post(
  "/register",
  registerLimiter,
  upload.fields(attachmentFields),
  compressUploadedFiles,
  registerVendor
);


// ==========================================
// VENDOR OTP
// REGISTER = PUBLIC
// UPDATE / RENEW = AUTH REQUIRED
// ==========================================

router.post(
  "/verify-otp",
  verifyOtpLimiter,
  conditionalOtpAuth,
  verifyOtp
);

router.post(
  "/resend-otp",
  sendOtpLimiter,
  conditionalOtpAuth,
  resendOtp
);


// ==========================================
// VENDOR LOGIN
// ==========================================

router.post(
  "/login/send-otp",
  sendOtpLimiter,
  sendLoginOtp
);

router.post(
  "/login/verify-otp",
  verifyOtpLimiter,
  verifyLoginOtp
);

router.post(
  "/logout",
  auth,
  logout
);


// ==========================================
// CATEGORY MASTER
// ==========================================

router.get(
  "/categories",
  getCategories
);

router.post(
  "/categories",
  auth,
  requireAdmin,
  createCategory
);

router.put(
  "/categories/:id",
  auth,
  requireAdmin,
  updateCategory
);

router.delete(
  "/categories/:id",
  auth,
  requireAdmin,
  deleteCategory
);


// ==========================================
// SITE MASTER
// ==========================================

router.get(
  "/sites",
  getSites
);


// ==========================================
// PURCHASER DASHBOARD
// ==========================================

router.get(
  "/dashboard",
  auth,
  requireAdmin,
  dashboard.getDashboardVendors
);

router.patch(
  "/dashboard/:id/status",
  auth,
  requireAdmin,
  dashboard.updateVendorStatus
);


// ==========================================
// VENDOR PROFILE
// ==========================================

router.get(
  "/me",
  auth,
  getMyVendors
);


// ==========================================
// NORMAL UPDATE
// PUT /api/vendors/update/:id
// ==========================================

router.put(
  "/update/:id",
  auth,
  upload.fields(attachmentFields),
  compressUploadedFiles,
  updateVendorDetails
);


// ==========================================
// VENDOR RENEWAL
// PUT /api/vendors/renew/:id
// ==========================================

router.put(
  "/renew/:id",
  auth,
  upload.fields(attachmentFields),
  compressUploadedFiles,
  updateVendor
);


// ==========================================
// GET VENDOR BY ID
// KEEP THIS ROUTE AT THE END
// ==========================================

router.get(
  "/:id",
  auth,
  getVendorById
);


module.exports = router;