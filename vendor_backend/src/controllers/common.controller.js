
// ==========================================
// MASTER CONTROLLER (Category + Preferred Location)
//
// Category : id + name (public.category)
//            create / update / delete (soft delete) -> admin only
//
// Site     : External Zydus API
//            id, site_id, site_name, status,
//            site_header, site_logo
//
// GET    /api/vendors/categories | /sites   -> public
// POST   /api/vendors/categories            -> admin only
// PUT    /api/vendors/categories/:id        -> admin only
// DELETE /api/vendors/categories/:id        -> admin only
// ==========================================

const pool = require("../db");

// Allowed master tables
const MASTERS = {
  category: {
    table: "category",
    column: "name"
  }
};

// ==========================================
// HELPERS
// ==========================================

function getUserId(req) {
  const user = req.user || {};
  const id = Number(
    user.id ?? user.user_id ?? user.userId ?? user.vendor_id ?? user.sub
  );

  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ==========================================
// CATEGORY
// ==========================================

function makeList({ table, column }) {
  return async function list(req, res, next) {
    try {
      const result = await pool.query(
        `SELECT id, "${column}" AS name
         FROM public."${table}"
         WHERE is_deleted = false
         ORDER BY "${column}" ASC`
      );

      return res.status(200).json(result.rows);

    } catch (error) {
      return next(error);
    }
  };
}

function makeCreate({ table, column }) {
  return async function create(req, res, next) {

    const name = String(req.body?.name ?? "").trim();
    const userId = getUserId(req);

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required."
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name must be 100 characters or fewer."
      });
    }

    try {
      const existing = await pool.query(
        `SELECT id
         FROM public."${table}"
         WHERE LOWER("${column}") = LOWER($1)
           AND is_deleted = false
         LIMIT 1`,
        [name]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "That name already exists."
        });
      }

      const inserted = await pool.query(
        `INSERT INTO public."${table}" ("${column}", createby)
         VALUES ($1, $2)
         RETURNING id, "${column}" AS name`,
        [name, userId]
      );

      return res.status(201).json(inserted.rows[0]);

    } catch (error) {
      return next(error);
    }
  };
}

function makeUpdate({ table, column }) {
  return async function update(req, res, next) {

    const id = parseId(req.params.id);
    const name = String(req.body?.name ?? "").trim();
    const userId = getUserId(req);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid id."
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required."
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name must be 100 characters or fewer."
      });
    }

    try {
      const existing = await pool.query(
        `SELECT id
         FROM public."${table}"
         WHERE LOWER("${column}") = LOWER($1)
           AND id <> $2
           AND is_deleted = false
         LIMIT 1`,
        [name, id]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "That name already exists."
        });
      }

      const updated = await pool.query(
        `UPDATE public."${table}"
         SET "${column}" = $1,
             updateby = $2
         WHERE id = $3
           AND is_deleted = false
         RETURNING id, "${column}" AS name`,
        [name, userId, id]
      );

      if (updated.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Not found."
        });
      }

      return res.status(200).json(updated.rows[0]);

    } catch (error) {
      return next(error);
    }
  };
}

// Soft delete
function makeDelete({ table }) {
  return async function remove(req, res, next) {

    const id = parseId(req.params.id);
    const userId = getUserId(req);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid id."
      });
    }

    try {
      const deleted = await pool.query(
        `UPDATE public."${table}"
         SET is_deleted = true,
             deleteby = $1
         WHERE id = $2
           AND is_deleted = false
         RETURNING id`,
        [userId, id]
      );

      if (deleted.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Not found."
        });
      }

      return res.status(200).json({
        success: true,
        message: "Deleted successfully."
      });

    } catch (error) {
      return next(error);
    }
  };
}

// ==========================================
// SITES (PREFERRED LOCATION) - READ ONLY
// DATA FROM EXTERNAL ZYDUS API
// ==========================================

async function getSites(req, res, next) {
  try {

    const apiUrl =
      "https://app.zydushospitals.com/sampark-api/api/site/list";

    const response = await fetch(apiUrl);

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        message: "Unable to fetch Zydus site list.",
        status_code: response.status
      });
    }

    const result = await response.json();

    if (
      result.status !== true ||
      !Array.isArray(result.data)
    ) {
      return res.status(502).json({
        success: false,
        message: "Invalid response received from Zydus site API."
      });
    }

    // Return all fields for future use.
    // Only active sites will be shown in Preferred Location.
    const sites = result.data.filter(
      (site) => site.status === true
    );

    return res.status(200).json({
      success: true,
      message: "Zydus site list fetched successfully.",
      count: sites.length,
      data: sites
    });

  } catch (error) {
    console.error("Get Zydus Sites Error:", error.message);
    return next(error);
  }
}

// ==========================================
// EXPORT CONTROLLERS
// ==========================================

module.exports = {
  getCategories: makeList(MASTERS.category),
  createCategory: makeCreate(MASTERS.category),
  updateCategory: makeUpdate(MASTERS.category),
  deleteCategory: makeDelete(MASTERS.category),

  getSites
};
