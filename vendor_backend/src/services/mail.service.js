
const nodemailer = require("nodemailer");

// ==========================================
// EMAIL TRANSPORTER
// ==========================================

const transporter = nodemailer.createTransport({
  host: process.env.MS_MAIL_HOST,
  port: Number(process.env.MS_MAIL_PORT || 587),

  secure: process.env.MS_MAIL_SECURE === "true",
  requireTLS: true,

  auth: {
    user: process.env.MS_MAIL_USER,
    pass: process.env.MS_MAIL_PASSWORD
  },

  tls: {
    minVersion: "TLSv1.2",

    // TEMPORARY: Local testing only.
    // Do not disable certificate verification in production.
    rejectUnauthorized: false
  }
});

// ==========================================
// EMAIL CONFIGURATION
// ==========================================

const EMAIL_TYPES = {
  registration: {
    heading: "New Vendor Registration",
    subject: "New Vendor Registration",
    description:
      "A new vendor has registered on the portal."
  },

  update: {
    heading: "Vendor Details Updated",
    subject: "Vendor Details Updated",
    description:
      "An existing vendor has updated their details on the portal."
  },

  renewal: {
    heading: "Vendor Renewal Submitted",
    subject: "Vendor Renewal Submitted",
    description:
      "An existing vendor has submitted a renewal request."
  }
};

// ==========================================
// SEND MAIL
// ==========================================

async function sendMail({ to, cc, subject, html }) {
  try {

    if (!process.env.MS_MAIL_USER) {
      throw new Error("MS_MAIL_USER is missing in .env");
    }

    if (!process.env.MS_MAIL_PASSWORD) {
      throw new Error("MS_MAIL_PASSWORD is missing in .env");
    }

    if (!process.env.MS_MAIL_FROM) {
      throw new Error("MS_MAIL_FROM is missing in .env");
    }

    const result = await transporter.sendMail({
      from: {
        name: "Vendor Management Portal",
        address: process.env.MS_MAIL_FROM
      },

      to,

      ...(cc && cc.length ? { cc } : {}),

      subject,
      html
    });

    console.log(
      "[MAIL] Email sent successfully:",
      result.messageId
    );

    return {
      success: true,
      messageId: result.messageId
    };

  } catch (error) {

    console.error(
      "[MAIL] Sending failed:",
      error.message
    );

    return {
      success: false,
      error: error.message
    };
  }
}

// ==========================================
// HTML ESCAPE
// ==========================================

function escapeHtml(value) {

  return String(value ?? "-").replace(/[&<>"']/g, (char) => {

    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[char];
  });
}

// ==========================================
// DATE FORMAT - INDIA
// ==========================================

function formatIst(date = new Date()) {

  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

// ==========================================
// TABLE ROW
// ==========================================

function row(label, value) {

  return `
    <tr>
      <td style="
        padding:8px 10px;
        border:1px solid #e6ebf5;
        background:#f7f9fe;
        width:38%;
        font-weight:600;
      ">
        ${escapeHtml(label)}
      </td>

      <td style="
        padding:8px 10px;
        border:1px solid #e6ebf5;
      ">
        ${escapeHtml(value || "-")}
      </td>
    </tr>
  `;
}

// ==========================================
// EMAIL TEMPLATE
// ==========================================

function buildNotificationHtml({ type, vendor }) {

  const config = EMAIL_TYPES[type];

  if (!config) {
    throw new Error(
      `Invalid email notification type: ${type}`
    );
  }

  return `
    <div style="
      font-family:Arial,Helvetica,sans-serif;
      background:#f3f6fc;
      padding:24px;
    ">

      <div style="
        max-width:600px;
        margin:0 auto;
        background:#ffffff;
        border:1px solid #e6ebf5;
        border-radius:12px;
        overflow:hidden;
      ">

        <!-- HEADER -->

        <div style="
          background:#0b1f4d;
          color:#ffffff;
          padding:18px 24px;
        ">

          <h2 style="margin:0;font-size:18px;">
            ${escapeHtml(config.heading)}
          </h2>

        </div>

        <!-- BODY -->

        <div style="
          padding:24px;
          color:#0f1b3d;
          font-size:14px;
          line-height:1.6;
        ">

          <p>
            ${escapeHtml(config.description)}
            Please review it.
          </p>

          <table style="
            width:100%;
            border-collapse:collapse;
            margin:16px 0;
          ">

            ${row("Action", type.toUpperCase())}

            ${row("Vendor ID", vendor.id)}

            ${row("Vendor Name", vendor.name)}

            ${row("Contact Person", vendor.contact_person_name)}

            ${row("Mobile", vendor.mobile_no)}

            ${row("Email", vendor.email)}

            ${row("City", vendor.city)}

            ${row("GST Number", vendor.gst_number)}

            ${row("Status", vendor.status || "Pending Approval")}

            ${row("Submitted On", formatIst())}

          </table>

          <p style="
            color:#64708f;
            font-size:12px;
          ">
            Mobile OTP verification may still be pending for this vendor.
          </p>

        </div>

        <!-- FOOTER -->

        <div style="
          background:#f7f9fe;
          color:#64708f;
          padding:12px 24px;
          font-size:12px;
          text-align:center;
        ">

          This is an automated notification from the
          Vendor Management portal.

        </div>

      </div>

    </div>
  `;
}

// ==========================================
// COMMON VENDOR NOTIFICATION
// ==========================================

async function sendVendorNotificationEmail({ type, vendor }) {

  try {

    if (!EMAIL_TYPES[type]) {
      throw new Error(
        `Invalid notification type: ${type}`
      );
    }

    if (!vendor || !vendor.id) {
      throw new Error(
        "Vendor information is missing"
      );
    }

    const to =
      process.env.MAIL_NOTIFY_TO ||
      process.env.MS_MAIL_FROM;

    if (!to) {
      throw new Error(
        "Notification email address not configured"
      );
    }

    const cc = (process.env.MAIL_NOTIFY_CC || "")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);

    const config = EMAIL_TYPES[type];

    const subject =
      `${config.subject} - ${vendor.name || "Vendor"} (ID: ${vendor.id})`;

    const result = await sendMail({
      to,
      cc,
      subject,
      html: buildNotificationHtml({
        type,
        vendor
      })
    });

    if (result.success) {

      console.log(
        `[MAIL] ${type} notification sent for vendor ${vendor.id}`
      );

    } else {

      console.error(
        `[MAIL] ${type} notification failed:`,
        result.error
      );
    }

    return result;

  } catch (error) {

    console.error(
      `[MAIL] ${type} notification error:`,
      error.message
    );

    return {
      success: false,
      error: error.message
    };
  }
}

// ==========================================
// REGISTRATION EMAIL
// ==========================================

async function sendVendorRegistrationEmail(vendor) {

  return sendVendorNotificationEmail({
    type: "registration",
    vendor
  });
}

// ==========================================
// UPDATE EMAIL
// ==========================================

async function sendVendorUpdateEmail(vendor) {

  return sendVendorNotificationEmail({
    type: "update",
    vendor
  });
}

// ==========================================
// RENEWAL EMAIL
// ==========================================

async function sendVendorRenewalEmail(vendor) {

  return sendVendorNotificationEmail({
    type: "renewal",
    vendor
  });
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  sendMail,

  sendVendorNotificationEmail,

  sendVendorRegistrationEmail,

  sendVendorUpdateEmail,

  sendVendorRenewalEmail
};
