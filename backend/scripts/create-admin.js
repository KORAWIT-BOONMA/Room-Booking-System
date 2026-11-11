
const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, "..", ".env")
});

const bcrypt = require("bcryptjs");
const db = require("../db");

async function createOrUpdateAdmin() {

    try {

        const username = process.env.ADMIN_USERNAME?.trim();
        const password = process.env.ADMIN_PASSWORD;

        if (!username || !password) {
            throw new Error(
                "กรุณาตั้ง ADMIN_USERNAME และ ADMIN_PASSWORD ใน .env"
            );
        }

        if (username.length < 3 || username.length > 40) {
            throw new Error("Username ต้องมีความยาว 3-40 ตัวอักษร");
        }

        if (password.length < 12) {
            throw new Error("Password ต้องมีความยาวอย่างน้อย 12 ตัวอักษร");
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const existing = db.prepare(`
            SELECT id FROM admins WHERE username = ?
        `).get(username);

        if (existing) {

            db.prepare(`
                UPDATE admins
                SET password_hash = ?
                WHERE id = ?
            `).run(passwordHash, existing.id);

            console.log("ADMIN PASSWORD UPDATED");
            console.log("Admin ID:", existing.id);

        } else {

            const result = db.prepare(`
                INSERT INTO admins (username, password_hash)
                VALUES (?, ?)
            `).run(username, passwordHash);

            console.log("ADMIN CREATED SUCCESSFULLY");
            console.log("Admin ID:", result.lastInsertRowid);

        }

        console.log("Username:", username);
        console.log("Password saved as bcrypt hash");

    } catch (error) {

        console.error("Admin operation failed:", error.message);
        process.exitCode = 1;

    } finally {

        db.close();

    }
}

createOrUpdateAdmin();
