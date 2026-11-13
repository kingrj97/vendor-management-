
const pool = require("../db");

const {
  OTP_PURPOSE,
  OTP_EXPIRY_MINUTES,
  MAX_OTP_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  MAX_OTP_PER_HOUR,
  maskMobile,
  isOtpMatch,
  createOtpRecord,
  deliverOtp
} = require("../services/otp.service");


// ==========================================
// COMMON HELPERS
// ==========================================

function parseVendorId(value) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0
    ? id
    : null;
}


function getMode(value, vendor) {

  const mode = String(value || "").toLowerCase();

  if (["register", "update", "renew"].includes(mode)) {
    return mode;
  }

  // Fallback for older frontend requests
  if (vendor?.vendor_type === "Renew") {
    return "renew";
  }

  return "register";
}


// ==========================================
// 1. VERIFY OTP
// Body: { vendor_id, otp, mode }
// mode: register / update / renew
// ==========================================

async function verifyOtp(req, res, next) {

  const vendorId = parseVendorId(req.body?.vendor_id);

  const otp = String(req.body?.otp ?? "").trim();

  if (!vendorId) {
    return res.status(400).json({
      success: false,
      message: "Invalid vendor ID. Please try again."
    });
  }

  if (!/^[0-9]{6}$/.test(otp)) {
    return res.status(400).json({
      success: false,
      message: "OTP must be exactly 6 digits!",
      errors: [
        {
          field: "otp",
          message: "OTP must be exactly 6 digits!"
        }
      ]
    });
  }

  const client = await pool.connect();

  let transactionStarted = false;

  try {

    await client.query("BEGIN");

    transactionStarted = true;


    // ==========================================
    // GET VENDOR
    // ==========================================

    const vendorResult = await client.query(
      `
        SELECT
          id,
          mobile_no,
          mobile_no_verify,
          vendor_type
        FROM public.vendors
        WHERE id = $1
        FOR UPDATE
      `,
      [vendorId]
    );

    const vendor = vendorResult.rows[0];


    if (!vendor) {

      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(404).json({
        success: false,
        message: "Vendor not found. Please try again."
      });

    }


    // ==========================================
    // CHECK ALREADY VERIFIED
    // ==========================================

    if (vendor.mobile_no_verify === "verified") {

      await client.query("COMMIT");

      transactionStarted = false;

      const mode = getMode(req.body?.mode, vendor);

      return res.status(200).json({
        success: true,
        message: "Mobile number is already verified.",
        redirect_to:
          mode === "register"
            ? "/login"
            : "/vendor-portal/vendor-list"
      });

    }


    // ==========================================
    // GET LATEST ACTIVE OTP
    // ==========================================

    const otpResult = await client.query(
      `
        SELECT
          id,
          otp,
          attempts,
          (expires_at < NOW()) AS expired
        FROM public.vendor_otp_verifications
        WHERE vendor_id = $1
          AND purpose = $2
          AND verified_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        FOR UPDATE
      `,
      [vendor.id, OTP_PURPOSE]
    );

    const otpRow = otpResult.rows[0];


    if (!otpRow) {

      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "OTP not found. Please resend OTP!"
      });

    }


    // ==========================================
    // OTP EXPIRED
    // ==========================================

    if (otpRow.expired) {

      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please resend OTP!"
      });

    }


    // ==========================================
    // MAXIMUM ATTEMPTS
    // ==========================================

    if (otpRow.attempts >= MAX_OTP_ATTEMPTS) {

      await client.query("ROLLBACK");

      transactionStarted = false;

      return res.status(429).json({
        success: false,
        message: "Too many wrong attempts. Please resend OTP!"
      });

    }


    // ==========================================
    // INVALID OTP
    // ==========================================

    if (!isOtpMatch(otp, vendor.mobile_no, otpRow.otp)) {

      await client.query(
        `
          UPDATE public.vendor_otp_verifications
          SET attempts = attempts + 1
          WHERE id = $1
        `,
        [otpRow.id]
      );

      const remaining =
        MAX_OTP_ATTEMPTS - (otpRow.attempts + 1);

      await client.query("COMMIT");

      transactionStarted = false;

      return res.status(400).json({
        success: false,
        message:
          remaining > 0
            ? `Invalid OTP! ${remaining} attempt(s) left.`
            : "Invalid OTP! No attempts left. Please resend OTP.",
        remaining_attempts: remaining
      });

    }


    // ==========================================
    // OTP VERIFIED
    // ==========================================

    await client.query(
      `
        UPDATE public.vendor_otp_verifications
        SET verified_at = NOW()
        WHERE id = $1
      `,
      [otpRow.id]
    );


    // ==========================================
    // UPDATE MOBILE VERIFICATION
    // ==========================================

    await client.query(
      `
        UPDATE public.vendors
        SET mobile_no_verify = 'verified'
        WHERE id = $1
      `,
      [vendor.id]
    );


    // ==========================================
    // IDENTIFY ACTION MODE
    // ==========================================

    const mode = getMode(req.body?.mode, vendor);


    // ==========================================
    // CREATE APPROVAL RECORD
    // ==========================================

    const remarksMap = {
      register:
        "Vendor registration submitted after mobile verification",

      update:
        "Vendor details updated and submitted after mobile verification",

      renew:
        "Vendor renewal submitted after mobile verification"
    };

    await client.query(
      `
        INSERT INTO public.vendor_approvals
        (
          vendor_id,
          status,
          remarks
        )
        VALUES ($1, 'Pending', $2)
      `,
      [
        vendor.id,
        remarksMap[mode]
      ]
    );


    // ==========================================
    // COMMIT
    // ==========================================

    await client.query("COMMIT");

    transactionStarted = false;


    // ==========================================
    // SUCCESS RESPONSE
    // ==========================================

    let message = "";
    let redirectTo = "";

    if (mode === "register") {

      message =
        "Mobile number verified. Your registration has been submitted for approval.";

      redirectTo = "/login";

    } else if (mode === "update") {

      message =
        "Mobile number verified. Your vendor details have been updated successfully.";

      redirectTo = "/vendor-portal/vendor-list";

    } else {

      message =
        "Mobile number verified. Your vendor renewal has been submitted for approval.";

      redirectTo = "/vendor-portal/vendor-list";

    }


    return res.status(200).json({

      success: true,

      message,

      mode,

      vendor_id: vendor.id,

      mobile_no_verify: "verified",

      redirect_to: redirectTo

    });


  } catch (error) {

    if (transactionStarted) {

      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "OTP verification rollback failed:",
          rollbackError.message
        );
      }

    }

    return next(error);

  } finally {

    client.release();

  }

}


