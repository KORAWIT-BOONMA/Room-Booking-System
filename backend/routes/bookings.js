
const express = require("express");
const crypto = require("crypto");

const router = express.Router();
const db = require("../db");
const requireAdmin = require("../middleware/auth");

// ==========================================
// DATE / TIME VALIDATION
// ==========================================

function makeDateTime(date, time) {

    if (
        typeof date !== "string" ||
        typeof time !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !/^\d{2}:\d{2}$/.test(time)
    ) {
        return null;
    }

    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);

    if (year < 1900 || month < 1 || month > 12) {
        return null;
    }

    const leapYear =
        year % 400 === 0 ||
        (year % 4 === 0 && year % 100 !== 0);

    const daysPerMonth = [
        31,
        leapYear ? 29 : 28,
        31, 30, 31, 30,
        31, 31, 30, 31, 30, 31
    ];

    if (
        day < 1 ||
        day > daysPerMonth[month - 1] ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
    ) {
        return null;
    }

    return `${date}T${time}`;
}


// ==========================================
// CUSTOMER: LOOKUP OWN BOOKING
// ต้องใช้ Email + Booking Code
// ==========================================

router.get("/my", (req, res) => {

    try {

        const email = typeof req.query.email === "string"
            ? req.query.email.trim().toLowerCase()
            : "";

        const bookingCode = typeof req.query.bookingCode === "string"
            ? req.query.bookingCode.trim().toUpperCase()
            : "";

        if (
            !email ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            !bookingCode
        ) {

            return res.status(400).json({
                success: false,
                message: "กรุณากรอกอีเมลและรหัสการจอง"
            });

        }

        const booking = db.prepare(`
            SELECT
                id,
                booking_code AS bookingCode,
                room_id AS roomId,
                room_name AS roomName,
                room_type AS roomType,
                start_at AS startAt,
                end_at AS endAt,
                user_name AS userName,
                user_email AS userEmail,
                status,
                created_at AS createdAt,
                cancelled_at AS cancelledAt
            FROM bookings
            WHERE lower(user_email) = ?
            AND upper(booking_code) = ?
        `).get(email, bookingCode);

        if (!booking) {

            return res.status(404).json({
                success: false,
                message: "ไม่พบรายการจอง กรุณาตรวจสอบอีเมลและ Booking Code"
            });

        }

        return res.json({
            success: true,
            booking
        });

    } catch (error) {

        console.error("Lookup booking error:", error);

        return res.status(500).json({
            success: false,
            message: "ไม่สามารถค้นหาประวัติการจองได้"
        });

    }

});


// ==========================================
// ADMIN: GET ALL BOOKINGS
// ==========================================

router.get("/", requireAdmin, (req, res) => {

    try {

        const bookings = db.prepare(`
            SELECT
                id,
                booking_code AS bookingCode,
                room_id AS roomId,
                room_name AS roomName,
                room_type AS roomType,
                start_at AS startAt,
                end_at AS endAt,
                user_name AS userName,
                user_email AS userEmail,
                status,
                created_at AS createdAt,
                cancelled_at AS cancelledAt
            FROM bookings
            ORDER BY created_at DESC
        `).all();

        return res.json({
            success: true,
            total: bookings.length,
            bookings
        });

    } catch (error) {

        console.error("Get bookings error:", error);

        return res.status(500).json({
            success: false,
            message: "ไม่สามารถโหลดประวัติการจองได้"
        });

    }

});


// ==========================================
// CREATE BOOKING
// ==========================================

