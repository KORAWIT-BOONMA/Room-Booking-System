
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../db");
const requireAdmin = require("../middleware/auth");

const {
    loginRateLimiter,
    recordFailedLogin,
    clearLoginFailures
} = require("../middleware/loginLimiter");

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const MAX_BCRYPT_PASSWORD_BYTES = 72;

router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    return next();
});

function getPasswordValidationError(password) {

    if (typeof password !== "string") {
        return "กรุณากรอกรหัสผ่านให้ถูกต้อง";
    }

    if (password.length < 12) {
        return "รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 12 ตัวอักษร";
    }

    if (Buffer.byteLength(password, "utf8") > MAX_BCRYPT_PASSWORD_BYTES) {
        return "รหัสผ่านใหม่ยาวเกินกำหนด (สูงสุด 72 ไบต์สำหรับระบบเข้ารหัสปัจจุบัน)";
    }

    return null;
}

// ==========================================
// ADMIN LOGIN
// ==========================================

router.post("/login", loginRateLimiter, async (req, res) => {

    try {

        const { username, password } = req.body || {};

        if (
            typeof username !== "string" ||
            typeof password !== "string" ||
            !username.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "กรุณากรอก Username และ Password"
            });
        }

        if (username.trim().length > 40) {
            recordFailedLogin(req);

            return res.status(401).json({
                success: false,
                message: "Username หรือ Password ไม่ถูกต้อง"
            });
        }

        if (
            !process.env.JWT_SECRET ||
            process.env.JWT_SECRET.length < 32
        ) {
            return res.status(500).json({
                success: false,
                message: "JWT Secret ยังไม่ได้ตั้งค่า"
            });
        }

        const admin = db.prepare(`
            SELECT
                id,
                username,
                password_hash,
                auth_version AS authVersion
            FROM admins
            WHERE username = ?
        `).get(username.trim());

        const passwordValid = admin
            ? await bcrypt.compare(password, admin.password_hash)
            : false;

        if (!admin || !passwordValid) {

            recordFailedLogin(req);

            return res.status(401).json({
                success: false,
                message: "Username หรือ Password ไม่ถูกต้อง"
            });
        }

        clearLoginFailures(req);

        const token = jwt.sign(
            {
                adminId: admin.id,
                authVersion: Number(admin.authVersion || 0)
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "8h",
                algorithm: "HS256"
            }
        );

        return res.json({
            success: true,
            message: "เข้าสู่ระบบสำเร็จ",
            accessToken: token,
            tokenType: "Bearer",
            expiresIn: 28800,
            admin: {
                id: admin.id,
                username: admin.username
            }
        });

    } catch (error) {

        console.error("Admin login error:", error);

        return res.status(500).json({
            success: false,
            message: "ไม่สามารถเข้าสู่ระบบได้"
        });

    }

});

// ==========================================
// CHANGE ADMIN PASSWORD
// PATCH /api/auth/password
// ==========================================

router.patch("/password", requireAdmin, async (req, res) => {

    try {

        const {
            currentPassword,
            newPassword,
            confirmPassword
        } = req.body || {};

        if (
            typeof currentPassword !== "string" ||
            !currentPassword ||
            typeof newPassword !== "string" ||
            typeof confirmPassword !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่ให้ครบ"
            });
        }

        const passwordError = getPasswordValidationError(newPassword);

        if (passwordError) {
            return res.status(400).json({
                success: false,
                message: passwordError
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน"
            });
        }

        const admin = db.prepare(`
            SELECT
                id,
                password_hash,
                auth_version AS authVersion
            FROM admins
            WHERE id = ?
        `).get(req.admin.id);

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: "ไม่พบบัญชี Admin กรุณาเข้าสู่ระบบใหม่"
            });
        }

        const currentPasswordValid = await bcrypt.compare(
            currentPassword,
            admin.password_hash
        );

        if (!currentPasswordValid) {
            return res.status(400).json({
                success: false,
                message: "รหัสผ่านปัจจุบันไม่ถูกต้อง"
            });
        }

        const sameAsCurrent = await bcrypt.compare(
            newPassword,
            admin.password_hash
        );

        if (sameAsCurrent) {
            return res.status(400).json({
                success: false,
                message: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน"
            });
        }

        const newPasswordHash = await bcrypt.hash(
            newPassword,
            BCRYPT_ROUNDS
        );

        const result = db.prepare(`
            UPDATE admins
            SET
                password_hash = ?,
                auth_version = auth_version + 1
            WHERE id = ? AND auth_version = ?
        `).run(
            newPasswordHash,
            req.admin.id,
            Number(admin.authVersion)
        );

        if (result.changes !== 1) {
            return res.status(409).json({
                success: false,
                message: "ข้อมูลบัญชีมีการเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง"
            });
        }

        return res.json({
            success: true,
            message: "เปลี่ยนรหัสผ่าน Admin สำเร็จ กรุณาเข้าสู่ระบบใหม่",
            forceReLogin: true
        });

    } catch (error) {

        console.error("Change admin password error:", error);

        return res.status(500).json({
            success: false,
            message: "ไม่สามารถเปลี่ยนรหัสผ่านได้"
        });

    }

});

// ==========================================
// CHECK CURRENT ADMIN SESSION
// ==========================================

router.get("/me", requireAdmin, (req, res) => {

    return res.json({
        success: true,
        admin: {
            id: req.admin.id,
            username: req.admin.username
        }
    });

});

module.exports = router;
