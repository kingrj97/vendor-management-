const jwt = require("jsonwebtoken");
const pool = require("../db");

const COOKIE_NAME = "vendor_token";

async function authenticate(req, res, next) {
  try {
    // 1. Token pehle HttpOnly cookie se (secure tareeka)
    let token = req.cookies?.[COOKIE_NAME] || null;

    // 2. Transition ke liye Bearer header fallback.
    //    Frontend poori tarah cookie par shift ho jaye to ye 3 lines hata dena.
    if (!token) {
      const header = req.headers.authorization || "";
      token = header.startsWith("Bearer ") ? header.slice(7) : null;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: "Please login first." });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ["HS256"]   // algorithm confusion attack se bachav
      });
    } catch {
      return res.status(401).json({ success: false, message: "Session expired. Please login again." });
    }

    // Session + vendor ka FRESH data DB se (role change turant apply hota hai)
    const result = await pool.query(
      `SELECT v.id, v.mobile_no, v.status, v.is_admin, s.id AS sid
       FROM public.vendor_sessions s
       JOIN public.vendors v ON v.id = s.vendor_id
       WHERE s.id = $1
         AND s.vendor_id = $2
         AND s.revoked_at IS NULL
         AND s.expires_at > NOW()
       LIMIT 1`,
      [payload.sid, payload.id]
    );

    const row = result.rows[0];

    if (!row) {
      return res.status(401).json({ success: false, message: "Session expired. Please login again." });
    }

    const isAdmin = Number(row.is_admin) === 1;

    // Purane code jaisi hi shape (id, mobile_no, role, is_admin, sid),
    // par values ab token ki nahi, DB ki hain
    req.user = {
      id: row.id,
      mobile_no: row.mobile_no,
      status: row.status,
      sid: row.sid,
      role: isAdmin ? "admin" : "vendor",
      is_admin: isAdmin ? 1 : 0
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

// Admin-only routes ke liye: router.get("/admin/...", auth, requireAdmin, handler)
function requireAdmin(req, res, next) {
  if (req.user?.is_admin !== 1) {
    return res.status(403).json({ success: false, message: "Admin access required." });
  }
  return next();
}

module.exports = authenticate;               // purana: const auth = require(...)
module.exports.authenticate = authenticate;  // naya: const { authenticate } = require(...)
module.exports.requireAdmin = requireAdmin;