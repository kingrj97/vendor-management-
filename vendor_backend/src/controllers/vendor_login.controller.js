const jwt = require("jsonwebtoken");
const pool = require("../db");

const {
  OTP_EXPIRY_MINUTES,
  MAX_OTP_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  MAX_OTP_PER_HOUR,
  maskMobile,
  isOtpMatch,
  createOtpRecord,
  deliverOtp
} = require("../services/otp.service");

const LOGIN_PURPOSE = "login";
const MOBILE_REGEX = /^[0-9]{10}$/;
const OTP_REGEX = /^[0-9]{6}$/;
const COOKIE_NAME = "vendor_token";
const SESSION_MS = 60 * 60 * 1000; // 1 hour

function cookieOptions() {
  return {
    httpOnly: true,                                  // JS (XSS) cookie nahi padh sakta
    secure: process.env.NODE_ENV === "production",   // sirf HTTPS par
    sameSite: "lax",                                 // CSRF protection (cross-domain ho to "none" + CSRF token)
    maxAge: SESSION_MS,
    path: "/"
  };
}

// Same message hamesha: number registered hai ya nahi, ye leak nahi hoga
const GENERIC_SEND_RESPONSE = {
  success: true,
  message: "If this number is registered, an OTP has been sent.",
  expires_in_seconds: OTP_EXPIRY_MINUTES * 60,
  resend_after_seconds: RESEND_COOLDOWN_SECONDS
};

// ==========================================
// 1. SEND LOGIN OTP
// POST /login/send-otp
// ==========================================
async function sendLoginOtp(req, res, next) {
  try {
    const mobileNo = String(req.body?.mobile_no ?? "").trim();

    if (!MOBILE_REGEX.test(mobileNo)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit mobile number."
      });
    }

    const vendorResult = await pool.query(
      `SELECT id FROM public.vendors WHERE mobile_no = $1 LIMIT 1`,
      [mobileNo]
    );
    const vendor = vendorResult.rows[0];

    // Unregistered number: not registered error for redirecting to registration
    if (!vendor) {
      return res.status(404).json({
        success: false,
        not_registered: true,
        message: "This number is not registered. Redirecting to registration..."
      });
    }

    // Resend cooldown
    const recent = await pool.query(
      `SELECT 1 FROM public.vendor_otp_verifications
       WHERE vendor_id = $1 AND purpose = $2
         AND created_at > NOW() - make_interval(secs => $3::int)
       LIMIT 1`,
      [vendor.id, LOGIN_PURPOSE, RESEND_COOLDOWN_SECONDS]
    );
    if (recent.rowCount > 0) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting a new OTP.`,
        retry_after_seconds: RESEND_COOLDOWN_SECONDS
      });
    }

    // Hourly limit
    const hourly = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM public.vendor_otp_verifications
       WHERE vendor_id = $1 AND purpose = $2
         AND created_at > NOW() - INTERVAL '1 hour'`,
      [vendor.id, LOGIN_PURPOSE]
    );
    if (hourly.rows[0].total >= MAX_OTP_PER_HOUR) {
      return res.status(429).json({
        success: false,
        message: "Too many OTP requests. Please try again after some time."
      });
    }

    // Naya OTP banane se pehle purane unused OTPs invalidate
    await pool.query(
      `UPDATE public.vendor_otp_verifications
       SET expires_at = NOW()
       WHERE vendor_id = $1 AND purpose = $2 AND expires_at > NOW()`,
      [vendor.id, LOGIN_PURPOSE]
    );

    const { otp, otpId } = await createOtpRecord(
      pool,
      vendor.id,
      mobileNo,
      LOGIN_PURPOSE
    );

    const otpSent = await deliverOtp(otpId, mobileNo, otp, LOGIN_PURPOSE);
    if (!otpSent) {
      return res.status(502).json({
        success: false,
        message: "OTP could not be sent. Please try again."
      });
    }

    return res.status(200).json({
      ...GENERIC_SEND_RESPONSE,
      message: `OTP sent to ${maskMobile(mobileNo)}.`
    });
  } catch (error) {
    return next(error);
  }
}

