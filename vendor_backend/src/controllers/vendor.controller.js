const fs = require("fs");
const path = require("path");

const pool = require("../db");
const { vendorSchema } = require("../validators/validation");
const { validateVendor } = require("../validators/vendor.validator");
const { sendVendorNotificationEmail } = require("../services/mail.service");

const {
  OTP_EXPIRY_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  maskMobile,
  createOtpRecord,
  deliverOtp
} = require("../services/otp.service");

const uploadDirectory = path.resolve(__dirname, "..", "..", "uploads");

// ==========================================
// SETTINGS
// ==========================================

const attachmentFields = {
  gst_certificate_attachment: { table: "vendor_documents", column: "gst_certificate_attachment" },
  pan_card_attachment: { table: "vendor_documents", column: "pan_card_attachment" },
  drug_licence_attachment: { table: "vendor_documents", column: "drug_licence_attachment" },
  msmed_attachment: { table: "vendor_documents", column: "msmed_attachment" },
  cancel_cheque_attachment: { table: "vendor_documents", column: "cancel_cheque_attachment" },
  company_registration_attachment: { table: "vendor_documents", column: "company_registration_attachment" },
  authorization_letter_attachment: { table: "vendor_documents", column: "authorization_letter_attachment" },
  cin_number_attachment: { table: "vendor_documents", column: "cin_number_attachment" },
  experience_product_attachment: { table: "vendor_documents", column: "experience_product_attachment" },
  coa_attachment: { table: "vendor_documents", column: "coa_attachment" },
  experience_with_zydus_attachment: { table: "vendor_documents", column: "experience_with_zydus_attachment" },
  turnover_attachment: { table: "vendor_documents", column: "turnover_attachment" },
  assets_attachment: { table: "vendor_documents", column: "assets_attachment" },
  liabilities_attachment: { table: "vendor_documents", column: "liabilities_attachment" },
  it_return_attachment: { table: "vendor_documents", column: "it_return_attachment" },
  client_details: { table: "vendors", column: "client_details" }
};

const UPPERCASE_FIELDS = [
  "ifsc_code",
  "gst_number",
  "per_account_no",
  "cin_number"
];

const DUPLICATE_MESSAGES = {
  mobile_no: "This Mobile Number is already registered!",
  mobile_no_unverified:
    "This Mobile Number is already registered but not verified. Please verify it with OTP!",
  ac_no: "This Account Number is already registered!",
  per_account_no: "This Pan Number is already registered!"
};

// ==========================================
// COMMON HELPERS
// ==========================================

function createSafeFolderName(id, name) {
  const safeName = String(name || "Vendor")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return `${id}_${safeName || "Vendor"}`;
}

function normalizeValue(column, value) {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();

  if (trimmed === "") return null;

  return UPPERCASE_FIELDS.includes(column)
    ? trimmed.toUpperCase()
    : trimmed;
}

function cleanEntries(obj) {
  return Object.entries(obj)
    .filter(([, value]) => value !== undefined)
    .map(([column, value]) => [
      column,
      normalizeValue(column, value)
    ]);
}

async function insertRow(client, table, obj, returning = "id") {
  const entries = cleanEntries(obj);

  if (entries.length === 0) {
    throw new Error(`No data provided for ${table}`);
  }

  const columns = entries.map(([column]) => `"${column}"`);
  const placeholders = entries.map((_, index) => `$${index + 1}`);
  const values = entries.map(([, value]) => value);

  const result = await client.query(
    `
      INSERT INTO public.${table} (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
      RETURNING ${returning}
    `,
    values
  );

  return result.rows[0];
}

async function updateRow(client, table, keyColumn, keyValue, updates) {
  const columns = Object.keys(updates);

  if (columns.length === 0) return;

  const setClauses = columns.map(
    (column, index) => `"${column}" = $${index + 1}`
  );

  const values = columns.map((column) => updates[column]);
  values.push(keyValue);

  await client.query(
    `
      UPDATE public.${table}
      SET ${setClauses.join(", ")}
      WHERE "${keyColumn}" = $${values.length}
    `,
    values
  );
}

async function updateRowNormalized(
  client,
  table,
  keyColumn,
  keyValue,
  updates
) {
  const entries = cleanEntries(updates);

  if (entries.length === 0) return;

  const setClauses = entries.map(
    ([column], index) => `"${column}" = $${index + 1}`
  );

  const values = entries.map(([, value]) => value);
  values.push(keyValue);

  await client.query(
    `
      UPDATE public.${table}
      SET ${setClauses.join(", ")}
      WHERE "${keyColumn}" = $${values.length}
    `,
    values
  );
}

async function removeUploadedFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // File may already be deleted
    }
  }
}

// ==========================================
// VALIDATION
// ==========================================

function collectValidationErrors(form) {
  const input = {
    ...form,
    per_account_no:
      form.per_account_no ??
      form.permanent_account_no ??
      form.per_account_no
  };

  const errors = Object.entries(validateVendor(input)).map(
    ([field, message]) => ({ field, message })
  );

  const zodResult = vendorSchema.safeParse(form);

  if (!zodResult.success) {
    for (const issue of zodResult.error.issues) {
      const field = issue.path.join(".");

      if (!errors.some((error) => error.field === field)) {
        errors.push({
          field,
          message: issue.message
        });
      }
    }
  }

  return {
    errors,
    data: zodResult.success ? zodResult.data : null
  };
}

// ==========================================
// DUPLICATE CHECK
// ==========================================

