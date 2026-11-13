// ==========================================
// SMS SERVICE
//
// .env me ye values chahiye:
//
//   NODE_ENV=production               -> production me SMS hamesha live jayega
//   SMS_MODE=live                     -> (sirf dev me) asli SMS bhejna ho to
//   SMS_PROVIDER=smsidea              -> smsidea | msg91 | custom
//
//   --- SMSIDEA ---
//   SMSIDEA_URL=https://smsidea.co.in/sendsms.aspx   (https support provider se confirm karo)
//   SMSIDEA_MOBILE=<gateway account mobile>
//   SMSIDEA_PASS=<gateway password>
//   SMSIDEA_SENDER_ID=ZYDUSH
//
// Node 18+ chahiye (fetch built-in hota hai).
// ==========================================

const SMS_TIMEOUT_MS = 10000;

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Production me dev mode kabhi nahi. Dev me SMS_MODE=live na ho to SMS nahi jata.
const DEV_MODE = !IS_PRODUCTION && process.env.SMS_MODE !== "live";

// 9876543210 -> 919876543210
function toInternational(mobileNo) {
  const digits = String(mobileNo).replace(/\D/g, "");
  return `91${digits.slice(-10)}`;
}

// Sirf last 10 digit (smsidea ko 10 digit number chahiye)
function toTenDigit(mobileNo) {
  return String(mobileNo).replace(/\D/g, "").slice(-10);
}

// 9876543210 -> XXXXXX3210 (logs ke liye)
function mask(mobileNo) {
  return `XXXXXX${toTenDigit(mobileNo).slice(-4)}`;
}

// fetch with timeout
async function request(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SMS_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();

    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // JSON nahi hai, text hi rehne do
    }

    return { httpOk: response.ok, status: response.status, text, json };
  } finally {
    clearTimeout(timer);
  }
}

function postJson(url, headers, body) {
  return request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

// ---------- SMSIDEA ----------

async function sendViaSmsIdea({ mobileNo, otp }) {
  const {
    SMSIDEA_URL = "https://smsidea.co.in/sendsms.aspx",
    SMSIDEA_MOBILE,
    SMSIDEA_PASS,
    SMSIDEA_SENDER_ID = "ZYDUSH"
  } = process.env;

  if (!SMSIDEA_MOBILE || !SMSIDEA_PASS) {
    return {
      success: false,
      response: "SMSIDEA_MOBILE or SMSIDEA_PASS is missing in .env"
    };
  }

  // http:// par password aur OTP plain text me jate hain
  if (IS_PRODUCTION && SMSIDEA_URL.startsWith("http://")) {
    console.warn(
      "[SMS] WARNING: SMSIDEA_URL is http://. Gateway password and OTP are sent unencrypted. Use https:// if provider supports it."
    );
  }

  // DLT approved template ka text bilkul same rehna chahiye
  const sms =
    `OTP for Login transaction on Zydus Services Portal is ${otp} ` +
    `Thanks for Choosing Zydus Hospitals.`;

  // URLSearchParams khud encode karta hai
  const form = new URLSearchParams({
    mobile: SMSIDEA_MOBILE,
    pass: SMSIDEA_PASS,
    senderid: SMSIDEA_SENDER_ID,
    to: toTenDigit(mobileNo),
    msg: sms
  });

  const result = await request(SMSIDEA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });

  // Gateway kabhi HTTP 200 ke saath error text bhejta hai
  const looksLikeError = /error|invalid|fail|wrong|insufficient|not\s*allowed/i.test(result.text);

  return {
    success: result.httpOk && !looksLikeError,
    response: result.text.slice(0, 500)
  };
}

// ---------- MSG91 ----------

async function sendViaMsg91({ mobileNo, otp }) {
  const {
    MSG91_AUTH_KEY,
    MSG91_TEMPLATE_ID,
    MSG91_SENDER_ID,
    MSG91_OTP_VAR = "OTP",
    MSG91_API_URL = "https://control.msg91.com/api/v5/flow"
  } = process.env;

  if (!MSG91_AUTH_KEY || !MSG91_TEMPLATE_ID) {
    return {
      success: false,
      response: "MSG91_AUTH_KEY or MSG91_TEMPLATE_ID is missing in .env"
    };
  }

  const body = {
    template_id: MSG91_TEMPLATE_ID,
    short_url: "0",
    recipients: [
      { mobiles: toInternational(mobileNo), [MSG91_OTP_VAR]: otp }
    ]
  };

  if (MSG91_SENDER_ID) body.sender = MSG91_SENDER_ID;

  const result = await postJson(MSG91_API_URL, { authkey: MSG91_AUTH_KEY }, body);
  const providerError = result.json?.type === "error";

  return {
    success: result.httpOk && !providerError,
    response: result.text.slice(0, 500)
  };
}

// ---------- Custom gateway ----------

async function sendViaCustomGateway({ mobileNo, message }) {
  const { SMS_API_URL, SMS_API_KEY, SMS_SENDER_ID } = process.env;

  if (!SMS_API_URL || !SMS_API_KEY) {
    return {
      success: false,
      response: "SMS_API_URL or SMS_API_KEY is missing in .env"
    };
  }

  const result = await postJson(
    SMS_API_URL,
    { Authorization: `Bearer ${SMS_API_KEY}` },
    { to: toInternational(mobileNo), sender: SMS_SENDER_ID, message }
  );

  return { success: result.httpOk, response: result.text.slice(0, 500) };
}

// ---------- Main function (otp.service.js isse call karta hai) ----------

async function sendOtpSms({ mobileNo, otp, message }) {
  // Sirf local dev: SMS nahi jata, OTP console me dikhta hai
  if (DEV_MODE) {
    console.log(`[SMS-DEV] To: ${mask(mobileNo)} | OTP: ${otp}`);
    return { success: true, response: "DEV_MODE_SMS_NOT_SENT" };
  }

  const provider = String(process.env.SMS_PROVIDER || "smsidea").toLowerCase();

  try {
    let result;

    if (provider === "smsidea") {
      result = await sendViaSmsIdea({ mobileNo, otp });
    } else if (provider === "msg91") {
      result = await sendViaMsg91({ mobileNo, otp });
    } else if (provider === "custom") {
      result = await sendViaCustomGateway({ mobileNo, message });
    } else {
      result = { success: false, response: `Unknown SMS_PROVIDER: ${provider}` };
    }

    if (result.success) {
      console.log(`[SMS] ${provider} OK for ${mask(mobileNo)}:`, result.response);
    } else {
      console.error(`[SMS] ${provider} failed for ${mask(mobileNo)}:`, result.response);
    }

    return result;
  } catch (error) {
    const reason =
      error.name === "AbortError" ? "SMS request timed out" : error.message;

    console.error(`[SMS] ${provider} error:`, reason);
    return { success: false, response: reason };
  }
}

module.exports = { sendOtpSms };