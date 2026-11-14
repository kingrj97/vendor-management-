const { Router } = require("express");
const { authorize } = require("../middleware/authorize");
const attachUserProfile = require("../middleware/attachUserProfile");

const router = Router();

const omitEmail = (value) => {
    if (!value || typeof value !== "object") {
        return value;
    }
    const { email, ...rest } = value;
    return rest;
};

// Central session verification route with user profile and permissions (same as PMS)
router.get("/me", authorize, attachUserProfile, (req, res) => {
    res.json({
        success: true,
        user: omitEmail(req.user),
        userProfile: omitEmail(req.userProfile),
        permissions: req.permissions || {},
        siteId: req.siteId || req.user?.siteID || null
    });
});

module.exports = router;
