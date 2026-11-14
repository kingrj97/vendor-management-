const response = require("../utils/response");

const checkPermission = (permissionKey) => {
    return (req, res, next) => {
        try {
            const user = req.user;

            if (!user) {
                return response.authError(res, "Unauthorized");
            }

            // SUPER_ADMIN bypass
            const roles = user.roles;
            const isSuperAdmin =
                roles === "SUPER_ADMIN" ||
                (Array.isArray(roles) && roles.some(r => String(r).toUpperCase() === "SUPER_ADMIN"));

            if (isSuperAdmin) {
                return next();
            }

            // Check permissions map
            if (req.permissions && (req.permissions[permissionKey] || req.permissions["*"])) {
                return next();
            }

            return res.status(403).json({
                status: false,
                success: false,
                message: `Access denied. Permission "${permissionKey}" required.`
            });
        } catch (error) {
            console.error("checkPermission error:", error.message);
            return response.serverError(res, error.message);
        }
    };
};

module.exports = checkPermission;
