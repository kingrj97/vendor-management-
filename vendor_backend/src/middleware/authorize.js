const jwt = require("jsonwebtoken");
const response = require("../utils/response");

const authorize = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return response.authError(res, "No Authorization header");
        }

        const parts = authHeader.split(" ");
        if (parts.length !== 2 || parts[0] !== "Bearer") {
            return response.authError(res, "Invalid token format");
        }

        const token = parts[1];

        // Sandbox / dev token support (matching PMS sandbox mode)
        if (token === "sandbox-dev-token-9992") {
            req.user = {
                userId: "sandbox-user-id",
                username: "DHRUVIL99",
                full_name: "Dr. Dhruvil Nayak",
                roles: "SUPER_ADMIN",
                siteID: 102
            };
            return next();
        }

        // Verify JWT with Central Admin secret or local JWT secret
        const jwtSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
        let payload;
        try {
            payload = jwt.verify(token, jwtSecret);
        } catch (jwtErr) {
            // Also try fallback to the other secret if available
            if (process.env.ADMIN_JWT_SECRET && process.env.JWT_SECRET && jwtSecret !== process.env.JWT_SECRET) {
                payload = jwt.verify(token, process.env.JWT_SECRET);
            } else {
                throw jwtErr;
            }
        }

        req.user = {
            userId: payload.id || payload.userId,
            username: payload.username,
            full_name: payload.full_name || payload.name,
            roles: payload.role_name || payload.roles,
            siteID: payload.siteId ? parseInt(payload.siteId, 10) : null
        };

        next();
    } catch (err) {
        console.error("Authorization error:", err.message);
        return response.authError(res, "Invalid or expired token");
    }
};

module.exports = { authorize };