router.post("/", (req, res) => {

    try {

        const {
            roomId,
            startDate,
            startTime,
            endDate,
            endTime,
            userName,
            userEmail
        } = req.body || {};

        const name = typeof userName === "string"
            ? userName.trim()
            : "";

        const email = typeof userEmail === "string"
            ? userEmail.trim().toLowerCase()
            : "";

        if (
            typeof roomId !== "string" ||
            !roomId.trim() ||
            !name ||
            name.length > 120 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            email.length > 254
        ) {

            return res.status(400).json({
                success: false,
                message: "กรุณาตรวจสอบข้อมูลผู้จอง"
            });

        }

        const startAt = makeDateTime(startDate, startTime);
        const endAt = makeDateTime(endDate, endTime);

        if (!startAt || !endAt || startAt >= endAt) {

            return res.status(400).json({
                success: false,
                message: "วันและเวลาสิ้นสุดต้องอยู่หลังวันเวลาเริ่มต้น"
            });

        }

        const reserveBooking = db.transaction(() => {

            const room = db.prepare(`
                SELECT id, name, capacity, type
                FROM rooms
                WHERE id = ? AND is_active = 1
            `).get(roomId.trim());

            if (!room) {

                const error = new Error(
                    "ไม่พบห้องที่เลือกหรือห้องถูกปิดให้บริการ"
                );

                error.statusCode = 404;
                throw error;

            }

            const conflict = db.prepare(`
                SELECT
                    id,
                    booking_code,
                    start_at,
                    end_at
                FROM bookings
                WHERE room_id = ?
                AND status = 'confirmed'
                AND start_at < ?
                AND end_at > ?
                LIMIT 1
            `).get(
                room.id,
                endAt,
                startAt
            );

            if (conflict) {

                const error = new Error(
                    "ห้องนี้มีรายการจองในช่วงเวลาดังกล่าวแล้ว"
                );

                error.statusCode = 409;

                error.conflict = {
                    startAt: conflict.start_at,
                    endAt: conflict.end_at
                };

                throw error;

            }

            const id = crypto.randomUUID();

            const bookingCode =
                `HR-${startDate.replace(/-/g, "")}-` +
                crypto.randomBytes(3).toString("hex").toUpperCase();

            db.prepare(`
                INSERT INTO bookings (
                    id,
                    booking_code,
                    room_id,
                    room_name,
                    room_type,
                    start_at,
                    end_at,
                    user_name,
                    user_email,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
            `).run(
                id,
                bookingCode,
                room.id,
                room.name,
                room.type,
                startAt,
                endAt,
                name,
                email
            );

            return {
                id,
                bookingCode,
                roomId: room.id,
                roomName: room.name,
                roomType: room.type,
                startAt,
                endAt,
                userName: name,
                userEmail: email,
                status: "confirmed"
            };

        });

        const booking = reserveBooking.immediate();

        return res.status(201).json({
            success: true,
            message: "จองห้องสำเร็จ",
            booking
        });

    } catch (error) {

        if (error.statusCode) {

            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
                conflict: error.conflict || null
            });

        }

        console.error("Create booking error:", error);

        return res.status(500).json({
            success: false,
            message: "ไม่สามารถบันทึกการจองได้"
        });

    }

});


// ==========================================
// ADMIN: CANCEL BOOKING
// เปลี่ยนสถานะ ไม่ลบข้อมูล
// ==========================================

router.patch("/:id/cancel", requireAdmin, (req, res) => {

    try {

        const bookingId = req.params.id;

        const result = db.prepare(`
            UPDATE bookings
            SET
                status = 'cancelled',
                cancelled_at = CURRENT_TIMESTAMP
            WHERE id = ?
            AND status = 'confirmed'
        `).run(bookingId);

        if (result.changes === 0) {

            const existing = db.prepare(`
                SELECT id, status
                FROM bookings
                WHERE id = ?
            `).get(bookingId);

            if (!existing) {

                return res.status(404).json({
                    success: false,
                    message: "ไม่พบรายการจองที่ต้องการยกเลิก"
                });

            }

            return res.status(409).json({
                success: false,
                message: "รายการจองนี้ถูกยกเลิกไปแล้ว"
            });

        }

        return res.json({
            success: true,
            message: "ยกเลิกรายการจองสำเร็จ"
        });

    } catch (error) {

        console.error("Cancel booking error:", error);

        return res.status(500).json({
            success: false,
            message: "ไม่สามารถยกเลิกรายการจองได้"
        });

    }

});


module.exports = router;