async function findDuplicates(
  client,
  mobileNo,
  accountNo,
  panNumber
) {
  const result = await client.query(
    `
      SELECT
        mobile_no,
        ac_no,
        mobile_no_verify,
        per_account_no
      FROM public.vendors
      WHERE
        mobile_no = $1
        OR ac_no = $2
        OR (
          $3::text IS NOT NULL
          AND UPPER(TRIM(per_account_no)) = $3
        )
    `,
    [
      mobileNo,
      accountNo,
      panNumber ? panNumber.trim().toUpperCase() : null
    ]
  );

  const errors = [];
  let needsVerification = false;

  const sameMobile = result.rows.find(
    (row) => row.mobile_no === mobileNo
  );

  if (sameMobile) {
    if (sameMobile.mobile_no_verify !== "verified") {
      needsVerification = true;

      errors.push({
        field: "mobile_no",
        message: DUPLICATE_MESSAGES.mobile_no_unverified
      });
    } else {
      errors.push({
        field: "mobile_no",
        message: DUPLICATE_MESSAGES.mobile_no
      });
    }
  }

  if (result.rows.some((row) => row.ac_no === accountNo)) {
    errors.push({
      field: "ac_no",
      message: DUPLICATE_MESSAGES.ac_no
    });
  }

  if (
    panNumber &&
    result.rows.some(
      (row) =>
        row.per_account_no &&
        row.per_account_no.trim().toUpperCase() ===
        panNumber.trim().toUpperCase()
    )
  ) {
    errors.push({
      field: "per_account_no",
      message: DUPLICATE_MESSAGES.per_account_no
    });
  }

  return {
    errors,
    needsVerification
  };
}

// ==========================================
// 1. REGISTER VENDOR
// ==========================================

