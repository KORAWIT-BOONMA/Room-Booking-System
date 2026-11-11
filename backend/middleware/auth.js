
const jwt = require("jsonwebtoken");
const db = require("../db");

function unauthorized(
    res,
    message = "Session หมดอายุหรือ Token ไม่ถูกต้อง"
) {
    return res.status(401).json({
        success: false,
        message
    });
}

function requireAdmin(req, res, next) {

    const secret = process.env.JWT_SECRET;

    if (!secret || secret.length < 32) {
        return res.status(500).json({
            success: false,
            message: "JWT Secret ยังไม่ได้ตั้งค่าอย่างถูกต้อง"
        });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return unauthorized(
            res,
            "กรุณาเข้าสู่ระบบ Admin"
        );
    }

    const token = authHeader.slice(7).trim();

    try {

        const decoded = jwt.verify(token, secret, {
            algorithms: ["HS256"]
        });

        const adminId = Number(decoded.adminId);

        const tokenAuthVersion = Number(
            decoded.authVersion ?? 0
        );

        if (
            !Number.isSafeInteger(adminId) ||
            adminId < 1 ||
            !Number.isSafeInteger(tokenAuthVersion) ||
            tokenAuthVersion < 0
        ) {
            return unauthorized(res);
        }

        const admin = db.prepare(`
            SELECT
                id,
                username,
                auth_version AS authVersion
            FROM admins
            WHERE id = ?
        `).get(adminId);

        if (!admin) {
            return unauthorized(
                res,
                "ไม่พบบัญชี Admin"
            );
        }

        // Invalidate old tokens after password changes.
        if (
            Number(admin.authVersion) !== tokenAuthVersion
        ) {
            return unauthorized(
                res,
                "รหัสผ่านหรือ Session มีการเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่"
            );
        }

        req.admin = {
            id: admin.id,
            username: admin.username,
            authVersion: Number(admin.authVersion)
        };

        return next();

    } catch (error) {

        return unauthorized(res);

    }

}

module.exports = requireAdmin;
