
require("dotenv").config();

const express = require("express");
const path = require("path");

const db = require("./db");
const roomsRouter = require("./routes/rooms");
const bookingsRouter = require("./routes/bookings");
const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");

const app = express();

const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE
// ==========================================

app.disable("x-powered-by");

app.use(express.json({
    limit: "100kb"
}));

app.use(express.urlencoded({
    extended: false,
    limit: "100kb"
}));

// ==========================================
// API ROUTES
// ==========================================

app.use("/api/rooms", roomsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);

// ==========================================
// FRONTEND FILES
// ==========================================

const frontendDirectory = path.resolve(__dirname, "..");

// หน้าเว็บไซต์หลัก
app.get("/", (req, res) => {
    res.sendFile(
        path.join(frontendDirectory, "index.html")
    );
});

// JavaScript
app.get("/script.js", (req, res) => {
    res.sendFile(
        path.join(frontendDirectory, "script.js")
    );
});

// CSS
app.get("/style.css", (req, res) => {
    res.sendFile(
        path.join(frontendDirectory, "style.css")
    );
});

// ==========================================
// SERVER HEALTH CHECK
// ==========================================

app.get("/api/health", (req, res) => {

    try {
        db.prepare("SELECT 1").get();

        res.json({
            success: true,
            message: "HYBRID RESERVE API is running",
            database: "connected"
        });

    } catch (error) {

        console.error("Health check error:", error);

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});

// ==========================================
// 404 HANDLER
// ==========================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "ไม่พบ API หรือหน้าที่ต้องการ"
    });
});

// ==========================================
// ERROR HANDLER
// ==========================================

app.use((error, req, res, next) => {

    console.error("Server error:", error);

    if (error.type === "entity.parse.failed") {
        return res.status(400).json({
            success: false,
            message: "รูปแบบ JSON ไม่ถูกต้อง"
        });
    }

    res.status(500).json({
        success: false,
        message: "เกิดข้อผิดพลาดภายใน Server"
    });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {

    console.log("");
    console.log("================================");
    console.log(" HYBRID RESERVE BACKEND");
    console.log("================================");
    console.log(` Server: http://localhost:${PORT}`);
    console.log(` API:    http://localhost:${PORT}/api/health`);
    console.log(" Database: Connected");
    console.log("================================");
    console.log("");

});
