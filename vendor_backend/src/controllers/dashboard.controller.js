// ==========================================
// DASHBOARD CONTROLLER (Vendor Management screen)
//
// Combines:
//   public.vendors            (main row)
//   public.category           (category_name)
//   public.vendor_payment     (payment / TDS fields)
//   public.vendor_documents   (CIN + all attachments)
//   Zydus site API            (site_name = Preferred Location)
//
// GET   /api/vendors/dashboard              -> list (shape = Angular `Vendor`)
// PATCH /api/vendors/dashboard/:id/status   -> change status (Approve / Reject / Renew)
// ==========================================

const pool = require("../db");

// ==========================================
// CONFIG
// ==========================================

const ZYDUS_SITE_URL =
  "https://app.zydushospitals.com/sampark-api/api/site/list";

const SITE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SITE_FETCH_TIMEOUT_MS = 8000;

// Must match the CHECK constraint vendors_status_check in the database
const ALLOWED_STATUSES = ["Pending", "Approved", "Rejected", "Renew"];

// ==========================================
// SITE LOOKUP (Preferred Location) - cached
// ==========================================

let siteCache = { at: 0, byId: null, bySiteId: null };

async function loadSiteMaps() {
  const fresh =
    siteCache.byId && Date.now() - siteCache.at < SITE_CACHE_TTL_MS;

  if (fresh) return siteCache;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(ZYDUS_SITE_URL, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Zydus site API responded with ${response.status}`);
    }

    const result = await response.json();

    if (result.status !== true || !Array.isArray(result.data)) {
      throw new Error("Invalid response from Zydus site API");
    }

    // NOTE: no status filter here. A vendor may have chosen a site that is
    // inactive today, and the dashboard should still show its name.
    const byId = new Map();
    const bySiteId = new Map();

    for (const site of result.data) {
      if (site.id !== undefined && site.id !== null) {
        byId.set(String(site.id), site.site_name);
      }
      if (site.site_id !== undefined && site.site_id !== null) {
        bySiteId.set(String(site.site_id), site.site_name);
      }
    }

    siteCache = { at: Date.now(), byId, bySiteId };
    return siteCache;

  } catch (error) {
    console.error("Dashboard: could not load Zydus sites:", error.message);

    // Serve stale data if we have it, otherwise empty maps.
    // The dashboard must still load even if the external API is down.
    return siteCache.byId
      ? siteCache
      : { at: 0, byId: new Map(), bySiteId: new Map() };

  } finally {
    clearTimeout(timer);
  }
}

// CHANGED: sirf site_id se match hota hai (vendor-list bhi site_id se match karta hai).
// Pehle byId (site ka "id") bhi check hota tha, jo galat site de deta tha.
function resolveSiteName(maps, zydusMasterId) {
  if (zydusMasterId === null || zydusMasterId === undefined) return null;
  return maps.bySiteId.get(String(zydusMasterId)) ?? null;
}

// ==========================================
// GET /api/vendors/dashboard
// ==========================================

const LIST_SQL = `
  SELECT
    v.id,
    v.name,
    c.name                                   AS category_name,
    v.vendor_type,
    v.zydus_master_id,

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
    COALESCE(NULLIF(v.per_account_no, ''), v.pancard) AS permanent_account_no,
    v.status_of_vendor,
    v.name_of_partners,

    p.permanent_establishment,
    p.payment_terms,
    p.tds_flag,
    p.tds_rate,
    p.classification_of_taxable_service,
    p.delivery_through,

    v.bank_name,
    v.branch_name,
    v.ac_name,
    v.ifsc_code,
    v.ac_no,

    d.cin_number,

    d.gst_certificate_attachment,
    d.pan_card_attachment,
    d.drug_licence_attachment,
    d.msmed_attachment,
    d.experience_product_attachment,
    d.coa_attachment,
    d.experience_with_zydus_attachment,
    d.turnover_attachment,
    d.assets_attachment,
    d.liabilities_attachment,
    d.it_return_attachment,
    v.client_details,
    d.cancel_cheque_attachment,
    d.company_registration_attachment,
    d.authorization_letter_attachment,
    d.cin_number_attachment,

    v.status,
    v.created_at                             AS "createdOn"

  FROM public.vendors v

  LEFT JOIN public.category c
         ON c.id = v.category_id
        AND c.is_deleted = false

  -- latest row per vendor, so duplicates never multiply the vendor rows
  LEFT JOIN LATERAL (
    SELECT *
    FROM public.vendor_payment vp
    WHERE vp.vendor_id = v.id
    ORDER BY vp.id DESC
    LIMIT 1
  ) p ON true

  LEFT JOIN LATERAL (
    SELECT *
    FROM public.vendor_documents vd
    WHERE vd.vendor_id = v.id
    ORDER BY vd.id DESC
    LIMIT 1
  ) d ON true

  ORDER BY v.created_at DESC, v.id DESC
`;

async function getDashboardVendors(req, res, next) {
  try {
    const [result, maps] = await Promise.all([
      pool.query(LIST_SQL),
      loadSiteMaps()
    ]);

    const vendors = result.rows.map(({ zydus_master_id, ...row }) => ({
      ...row,
      site_name: resolveSiteName(maps, zydus_master_id)
    }));

    return res.status(200).json(vendors);

  } catch (error) {
    console.error("Get Dashboard Vendors Error:", error.message);
    return next(error);
  }
}

// ==========================================
// PATCH /api/vendors/dashboard/:id/status
// body: { "status": "Approved" | "Rejected" | "Renew" | "Pending" }
// ==========================================

async function updateVendorStatus(req, res, next) {
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? "").trim();

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid vendor id."
    });
  }

  // Match case-insensitively but always store the canonical spelling
  const canonical = ALLOWED_STATUSES.find(
    (s) => s.toLowerCase() === status.toLowerCase()
  );

  if (!canonical) {
    return res.status(400).json({
      success: false,
      message: `Status must be one of: ${ALLOWED_STATUSES.join(", ")}.`
    });
  }

  try {
    const updated = await pool.query(
      `UPDATE public.vendors
       SET status = $1
       WHERE id = $2
       RETURNING id, status`,
      [canonical, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found."
      });
    }

    return res.status(200).json(updated.rows[0]);

  } catch (error) {
    console.error("Update Vendor Status Error:", error.message);
    return next(error);
  }
}

// ==========================================
// EXPORT CONTROLLERS
// ==========================================

module.exports = {
  getDashboardVendors,
  updateVendorStatus
};