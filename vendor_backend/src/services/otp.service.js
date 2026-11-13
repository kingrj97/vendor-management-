// ==========================================
// OTP SERVICE (shared helpers)
// Is file ko backend me  services/otp.service.js  naam se rakho.
// ==========================================

const crypto = require("crypto");

const pool = require("../db");
const { sendOtpSms } = require("./sms.service");

// ---------- Settings ----------

const OTP_PURPOSE = "registration";
const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_PER_HOUR = 5;

// OTP_SECRET ke bina server start hi nahi hoga (koi default secret nahi)
if (!process.env.OTP_SECRET || process.env.OTP_SECRET.length < 32) {
  throw new Error(
    "OTP_SECRET must be set in .env and be at least 32 characters long"
  );
}

const OTP_SECRET = process.env.OTP_SECRET;

// Sirf local development me OTP console me dikhao (SMS cost bachane ke liye).
// Dono conditions chahiye, isliye production me galti se on nahi hoga.
const DEV_DRY_RUN =
  process.env.NODE_ENV === "development" &&
  process.env.SMS_DRY_RUN === "true";

// 9876543210 -> XXXXXX3210
function maskMobile(mobileNo) {
  return `XXXXXX${String(mobileNo).slice(-4)}`;
}

// OTP database me plain nahi, hash karke save hota hai
function hashOtp(otp, mobileNo) {
  return crypto
    .createHmac("sha256", OTP_SECRET)
    .update(`${mobileNo}:${otp}`)
    .digest("hex");
}

function isOtpMatch(otp, mobileNo, storedHash) {
  const expected = Buffer.from(hashOtp(otp, mobileNo));
  const actual = Buffer.from(String(storedHash ?? ""));

  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}

// Naya OTP banao aur vendor_otp_verifications me save karo
// db = transaction ka client ya pool
// Sabhi vendors (admin bhi) ke liye random OTP
async function createOtpRecord(db, vendorId, mobileNo, purpose = OTP_PURPOSE) {
  const otp = String(crypto.randomInt(100000, 1000000));

  const result = await db.query(
    `
      INSERT INTO public.vendor_otp_verifications
        (vendor_id, mobile_no, purpose, otp, attempts, expires_at)
      VALUES
        ($1, $2, $3, $4, 0, NOW() + make_interval(mins => $5::int))
      RETURNING id
    `,
    [vendorId, mobileNo, purpose, hashOtp(otp, mobileNo), OTP_EXPIRY_MINUTES]
  );

  return { otp, otpId: result.rows[0].id };
}

function buildMessage(otp, purpose) {
  const label = purpose === "login" ? "Vendor Login" : "Vendor Registration";

  return `Your OTP for ${label} is ${otp}. It is valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share it with anyone.`;
}

// SMS bhejo aur provider ka response sms_resp me save karo
// purpose optional hai, purane calls (deliverOtp(otpId, mobileNo, otp)) bhi chalenge
async function deliverOtp(otpId, mobileNo, otp, purpose = OTP_PURPOSE) {
  // Local development: SMS ki jagah console me dikhao
  if (DEV_DRY_RUN) {
    console.log(`[DEV OTP] ${maskMobile(mobileNo)} -> ${otp}`);
    return true;
  }

  let result;

  try {
    result = await sendOtpSms({
      mobileNo,
      otp,
      // MSG91 me message template se aata hai, ye text sirf "custom" gateway ke liye hai
      message: buildMessage(otp, purpose)
    });
  } catch (error) {
    result = { success: false, response: error.message };
  }

  try {
    await pool.query(
      `UPDATE public.vendor_otp_verifications SET sms_resp = $1 WHERE id = $2`,
      [JSON.stringify(result), otpId]
    );
  } catch (error) {
    console.error("Could not save sms_resp:", error.message);
  }

  return result.success === true;
}

module.exports = {
  OTP_PURPOSE,
  OTP_EXPIRY_MINUTES,
  MAX_OTP_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  MAX_OTP_PER_HOUR,
  maskMobile,
  hashOtp,
  isOtpMatch,
  createOtpRecord,
  deliverOtp
};