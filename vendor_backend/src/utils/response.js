const response = {
    success: (res, message, data) => {
        return res.status(200).json({
            status: true,
            success: true,
            message: message,
            data: data,
        });
    },
    error: (res, message) => {
        return res.status(200).json({
            status: false,
            success: false,
            message: message,
            data: null,
        });
    },
    serverError: (res, message) => {
        return res.status(500).json({
            status: false,
            success: false,
            message: message || "Internal Server Error",
            data: null,
        });
    },
    authError: (res, message) => {
        return res.status(401).json({
            status: false,
            success: false,
            message: message || "Unauthorized",
            data: null,
        });
    },
    handleError: (res, error, fallbackMessage = "Something went wrong") => {
        return res.status(200).json({
            status: false,
            success: false,
            message: error?.message || fallbackMessage,
            data: null,
        });
    },
};

module.exports = response;