async function registerVendor(req, res, next) {
  const files = req.files || {};

  const uploadedFilePaths = Object.values(files)
    .flat()
    .map((file) => file.path);

  const sendError = async (status, body) => {
    await removeUploadedFiles(uploadedFilePaths);
    return res.status(status).json(body);
  };

  const client = await pool.connect();

  const movedFiles = [];
  let transactionStarted = false;
  let vendorFolder = null;

  try {
    const rawData = req.body?.vendorData;

    if (typeof rawData !== "string") {
      return await sendError(400, {
        success: false,
        message: "Registration data is missing."
      });
    }

    let form;

    try {
      form = JSON.parse(rawData);
    } catch {
      return await sendError(400, {
        success: false,
        message: "Invalid registration data format."
      });
    }

    if (!form || typeof form !== "object" || Array.isArray(form)) {
      return await sendError(400, {
        success: false,
        message: "Registration data must be an object."
      });
    }

    const { errors, data } = collectValidationErrors(form);

    if (errors.length > 0 || !data) {
      return await sendError(400, {
        success: false,
        message: "Please correct the registration details.",
        errors
      });
    }

    const accountNumber = String(data.ac_no ?? "").trim();

    const panNumber = String(data.per_account_no ?? "")
      .trim()
      .toUpperCase();

    const duplicates = await findDuplicates(
      client,
      data.mobile_no,
      accountNumber,
      panNumber
    );

    if (duplicates.errors.length > 0) {
      return await sendError(409, {
        success: false,
        message: "One or more details are already registered.",
        needs_verification: duplicates.needsVerification,
        errors: duplicates.errors
      });
    }

    const getFileName = (field) =>
      files[field]?.[0]?.filename ?? null;

    // VENDORS TABLE
    const vendor = {
      name: data.name,

      // Master IDs
      category_id: data.category_id,
      zydus_master_id: data.zydus_master_id, // CHANGED: was zydus_site

      vendor_type: "New",
      status_of_vendor: data.status_of_vendor,
      name_of_partners: data.name_of_partners,
      client_details: getFileName("client_details"),

      address: data.address,
      city: data.city,
      pincode: data.pincode,
      state: data.state,
      country: data.country,
      telephone_no: data.telephone_no,
      mobile_no: data.mobile_no,
      mobile_no_verify: "pending",
      email: data.email,
      contact_person_name: data.contact_person_name,

      gst_number: data.gst_number,
      gst_business_place: data.gst_business_place,

      pancard: data.pancard,
      per_account_no: panNumber || null,

      bank_name: data.bank_name,
      branch_name: data.branch_name,
      ac_name: data.ac_name,
      ac_no: accountNumber,
      ifsc_code: data.ifsc_code,

      status: "Pending"
    };

    // VENDOR PAYMENT TABLE
    const payment = {
      payment_terms: data.payment_terms,
      payment_condition: data.payment_condition,
      delivery_through: data.delivery_through,
      tds_flag: data.tds_flag,
      tds_rate: data.tds_rate,
      classification_of_taxable_service:
        data.classification_of_taxable_service,
      permanent_establishment: data.permanent_establishment
    };

    // VENDOR DOCUMENTS TABLE
    const documents = {
      drug_licence: data.drug_licence,
      drug_licence_attachment: getFileName("drug_licence_attachment"),

      cin_number: data.cin_number,
      cin_number_attachment: getFileName("cin_number_attachment"),

      msmed: data.msmed ?? data.msmed_small_scale,
      msmed_attachment: getFileName("msmed_attachment"),

      experience_product_attachment:
        getFileName("experience_product_attachment"),

      coa_attachment: getFileName("coa_attachment"),

      experience_with_zydus: data.experience_with_zydus,

      experience_with_zydus_attachment:
        getFileName("experience_with_zydus_attachment"),

      turnover_attachment: getFileName("turnover_attachment"),
      assets_attachment: getFileName("assets_attachment"),
      liabilities_attachment: getFileName("liabilities_attachment"),
      it_return_attachment: getFileName("it_return_attachment"),

      cancel_cheque_attachment: getFileName("cancel_cheque_attachment"),
      pan_card_attachment: getFileName("pan_card_attachment"),
      gst_certificate_attachment: getFileName("gst_certificate_attachment"),

      company_registration_attachment:
        getFileName("company_registration_attachment"),

      authorization_letter_attachment:
        getFileName("authorization_letter_attachment")
    };

    await client.query("BEGIN");
    transactionStarted = true;

    const savedVendor = await insertRow(
      client,
      "vendors",
      vendor,
      "id, name, mobile_no, email, status, vendor_type, created_at"
    );

    await insertRow(client, "vendor_payment", {
      vendor_id: savedVendor.id,
      ...payment
    });

    await insertRow(client, "vendor_documents", {
      vendor_id: savedVendor.id,
      ...documents
    });

    const { otp, otpId } = await createOtpRecord(
      client,
      savedVendor.id,
      data.mobile_no
    );

    const folderName = createSafeFolderName(
      savedVendor.id,
      savedVendor.name
    );

    vendorFolder = path.join(uploadDirectory, folderName);

    await fs.promises.mkdir(vendorFolder, {
      recursive: false
    });

    const pathUpdates = {
      vendors: {},
      vendor_documents: {}
    };

    for (const [fieldName, target] of Object.entries(attachmentFields)) {
      const file = files[fieldName]?.[0];

      if (!file) continue;

      const destination = path.join(vendorFolder, file.filename);

      await fs.promises.rename(file.path, destination);

      movedFiles.push({
        originalPath: file.path,
        destination
      });

      pathUpdates[target.table][target.column] =
        `${folderName}/${file.filename}`;
    }

    await updateRow(
      client,
      "vendors",
      "id",
      savedVendor.id,
      pathUpdates.vendors
    );

    await updateRow(
      client,
      "vendor_documents",
      "vendor_id",
      savedVendor.id,
      pathUpdates.vendor_documents
    );

    await client.query("COMMIT");
    transactionStarted = false;

    console.log(
      `[VENDOR] Registration saved: ID=${savedVendor.id}, Folder=${folderName}`
    );

    const otpSent = await deliverOtp(
      otpId,
      data.mobile_no,
      otp
    );

    // Team ko notification email (background me, await nahi).
    // Fail hone par registration par koi asar nahi padta.
    Promise.resolve()
      .then(() =>
        sendVendorNotificationEmail({
          type: "registration",
          vendor: {
            id: savedVendor.id,
            name: savedVendor.name,
            email: savedVendor.email,
            mobile_no: savedVendor.mobile_no,
            contact_person_name: data.contact_person_name,
            city: data.city,
            gst_number: data.gst_number
          }
        })
      )
      .catch((emailError) => {
        console.error("[VENDOR REGISTER EMAIL ERROR]", emailError.message);
      });

    return res.status(201).json({
      success: true,
      message: otpSent
        ? `Registration saved. OTP sent to ${maskMobile(data.mobile_no)}.`
        : "Registration saved, but OTP could not be sent. Please use Resend OTP.",

      next_step: "VERIFY_OTP",

      otp: {
        sent: otpSent,
        mobile_no: data.mobile_no,
        masked_mobile_no: maskMobile(data.mobile_no),
        expires_in_seconds: OTP_EXPIRY_MINUTES * 60,
        resend_after_seconds: RESEND_COOLDOWN_SECONDS
      },

      vendor: {
        ...savedVendor,
        document_folder: folderName
      }
    });

  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError.message);
      }
    }

    for (const file of movedFiles.reverse()) {
      try {
        await fs.promises.rename(
          file.destination,
          file.originalPath
        );
      } catch (cleanupError) {
        console.error("File cleanup failed:", cleanupError.message);
      }
    }

    if (vendorFolder) {
      try {
        await fs.promises.rmdir(vendorFolder);
      } catch {
        // Folder may not be empty
      }
    }

    await removeUploadedFiles(uploadedFilePaths);

    if (error.code === "23505") {
      const column = /Key \((\w+)\)/.exec(error.detail ?? "")?.[1];

      const constraintMap = {
        uq_vendors_pan: "per_account_no"
      };

      const duplicateField =
        DUPLICATE_MESSAGES[column]
          ? column
          : constraintMap[error.constraint];

      if (duplicateField) {
        return res.status(409).json({
          success: false,
          message: DUPLICATE_MESSAGES[duplicateField],
          errors: [
            {
              field: duplicateField,
              message: DUPLICATE_MESSAGES[duplicateField]
            }
          ]
        });
      }
    }

    return next(error);

  } finally {
    client.release();
  }
}

// ==========================================
// 2. GET LOGGED-IN VENDOR DATA
// ==========================================

