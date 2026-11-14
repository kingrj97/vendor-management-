const response = require("../utils/response");

const AUTH_SERVICE_URL = (process.env.AUTH_SERVICE_URL || "").replace(/\/$/, "");

const getUserProfileApiUrl = () => {
    if (!AUTH_SERVICE_URL) {
        return null;
    }
    return AUTH_SERVICE_URL.endsWith("/api")
        ? `${AUTH_SERVICE_URL}/user/profile`
        : `${AUTH_SERVICE_URL}/api/user/profile`;
};

const attachUserProfile = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return response.authError(res, "Token missing");
        }

        // Sandbox bypass
        if (req.user?.userId === "sandbox-user-id") {
            req.userProfile = {
                id: "sandbox-user-id",
                full_name: "Dr. Dhruvil Nayak",
                username: "DHRUVIL99",
                dept: { his_dept_name: "CENTRAL PURCHASE DEPT" }
            };
            req.permissions = {
                "DASHBOARD_READ": true,
                "VENDOR_READ": true,
                "VENDOR_WRITE": true,
                "VENDOR_ADMIN": true,
                "SUPER_ADMIN": true
            };
            req.siteId = req.user.siteID || 102;
            return next();
        }

        const profileUrl = getUserProfileApiUrl();
        if (profileUrl) {
            try {
                const apiRes = await fetch(profileUrl, {
                    method: "GET",
                    headers: {
                        Authorization: authHeader,
                        Accept: "application/json"
                    }
                });

                if (apiRes.ok) {
                    const result = await apiRes.json();
                    const data = result?.data || result;
                    req.userProfile = data.userProfile || {};
                    req.permissions = data.permissions || {};
                    req.siteId = data.siteId || req.user?.siteID || null;
                    return next();
                }
            } catch (networkErr) {
                console.warn("[attachUserProfile] Warning calling AUTH_SERVICE_URL:", networkErr.message);
            }
        }

        // Fallback profile if AUTH_SERVICE_URL is unreachable in local dev
        req.userProfile = {
            id: req.user?.userId,
            full_name: req.user?.full_name || req.user?.username,
            username: req.user?.username,
            dept: { his_dept_name: "VENDOR MANAGEMENT" }
        };
        req.permissions = {
            "DASHBOARD_READ": true,
            "VENDOR_READ": true,
            "VENDOR_WRITE": true,
            "VENDOR_ADMIN": true
        };
        req.siteId = req.user?.siteID || 102;

        next();
    } catch (err) {
        console.error("attachUserProfile error:", err.message);
        return response.authError(res, err.message || "Unauthorized");
    }
};

module.exports = attachUserProfile;