// ==========================================
// 2. VERIFY LOGIN OTP  (verify + login ek hi step me)
// POST /login/verify-otp
// ==========================================
async function verifyLoginOtp(req, res, next) {
  try {
    const mobileNo = String(req.body?.mobile_no ?? "").trim();
    const otp = String(req.body?.otp ?? "").trim();

    if (!MOBILE_REGEX.test(mobileNo) || !OTP_REGEX.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid mobile number and 6-digit OTP."
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not set");
      return res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again later."
      });
    }

    const vendorResult = await pool.query(
      `SELECT id, name, mobile_no, email, status, mobile_no_verify, is_admin
       FROM public.vendors WHERE mobile_no = $1 LIMIT 1`,
      [mobileNo]
    );
    const vendor = vendorResult.rows[0];

    const INVALID = {
      success: false,
      message: "Invalid or expired OTP. Please request a new OTP."
    };

    // Unregistered number
    if (!vendor) {
      return res.status(404).json({
        success: false,
        not_registered: true,
        message: "This number is not registered. Please register first."
      });
    }

    // Latest valid OTP
    const otpResult = await pool.query(
      `SELECT id, otp
       FROM public.vendor_otp_verifications
       WHERE vendor_id = $1 AND purpose = $2 AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1`,
      [vendor.id, LOGIN_PURPOSE]
    );
    const record = otpResult.rows[0];

    if (!record) {
      return res.status(400).json(INVALID);
    }

    // ATOMIC attempt counter: pehle badhao, phir compare.
    // Parallel requests bhi MAX_OTP_ATTEMPTS se zyada try nahi kar sakti.
    const attemptRes = await pool.query(
      `UPDATE public.vendor_otp_verifications
       SET attempts = attempts + 1
       WHERE id = $1 AND attempts < $2
       RETURNING attempts`,
      [record.id, MAX_OTP_ATTEMPTS]
    );

    if (attemptRes.rowCount === 0) {
      return res.status(429).json({
        success: false,
        message: "Too many wrong attempts. Please request a new OTP."
      });
    }

    const attemptsUsed = attemptRes.rows[0].attempts;

    if (!isOtpMatch(otp, mobileNo, record.otp)) {
      const left = MAX_OTP_ATTEMPTS - attemptsUsed;
      return res.status(400).json({
        success: false,
        message:
          left > 0
            ? `Invalid OTP. ${left} attempt(s) left.`
            : "Invalid OTP. Please request a new OTP."
      });
    }

    // OTP single-use: atomic delete. Do parallel request sahi OTP bhejein
    // to sirf ek ko rowCount > 0 milega.
    const consumed = await pool.query(
      `DELETE FROM public.vendor_otp_verifications
       WHERE vendor_id = $1 AND purpose = $2`,
      [vendor.id, LOGIN_PURPOSE]
    );
    if (consumed.rowCount === 0) {
      return res.status(400).json(INVALID);
    }

    // NOTE: yahan mobile_no_verify ko 'verified' NAHI kiya jata.
    // Registration/renew ka verify sirf vendor_otp.controller.js ke
    // verifyOtp se hoga, taaki vendor_approvals me Pending row zaroor bane.

    // Session
    const sessionResult = await pool.query(
      `INSERT INTO public.vendor_sessions (vendor_id, expires_at)
       VALUES ($1, NOW() + INTERVAL '1 hour')
       RETURNING id`,
      [vendor.id]
    );
    const sessionId = sessionResult.rows[0].id;

    // JWT me role/is_admin NAHI: middleware DB se fresh role leta hai
    const token = jwt.sign(
      { id: vendor.id, sid: sessionId },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "1h" }
    );

    res.cookie(COOKIE_NAME, token, cookieOptions());

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: {
        id: vendor.id,
        name: vendor.name,
        mobile_no: vendor.mobile_no,
        email: vendor.email,
        status: vendor.status,
        mobile_no_verify: vendor.mobile_no_verify,
        is_admin: Number(vendor.is_admin) === 1 ? 1 : 0 // sirf UI ke liye
      }
    });
  } catch (error) {
    return next(error);
  }
}

// ==========================================
// 3. LOGOUT  (authenticate middleware ke baad)
// POST /logout
// ==========================================
async function logout(req, res, next) {
  try {
    await pool.query(
      `UPDATE public.vendor_sessions
       SET revoked_at = NOW()
       WHERE id = $1 AND revoked_at IS NULL`,
      [req.user.sid]
    );

    const { maxAge, ...clearOpts } = cookieOptions();
    res.clearCookie(COOKIE_NAME, clearOpts);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully."
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { sendLoginOtp, verifyLoginOtp, logout, COOKIE_NAME };