async function getMyVendors(req, res, next) {
  try {
    const vendorId = req.user?.vendor_id ?? req.user?.id;

    if (!vendorId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login again."
      });
    }

    // CHANGED: zydus_site column/join removed.
    // zydus_master_id is read from vendors; site_name comes from a subquery
    // (subquery avoids duplicate vendor rows if a master id has many sites).
    const result = await pool.query(
      `
        SELECT
          v.id,
          v.name,

          v.category_id,
          c.name AS category_name,

          v.zydus_master_id,
          v.vendor_type,
          v.status_of_vendor,
          v.name_of_partners,
          v.client_details,
          v.address,
          v.city,
          v.pincode,
          v.state,
          v.country,
          v.telephone_no,
          v.mobile_no,
          v.mobile_no_verify,
          v.email,
          v.contact_person_name,
          v.gst_number,
          v.per_account_no,
          v.bank_name,
          v.branch_name,
          v.ac_name,
          v.ac_no,
          v.ifsc_code,
          v.created_at,
          v.status,

          p.payment_terms,
          p.payment_condition,
          p.delivery_through,
          p.tds_flag,
          p.tds_rate,
          p.classification_of_taxable_service,
          p.permanent_establishment,

          d.drug_licence,
          d.drug_licence_attachment,
          d.cin_number,
          d.cin_number_attachment,
          d.msmed,
          d.msmed_attachment,
          d.experience_product_attachment,
          d.coa_attachment,
          d.experience_with_zydus,
          d.experience_with_zydus_attachment,
          d.turnover_attachment,
          d.assets_attachment,
          d.liabilities_attachment,
          d.it_return_attachment,
          d.cancel_cheque_attachment,
          d.pan_card_attachment,
          d.gst_certificate_attachment,
          d.company_registration_attachment,
          d.authorization_letter_attachment

        FROM public.vendors v

        LEFT JOIN public.category c
          ON c.id = v.category_id

        LEFT JOIN public.vendor_payment p
          ON p.vendor_id = v.id

        LEFT JOIN public.vendor_documents d
          ON d.vendor_id = v.id

        WHERE v.id = $1
        ORDER BY v.id DESC
      `,
      [vendorId]
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });

  } catch (error) {
    return next(error);
  }
}

// ==========================================
// 3. GET SINGLE VENDOR
// ==========================================

async function getVendorById(req, res, next) {
  try {
    const requestedId = Number(req.params.id);
    const loggedInId = Number(req.user?.vendor_id ?? req.user?.id);

    if (!Number.isInteger(requestedId) || requestedId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendor id."
      });
    }

    if (!loggedInId || requestedId !== loggedInId) {
      return res.status(403).json({
        success: false,
        message: "Access denied."
      });
    }

    // CHANGED: zydus_site join removed. v.* already returns zydus_master_id.
    const result = await pool.query(
      `
        SELECT
          v.*,

          c.name AS category_name,
          v.zydus_master_id,

          p.payment_terms,
          p.payment_condition,
          p.delivery_through,
          p.tds_flag,
          p.tds_rate,
          p.classification_of_taxable_service,
          p.permanent_establishment,

          d.drug_licence,
          d.drug_licence_attachment,
          d.cin_number,
          d.cin_number_attachment,
          d.msmed,
          d.msmed_attachment,
          d.experience_product_attachment,
          d.coa_attachment,
          d.experience_with_zydus,
          d.experience_with_zydus_attachment,
          d.turnover_attachment,
          d.assets_attachment,
          d.liabilities_attachment,
          d.it_return_attachment,
          d.cancel_cheque_attachment,
          d.pan_card_attachment,
          d.gst_certificate_attachment,
          d.company_registration_attachment,
          d.authorization_letter_attachment

        FROM public.vendors v

        LEFT JOIN public.category c
          ON c.id = v.category_id

        LEFT JOIN public.vendor_payment p
          ON p.vendor_id = v.id

        LEFT JOIN public.vendor_documents d
          ON d.vendor_id = v.id

        WHERE v.id = $1
      `,
      [requestedId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found."
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    return next(error);
  }
}

// ==========================================
// 4. RENEW / UPDATE VENDOR
// ==========================================

// CHANGED: zydus_site -> zydus_master_id, preferred_location removed
// (vendors table has no preferred_location column).
// vendor_old_data must have a zydus_master_id column.
const ARCHIVE_COLUMNS = `
  original_vendor_id, name, category_id, zydus_master_id, vendor_type,
  status_of_vendor, name_of_partners, client_details,
  address, city, pincode, state, country, telephone_no, mobile_no,
  mobile_no_verify, email, contact_person_name, gst_number,
  gst_business_place, pancard, per_account_no, bank_name, branch_name,
  ac_name, ac_no, ifsc_code, status, created_at,

  payment_id, payment_vendor_id, payment_terms, payment_condition,
  delivery_through, tds_flag, tds_rate,
  classification_of_taxable_service, permanent_establishment,

  documents_id, documents_vendor_id, drug_licence,
  drug_licence_attachment, cin_number, cin_number_attachment,
  msmed, msmed_attachment, experience_product_attachment,
  coa_attachment, experience_with_zydus,
  experience_with_zydus_attachment, turnover_attachment,
  assets_attachment, liabilities_attachment, it_return_attachment,
  cancel_cheque_attachment, pan_card_attachment,
  gst_certificate_attachment, company_registration_attachment,
  authorization_letter_attachment
`;

