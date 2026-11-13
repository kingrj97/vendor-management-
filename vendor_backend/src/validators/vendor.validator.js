
const PINCODE_REGEX = /^[0-9]{6}$/;
const MOBILE_REGEX = /^[0-9]{10}$/;
const MOBILE_START_REGEX = /^[6-9]/;

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@gmail\.com$/i;

const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_REGEX = /^[0-9]{9,18}$/;

function clean(value) {
  return String(value ?? "").trim();
}

function validatePincode(value) {
  const pincode = clean(value);

  if (!pincode) return "PIN Code is required!";

  if (!PINCODE_REGEX.test(pincode)) {
    return "PIN Code must be exactly 6 digits!";
  }

  return "";
}

function validateMobile(value) {
  const mobile = clean(value);

  if (!mobile) return "Mobile Number is required!";

  if (!MOBILE_REGEX.test(mobile)) {
    return "Mobile Number must be exactly 10 digits!";
  }

  if (!MOBILE_START_REGEX.test(mobile)) {
    return "Mobile Number must start with 6, 7, 8 or 9!";
  }

  return "";
}

function validateEmail(value) {
  const email = clean(value);

  if (!email) return "Email Address is required!";

  if (!EMAIL_REGEX.test(email)) {
    return "Email must end with @gmail.com!";
  }

  return "";
}

function validateGst(value) {
  const gst = clean(value).toUpperCase();

  if (!gst) return "";

  if (gst.length !== 15) {
    return "GST Number must be exactly 15 characters!";
  }

  if (!GST_REGEX.test(gst)) {
    return "Enter a valid GST Number!";
  }

  return "";
}

function validatePan(value) {
  const pan = clean(value).toUpperCase();

  if (!pan) return "Permanent Account No. is required!";

  if (!PAN_REGEX.test(pan)) {
    return "Enter a valid PAN (e.g. ABCDE1234F)!";
  }

  return "";
}

function validateIfsc(value) {
  const ifsc = clean(value).toUpperCase();

  if (!ifsc) return "IFSC Code is required!";

  if (!IFSC_REGEX.test(ifsc)) {
    return "Enter a valid IFSC Code (e.g. SBIN0001234)!";
  }

  return "";
}

function validateAccountNumber(value) {
  const account = clean(value);

  if (!account) return "Account Number is required!";

  if (!ACCOUNT_REGEX.test(account)) {
    return "Account Number must be 9 to 18 digits (numbers only)!";
  }

  return "";
}

function validateConfirmAccountNumber(accountNo, confirmAccountNo) {
  const account = clean(accountNo);
  const confirm = clean(confirmAccountNo);

  if (!confirm) return "Confirm Account Number is required!";

  if (account !== confirm) {
    return "Account Numbers do not match!";
  }

  return "";
}

function validateVendor(vendor) {
  const panValue =
    vendor.pan_number ?? vendor.permanent_account_no;

  const checks = {
    pincode: validatePincode(vendor.pincode),

    mobile_no: validateMobile(vendor.mobile_no),

    email: validateEmail(vendor.email),

    gst_number: validateGst(vendor.gst_number),

    pan_number: validatePan(panValue),

    ifsc_code: validateIfsc(vendor.ifsc_code),

    ac_no: validateAccountNumber(vendor.ac_no),

    confirm_ac_no: validateConfirmAccountNumber(
      vendor.ac_no,
      vendor.confirm_ac_no
    )
  };

  const errors = {};

  for (const [field, message] of Object.entries(checks)) {
    if (message) {
      errors[field] = message;
    }
  }

  return errors;
}

module.exports = {
  validatePincode,
  validateMobile,
  validateEmail,
  validateGst,
  validatePan,
  validateIfsc,
  validateAccountNumber,
  validateConfirmAccountNumber,
  validateVendor
};