// ==========================================
// 2. RESEND OTP
// Body: { vendor_id }
// ==========================================

async function resendOtp(req, res, next) {

  const vendorId = parseVendorId(req.body?.vendor_id);

  if (!vendorId) {

    return res.status(400).json({
      success: false,
      message: "Invalid vendor ID. Please try again."
    });

  }

  try {

    // ==========================================
    // GET VENDOR
    // ==========================================

    const vendorResult = await pool.query(
      `
        SELECT
          id,
          mobile_no,
          mobile_no_verify
        FROM public.vendors
        WHERE id = $1
      `,
      [vendorId]
    );

    const vendor = vendorResult.rows[0];


    if (!vendor) {

      return res.status(404).json({
        success: false,
        message: "Vendor not found. Please try again."
      });

    }


    // ==========================================
    // ALREADY VERIFIED
    // ==========================================

    if (vendor.mobile_no_verify === "verified") {

      return res.status(400).json({
        success: false,
        message: "Mobile number is already verified."
      });

    }


    const mobileNo = vendor.mobile_no;


    // ==========================================
    // CHECK RESEND LIMITS
    // ==========================================

    const limitResult = await pool.query(
      `
        SELECT
          COALESCE(
            MIN(
              EXTRACT(EPOCH FROM (NOW() - created_at))
            )::int,
            999999
          ) AS seconds_since_last,

          COUNT(*) FILTER (
            WHERE created_at > NOW() - INTERVAL '1 hour'
          )::int AS sent_last_hour

        FROM public.vendor_otp_verifications

        WHERE vendor_id = $1
          AND purpose = $2
      `,
      [vendor.id, OTP_PURPOSE]
    );


    const secondsSinceLast = Number(
      limitResult.rows[0]?.seconds_since_last ?? 999999
    );

    const sentLastHour = Number(
      limitResult.rows[0]?.sent_last_hour ?? 0
    );


    // ==========================================
    // RESEND COOLDOWN
    // ==========================================

    if (secondsSinceLast < RESEND_COOLDOWN_SECONDS) {

      const retryAfter =
        RESEND_COOLDOWN_SECONDS - secondsSinceLast;

      return res.status(429).json({
        success: false,
        message:
          `Please wait ${retryAfter} seconds before requesting a new OTP.`,
        retry_after: retryAfter,
        retry_after_seconds: retryAfter
      });

    }


    // ==========================================
    // HOURLY LIMIT
    // ==========================================

    if (sentLastHour >= MAX_OTP_PER_HOUR) {

      return res.status(429).json({
        success: false,
        message:
          "OTP limit reached. Please try again after some time."
      });

    }


    // ==========================================
    // CREATE NEW OTP
    // ==========================================

    const { otp, otpId } = await createOtpRecord(
      pool,
      vendor.id,
      mobileNo
    );


    // ==========================================
    // SEND OTP
    // ==========================================

    const otpSent = await deliverOtp(
      otpId,
      mobileNo,
      otp
    );


    if (!otpSent) {

      return res.status(502).json({
        success: false,
        message: "OTP could not be sent. Please try again."
      });

    }


    // ==========================================
    // SUCCESS RESPONSE
    // ==========================================

    return res.status(200).json({

      success: true,

      message:
        `OTP sent to ${maskMobile(mobileNo)}.`,

      otp: {

        sent: true,

        masked_mobile_no: maskMobile(mobileNo),

        expires_in_seconds:
          OTP_EXPIRY_MINUTES * 60,

        resend_after_seconds:
          RESEND_COOLDOWN_SECONDS

      }

    });


  } catch (error) {

    return next(error);

  }

}


// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  verifyOtp,
  resendOtp
};
 