const ARCHIVE_SELECT = `
  v.id, v.name, v.category_id, v.zydus_master_id, v.vendor_type,
  v.status_of_vendor, v.name_of_partners,
  v.client_details, v.address, v.city, v.pincode, v.state, v.country,
  v.telephone_no, v.mobile_no, v.mobile_no_verify, v.email,
  v.contact_person_name, v.gst_number, v.gst_business_place,
  v.pancard, v.per_account_no, v.bank_name, v.branch_name,
  v.ac_name, v.ac_no, v.ifsc_code, v.status, v.created_at,

  vp.id, vp.vendor_id, vp.payment_terms, vp.payment_condition,
  vp.delivery_through, vp.tds_flag, vp.tds_rate,
  vp.classification_of_taxable_service, vp.permanent_establishment,

  vd.id, vd.vendor_id, vd.drug_licence, vd.drug_licence_attachment,
  vd.cin_number, vd.cin_number_attachment, vd.msmed, vd.msmed_attachment,
  vd.experience_product_attachment, vd.coa_attachment,
  vd.experience_with_zydus, vd.experience_with_zydus_attachment,
  vd.turnover_attachment, vd.assets_attachment, vd.liabilities_attachment,
  vd.it_return_attachment, vd.cancel_cheque_attachment,
  vd.pan_card_attachment, vd.gst_certificate_attachment,
  vd.company_registration_attachment, vd.authorization_letter_attachment
`;

function createRenewFolderName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");

  return (
    `renew_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  );
}

function getVendorRootFolder(vendorRow, documentsRow) {
  const paths = [
    vendorRow.client_details,
    ...Object.keys(attachmentFields)
      .filter((key) => attachmentFields[key].table === "vendor_documents")
      .map((key) => {
        const column = attachmentFields[key].column;
        return documentsRow?.[column];
      })
  ].filter(Boolean);

  for (const p of paths) {
    const parts = String(p).split("/");

    if (
      parts.length > 1 &&
      parts[0] &&
      parts[0] !== "." &&
      parts[0] !== ".."
    ) {
      return parts[0];
    }
  }

  return createSafeFolderName(vendorRow.id, vendorRow.name);
}

function missingRenewFiles(data, files, vendorRow, documentsRow) {
  const hasFile = (field) => {
    if (files[field]?.[0]) return true;

    const target = attachmentFields[field];

    const old =
      target.table === "vendors"
        ? vendorRow[target.column]
        : documentsRow?.[target.column];

    return !!old;
  };

  const required = [
    { condition: true, field: "cancel_cheque_attachment", label: "Cancelled Cheque" },
    { condition: true, field: "company_registration_attachment", label: "Company Registration" },
    { condition: data.gst_business_place === "Yes", field: "gst_certificate_attachment", label: "GST Certificate" },
    { condition: vendorRow.pancard === "Yes", field: "pan_card_attachment", label: "Pancard Certificate" },
    { condition: data.drug_licence === "Yes", field: "drug_licence_attachment", label: "Drug Licence" },
    { condition: (data.msmed ?? data.msmed_small_scale) === "Yes", field: "msmed_attachment", label: "MSMED Proof" }
  ];

  return required
    .filter((item) => item.condition && !hasFile(item.field))
    .map((item) => ({
      field: item.field,
      message: `${item.label} is required!`
    }));
}

async function findRenewDuplicates(client, vendorId, accountNo) {
  const result = await client.query(
    `
      SELECT 1
      FROM public.vendors
      WHERE ac_no = $1 AND id <> $2
      LIMIT 1
    `,
    [accountNo, vendorId]
  );

  return result.rows.length > 0
    ? [{ field: "ac_no", message: DUPLICATE_MESSAGES.ac_no }]
    : [];
}

async function updateVendor(req, res, next) {
  const files = req.files || {};

  const uploadedFilePaths = Object.values(files)
    .flat()
    .map((file) => file.path);

  const sendError = async (status, body) => {
    await removeUploadedFiles(uploadedFilePaths);
    return res.status(status).json(body);
  };

  const requestedId = Number(req.params.id);
  const loggedInId = Number(req.user?.vendor_id ?? req.user?.id);

  if (!Number.isInteger(requestedId) || requestedId <= 0) {
    return sendError(400, {
      success: false,
      message: "Invalid vendor id."
    });
  }

  if (!loggedInId || requestedId !== loggedInId) {
    return sendError(403, {
      success: false,
      message: "Access denied."
    });
  }

  const client = await pool.connect();

  const movedFiles = [];
  let transactionStarted = false;
  let renewFolderPath = null;

  try {
    const rawData = req.body?.vendorData;

    if (typeof rawData !== "string") {
      return await sendError(400, {
        success: false,
        message: "Renewal data is missing."
      });
    }

    let form;

    try {
      form = JSON.parse(rawData);
    } catch {
      return await sendError(400, {
        success: false,
        message: "Invalid renewal data format."
      });
    }

    if (!form || typeof form !== "object" || Array.isArray(form)) {
      return await sendError(400, {
        success: false,
        message: "Renewal data must be an object."
      });
    }

    const existingVendorRes = await client.query(
      `SELECT * FROM public.vendors WHERE id = $1`,
      [requestedId]
    );

    if (existingVendorRes.rows.length === 0) {
      return await sendError(404, {
        success: false,
        message: "Vendor not found."
      });
    }

    const existingVendor = existingVendorRes.rows[0];

    // Pending vendor renew nahi kar sakta (approval ka wait karna hoga)
    if (String(existingVendor.status ?? "").trim().toLowerCase() === "pending") {
      return await sendError(409, {
        success: false,
        message: "Your vendor is pending approval. You can renew after it is approved."
      });
    }


    const existingDocsRes = await client.query(
      `SELECT * FROM public.vendor_documents WHERE vendor_id = $1`,
      [requestedId]
    );

    const existingDocs = existingDocsRes.rows[0] || {};

    const mergedForm = {
      ...form,
      mobile_no: existingVendor.mobile_no,
      pancard: existingVendor.pancard,
      per_account_no: existingVendor.per_account_no,
      permanent_account_no: existingVendor.per_account_no
    };

    const { errors, data } = collectValidationErrors(mergedForm);

    const fileErrors = data
      ? missingRenewFiles(data, files, existingVendor, existingDocs)
      : [];

    const allErrors = [...errors, ...fileErrors];

    if (allErrors.length > 0 || !data) {
      return await sendError(400, {
        success: false,
        message: "Please correct the renewal details.",
        errors: allErrors
      });
    }

    const accountNumber = String(data.ac_no ?? "").trim();

    const duplicateErrors = await findRenewDuplicates(
      client,
      requestedId,
      accountNumber
    );

    if (duplicateErrors.length > 0) {
      return await sendError(409, {
        success: false,
        message: "One or more details are already registered.",
        errors: duplicateErrors
      });
    }

    // VENDOR UPDATE
    const vendorUpdates = {
      name: data.name,

      // Master IDs
      category_id: data.category_id,
      zydus_master_id: data.zydus_master_id, // CHANGED: was zydus_site

      status_of_vendor: data.status_of_vendor,
      name_of_partners: data.name_of_partners,

      address: data.address,
      city: data.city,
      pincode: data.pincode,
      state: data.state,
      country: data.country,
      telephone_no: data.telephone_no,
      email: data.email,
      contact_person_name: data.contact_person_name,

      gst_number: data.gst_number,
      gst_business_place: data.gst_business_place,

      bank_name: data.bank_name,
      branch_name: data.branch_name,
      ac_name: data.ac_name,
      ac_no: accountNumber,
      ifsc_code: data.ifsc_code,

      vendor_type: "Renew",
      status: "Pending",
      mobile_no_verify: "pending"
    };

    const paymentUpdates = {
      payment_terms: data.payment_terms,
      payment_condition: data.payment_condition,
      delivery_through: data.delivery_through,
      tds_flag: data.tds_flag,
      tds_rate: data.tds_rate,
      classification_of_taxable_service:
        data.classification_of_taxable_service,
      permanent_establishment: data.permanent_establishment
    };

    const documentUpdates = {
      drug_licence: data.drug_licence,
      cin_number: data.cin_number,
      msmed: data.msmed ?? data.msmed_small_scale,
      experience_with_zydus: data.experience_with_zydus
    };

    await client.query("BEGIN");
    transactionStarted = true;

    await client.query(
      `SELECT id FROM public.vendors WHERE id = $1 FOR UPDATE`,
      [requestedId]
    );

    // Archive old vendor data
    await client.query(
      `
        INSERT INTO public.vendor_old_data (${ARCHIVE_COLUMNS})
        SELECT ${ARCHIVE_SELECT}
        FROM public.vendors v
        LEFT JOIN public.vendor_payment vp
          ON vp.vendor_id = v.id
        LEFT JOIN public.vendor_documents vd
          ON vd.vendor_id = v.id
        WHERE v.id = $1
      `,
      [requestedId]
    );

    const rootFolder = getVendorRootFolder(
      existingVendor,
      existingDocs
    );

    const rootFolderPath = path.join(uploadDirectory, rootFolder);

    await fs.promises.mkdir(rootFolderPath, {
      recursive: true
    });

    const renewFolder = createRenewFolderName();
    renewFolderPath = path.join(rootFolderPath, renewFolder);

    const newFileCount = Object.keys(attachmentFields).filter(
      (field) => files[field]?.[0]
    ).length;

    if (newFileCount > 0) {
      await fs.promises.mkdir(renewFolderPath, {
        recursive: false
      });
    }

    const pathUpdates = {
      vendors: {},
      vendor_documents: {}
    };

    for (const [fieldName, target] of Object.entries(attachmentFields)) {
      const file = files[fieldName]?.[0];

      if (!file) continue;

      const destination = path.join(renewFolderPath, file.filename);

      await fs.promises.rename(file.path, destination);

      movedFiles.push({
        originalPath: file.path,
        destination
      });

      pathUpdates[target.table][target.column] =
        `${rootFolder}/${renewFolder}/${file.filename}`;
    }

    await updateRowNormalized(
      client,
      "vendors",
      "id",
      requestedId,
      {
        ...vendorUpdates,
        ...pathUpdates.vendors
      }
    );

    await updateRowNormalized(
      client,
      "vendor_payment",
      "vendor_id",
      requestedId,
      paymentUpdates
    );

    await updateRowNormalized(
      client,
      "vendor_documents",
      "vendor_id",
      requestedId,
      {
        ...documentUpdates,
        ...pathUpdates.vendor_documents
      }
    );

    const { otp, otpId } = await createOtpRecord(
      client,
      requestedId,
      existingVendor.mobile_no
    );

    await client.query("COMMIT");
    transactionStarted = false;


    console.log(
      `[VENDOR] Renewed: ID=${requestedId}, Folder=${rootFolder}/${renewFolder}`
    );

    const otpSent = await deliverOtp(
      otpId,
      existingVendor.mobile_no,
      otp
    );

    // Team ko notification email (background me, await nahi).
    // Fail hone par renew par koi asar nahi padta.
    Promise.resolve()
      .then(() =>
        sendVendorNotificationEmail({
          type: "renewal",
          vendor: {
            id: requestedId,
            name: data.name,
            email: data.email,
            mobile_no: existingVendor.mobile_no,
            contact_person_name: data.contact_person_name,
            city: data.city,
            gst_number: data.gst_number
          }
        })
      )
      .catch((emailError) => {
        console.error("[VENDOR RENEW EMAIL ERROR]", emailError.message);
      });

    return res.status(200).json({
      success: true,
      message: otpSent
        ? `Renewal saved. OTP sent to ${maskMobile(existingVendor.mobile_no)}.`
        : "Renewal saved, but OTP could not be sent. Please use Resend OTP.",

      next_step: "VERIFY_OTP",

      otp: {
        sent: otpSent,
        mobile_no: existingVendor.mobile_no,
        masked_mobile_no: maskMobile(existingVendor.mobile_no),
        expires_in_seconds: OTP_EXPIRY_MINUTES * 60,
        resend_after_seconds: RESEND_COOLDOWN_SECONDS
      },

      vendor: {
        id: requestedId,
        name: data.name,
        mobile_no: existingVendor.mobile_no,
        email: data.email,
        status: "pending"
      }
    });

  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError.message);
      }
    }

    for (const file of movedFiles) {
      try {
        await fs.promises.unlink(file.destination);
      } catch {
        // Already removed
      }
    }

    if (renewFolderPath) {
      try {
        await fs.promises.rmdir(renewFolderPath);
      } catch {
        // Folder empty nahi ya bana hi nahi
      }
    }

    await removeUploadedFiles(uploadedFilePaths);

    if (error.code === "23505") {
      const column = /Key \((\w+)\)/.exec(error.detail ?? "")?.[1];

      if (column && DUPLICATE_MESSAGES[column]) {
        return res.status(409).json({
          success: false,
          message: DUPLICATE_MESSAGES[column],
          errors: [
            {
              field: column,
              message: DUPLICATE_MESSAGES[column]
            }
          ]
        });
      }
    }

    return next(error);

  } finally {
    client.release();
  }
}


// ==========================================
// 5. UPDATE VENDOR DETAILS
// ==========================================

async function updateVendorDetails(req, res, next) {
  const files = req.files || {};

  const uploadedFilePaths = Object.values(files)
    .flat()
    .map((file) => file.path);

  const requestedId = Number(req.params.id);
  const loggedInId = Number(
    req.user?.vendor_id ?? req.user?.id
  );

  const movedFiles = [];
  let transactionStarted = false;

  const sendError = async (status, body) => {
    await removeUploadedFiles(uploadedFilePaths);
    return res.status(status).json(body);
  };

  if (!Number.isInteger(requestedId) || requestedId <= 0) {
    return sendError(400, {
      success: false,
      message: "Invalid vendor ID."
    });
  }

  if (!loggedInId || requestedId !== loggedInId) {
    return sendError(403, {
      success: false,
      message: "Access denied."
    });
  }

  const client = await pool.connect();

  try {
    const rawData = req.body?.vendorData;

    if (typeof rawData !== "string") {
      return await sendError(400, {
        success: false,
        message: "Update data is missing."
      });
    }

    let form;

    try {
      form = JSON.parse(rawData);
    } catch {
      return await sendError(400, {
        success: false,
        message: "Invalid update data format."
      });
    }

    if (!form || typeof form !== "object" || Array.isArray(form)) {
      return await sendError(400, {
        success: false,
        message: "Update data must be an object."
      });
    }

    await client.query("BEGIN");
    transactionStarted = true;

    // 1. Existing vendor fetch and lock
    const vendorResult = await client.query(
      `SELECT * FROM public.vendors WHERE id = $1 FOR UPDATE`,
      [requestedId]
    );

    if (vendorResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return await sendError(404, {
        success: false,
        message: "Vendor not found."
      });
    }

    const existingVendor = vendorResult.rows[0];

    // 2. Existing payment fetch
    const paymentResult = await client.query(
      `SELECT * FROM public.vendor_payment WHERE vendor_id = $1`,
      [requestedId]
    );

    // 3. Existing documents fetch
    const documentsResult = await client.query(
      `SELECT * FROM public.vendor_documents WHERE vendor_id = $1`,
      [requestedId]
    );

    const existingPayment = paymentResult.rows[0];
    const existingDocs = documentsResult.rows[0];

    // Update will not INSERT missing records
    if (!existingPayment || !existingDocs) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return await sendError(409, {
        success: false,
        message:
          "Existing vendor payment or document record is missing. Update cannot proceed."
      });
    }

    // 4. Preserve protected fields
    const mergedForm = {
      ...form,
      mobile_no: existingVendor.mobile_no,
      pancard: existingVendor.pancard,
      per_account_no: existingVendor.per_account_no,
      permanent_account_no: existingVendor.per_account_no
    };

    // 5. Validate form
    const { errors, data } = collectValidationErrors(mergedForm);

    if (errors.length > 0 || !data) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return await sendError(400, {
        success: false,
        message: "Please correct the update details.",
        errors
      });
    }

    // 6. Duplicate account check (exclude current vendor)
    const accountNumber = String(data.ac_no ?? "").trim();

    const duplicateErrors = await findRenewDuplicates(
      client,
      requestedId,
      accountNumber
    );

    if (duplicateErrors.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return await sendError(409, {
        success: false,
        message: "One or more details are already registered.",
        errors: duplicateErrors
      });
    }

    // 7. Vendor fields
    // Existing mobile, PAN and vendor_type are not changed.
    const vendorUpdates = {
      name: data.name,
      category_id: data.category_id,
      zydus_master_id: data.zydus_master_id,
      status_of_vendor: data.status_of_vendor,
      name_of_partners: data.name_of_partners,

      address: data.address,
      city: data.city,
      pincode: data.pincode,
      state: data.state,
      country: data.country,
      telephone_no: data.telephone_no,

      email: data.email,
      contact_person_name: data.contact_person_name,

      gst_number: data.gst_number,
      gst_business_place: data.gst_business_place,

      bank_name: data.bank_name,
      branch_name: data.branch_name,
      ac_name: data.ac_name,
      ac_no: accountNumber,
      ifsc_code: data.ifsc_code,

      // Update ke baad approval ke liye Pending
      status: "Pending",
      mobile_no_verify: "pending"
    };

    // 8. Payment fields
    const paymentUpdates = {
      payment_terms: data.payment_terms,
      payment_condition: data.payment_condition,
      delivery_through: data.delivery_through,
      tds_flag: data.tds_flag,
      tds_rate: data.tds_rate,
      classification_of_taxable_service:
        data.classification_of_taxable_service,
      permanent_establishment: data.permanent_establishment
    };

    // 9. Document fields
    const documentUpdates = {
      drug_licence: data.drug_licence,
      cin_number: data.cin_number,
      msmed: data.msmed ?? data.msmed_small_scale,
      experience_with_zydus: data.experience_with_zydus
    };

    // 10. Save new uploaded files in the EXISTING vendor folder.
    // No new folder is created.
    const newFileFields = Object.keys(attachmentFields).filter(
      (field) => files[field]?.[0]
    );

    const pathUpdates = {
      vendors: {},
      vendor_documents: {}
    };

    if (newFileFields.length > 0) {
      const rootFolder = getVendorRootFolder(
        existingVendor,
        existingDocs
      );

      const rootFolderPath = path.join(
        uploadDirectory,
        rootFolder
      );

      // Existing folder must already exist
      await fs.promises.access(rootFolderPath);

      for (const fieldName of newFileFields) {
        const target = attachmentFields[fieldName];
        const file = files[fieldName]?.[0];

        const destination = path.join(
          rootFolderPath,
          file.filename
        );

        await fs.promises.rename(file.path, destination);

        movedFiles.push({
          originalPath: file.path,
          destination
        });

        pathUpdates[target.table][target.column] =
          `${rootFolder}/${file.filename}`;
      }
    }

    // 11. UPDATE existing vendors row
    await updateRowNormalized(
      client,
      "vendors",
      "id",
      requestedId,
      {
        ...vendorUpdates,
        ...pathUpdates.vendors
      }
    );

    // 12. UPDATE existing vendor_payment row
    await updateRowNormalized(
      client,
      "vendor_payment",
      "vendor_id",
      requestedId,
      paymentUpdates
    );

    // 13. UPDATE existing vendor_documents row
    await updateRowNormalized(
      client,
      "vendor_documents",
      "vendor_id",
      requestedId,
      {
        ...documentUpdates,
        ...pathUpdates.vendor_documents
      }
    );


    // 13. GENERATE OTP FOR NORMAL UPDATE
    const { otp, otpId } = await createOtpRecord(
      client,
      requestedId,
      existingVendor.mobile_no
    );

    // 14. Commit transaction
    await client.query("COMMIT");
    transactionStarted = false;

    console.log(
      `[VENDOR] Updated successfully: ID=${requestedId}`
    );

    // 15. SEND OTP TO EXISTING MOBILE NUMBER
    const otpSent = await deliverOtp(
      otpId,
      existingVendor.mobile_no,
      otp
    );

    console.log(
      `[VENDOR UPDATE] OTP sent status: ${otpSent}`
    );


    // 16. Send notification email after successful update
    // Email failure will not rollback the database update.
    Promise.resolve()
      .then(() =>
        sendVendorNotificationEmail({
          type: "update",
          vendor: {
            id: requestedId,
            name: data.name,
            email: data.email,
            mobile_no: existingVendor.mobile_no,
            contact_person_name: data.contact_person_name,
            city: data.city,
            gst_number: data.gst_number
          }
        })
      )
      .catch((emailError) => {
        console.error(
          "[VENDOR UPDATE EMAIL ERROR]",
          emailError.message
        );
      });

    return res.status(200).json({
      success: true,

      message: otpSent
        ? `Vendor details updated. OTP sent to ${maskMobile(existingVendor.mobile_no)}.`
        : "Vendor details updated, but OTP could not be sent. Please use Resend OTP.",

      next_step: "VERIFY_OTP",

      otp: {
        sent: otpSent,
        mobile_no: existingVendor.mobile_no,
        masked_mobile_no: maskMobile(existingVendor.mobile_no),
        expires_in_seconds: OTP_EXPIRY_MINUTES * 60,
        resend_after_seconds: RESEND_COOLDOWN_SECONDS
      },

      vendor: {
        id: requestedId,
        name: data.name,
        mobile_no: existingVendor.mobile_no,
        email: data.email,
        status: "Pending",
        vendor_type: existingVendor.vendor_type
      }
    });

  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Update rollback failed:",
          rollbackError.message
        );
      }
    }

    // Move uploaded files back to temporary upload paths
    for (const file of movedFiles.reverse()) {
      try {
        await fs.promises.rename(
          file.destination,
          file.originalPath
        );
      } catch (cleanupError) {
        console.error(
          "Update file cleanup failed:",
          cleanupError.message
        );
      }
    }

    await removeUploadedFiles(uploadedFilePaths);

    console.error("Vendor update failed:", error);

    return next(error);

  } finally {
    client.release();
  }
}


// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  registerVendor,
  getMyVendors,
  getVendorById,
  updateVendor,
  updateVendorDetails
};