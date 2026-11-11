
const express = require("express");
const crypto = require("crypto");

const router = express.Router();

const db = require("../db");
const requireAdmin = require("../middleware/auth");

// ==========================================
// ROOM NAME HELPERS
// ==========================================

function normalizeRoomName(name) {

    return String(name || "")
        .normalize("NFKC")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

}


function extractRoomNumber(name) {

    const match = String(name || "").match(
        /\b(?:normal\s+room|suite\s+room|room)\s*[-#:]?\s*(\d{1,5})\b/i
    );

    return match ? match[1] : null;

}


// ==========================================
// ADMIN: GET ALL ROOMS
// ==========================================

router.get("/admin", requireAdmin, (req, res) => {

    try {

        const rooms = db.prepare(`
            SELECT
                r.id,
                r.name,
                r.capacity,
                r.type,
                r.is_active AS isActive,
                r.created_at AS createdAt,
                (
                    SELECT COUNT(*)
                    FROM bookings b
                    WHERE b.room_id = r.id
                ) AS bookingCount
            FROM rooms r
            ORDER BY
                CASE r.type
                    WHEN 'meeting' THEN 0
                    ELSE 1
                END,
                r.name
        `).all();

        return res.json({
            success: true,
            total: rooms.length,
            rooms
        });

    } catch (error) {

        console.error("Admin get rooms error:", error);

        return res.status(500).json({
            success: false,
            message: "ไม่สามารถดึงข้อมูลห้องทั้งหมดได้"
        });

    }

});


// ==========================================
// GET ACTIVE ROOMS - PUBLIC
// ==========================================

router.get("/", (req, res) => {

    try {

        const rooms = db.prepare(`
            SELECT
                id,
                name,
                capacity,
                type,
                is_active AS isActive
            FROM rooms
            WHERE is_active = 1
            ORDER BY
                CASE type
                    WHEN 'meeting' THEN 0
                    ELSE 1
                END,
                id
        `).all();

        return res.json({
            success: true,
            total: rooms.length,
            rooms
        });

    } catch (error) {

        console.error("Get rooms error:", error);

        return res.status(500).json({
            success: false,
            message: "ไม่สามารถดึงข้อมูลห้องได้"
        });

    }

});


// ==========================================
// ADD NEW ROOM - ADMIN ONLY
// ป้องกันชื่อและหมายเลขห้องซ้ำ
// ==========================================

router.post("/", requireAdmin, (req, res) => {

    try {

        const { name, capacity, type } = req.body || {};

        const roomName = typeof name === "string"
            ? name.trim()
            : "";

        const roomCapacity = Number(capacity);

        if (
            !roomName ||
            roomName.length > 120 ||
            !Number.isInteger(roomCapacity) ||
            roomCapacity < 1 ||
            roomCapacity > 500 ||
            !["meeting", "residence"].includes(type)
        ) {

            return res.status(400).json({
                success: false,
                message: "กรุณาตรวจสอบชื่อห้อง ความจุ และประเภทห้อง"
            });

        }

        const createRoom = db.transaction(() => {

            const existingRooms = db.prepare(`
                SELECT id, name, type
                FROM rooms
            `).all();

            const duplicateName = existingRooms.find(room =>
                normalizeRoomName(room.name) ===
                normalizeRoomName(roomName)
            );

            if (duplicateName) {

                const error = new Error(
                    `มีห้องชื่อ "${duplicateName.name}" อยู่ในระบบแล้ว`
                );

                error.statusCode = 409;
                throw error;

            }

            const newRoomNumber = extractRoomNumber(roomName);

            if (newRoomNumber) {

                const duplicateNumber = existingRooms.find(room =>
                    extractRoomNumber(room.name) === newRoomNumber
                );

                if (duplicateNumber) {

                    const error = new Error(
                        `หมายเลขห้อง ${newRoomNumber} มีอยู่แล้วในระบบ (${duplicateNumber.name})`
                    );

                    error.statusCode = 409;
                    throw error;

                }

            }

            const id = `rm_${crypto.randomUUID()}`;

            db.prepare(`
                INSERT INTO rooms (
                    id,
                    name,
                    capacity,
                    type
                )
                VALUES (?, ?, ?, ?)
            `).run(
                id,
                roomName,
                roomCapacity,
                type
            );

            return {
                id,
                name: roomName,
                capacity: roomCapacity,
                type,
                isActive: 1
            };

        });

        const room = createRoom.immediate();

        return res.status(201).json({
            success: true,
            message: "เพิ่มห้องใหม่สำเร็จ",
            room
        });

    } catch (error) {

        if (error.statusCode === 409) {

            return res.status(409).json({
                success: false,
                message: error.message
            });

        }

        console.error("Add room error:", error);

        return res.status(500).json({
            success: false,
            message: "ไม่สามารถเพิ่มห้องใหม่ได้"
        });

    }

});


// ==========================================
// EDIT ROOM DETAILS - ADMIN ONLY
// แก้ชื่อ ความจุ และประเภทห้อง
// ==========================================

router.patch("/:id", requireAdmin, (req, res) => {

    try {

        const roomId = req.params.id;

        const { name, capacity, type } = req.body || {};

        const roomName = typeof name === "string"
            ? name.trim()
            : "";

        const roomCapacity = Number(capacity);

        if (
            !roomName ||
            roomName.length > 120 ||
            !Number.isInteger(roomCapacity) ||
            roomCapacity < 1 ||
            roomCapacity > 500 ||
            !["meeting", "residence"].includes(type)
        ) {

            return res.status(400).json({
                success: false,
                message: "กรุณาตรวจสอบชื่อห้อง ความจุ และประเภทห้อง"
            });

        }

        const updateRoom = db.transaction(() => {

            const currentRoom = db.prepare(`
                SELECT id, name
                FROM rooms
                WHERE id = ?
            `).get(roomId);

            if (!currentRoom) {

                const error = new Error("ไม่พบห้องที่ต้องการแก้ไข");
                error.statusCode = 404;
                throw error;

            }

            // ตรวจทุกห้อง ยกเว้นห้องที่กำลังแก้ไข
            // รวมถึงห้องที่ปิดใช้งาน

            const otherRooms = db.prepare(`
                SELECT id, name
                FROM rooms
                WHERE id <> ?
            `).all(roomId);

            // ตรวจชื่อซ้ำ

            const duplicateName = otherRooms.find(room =>
                normalizeRoomName(room.name) ===
                normalizeRoomName(roomName)
            );

            if (duplicateName) {

                const error = new Error(
                    `มีห้องชื่อ "${duplicateName.name}" อยู่แล้ว`
                );

                error.statusCode = 409;
                throw error;

            }

            // ตรวจหมายเลขห้องซ้ำ

            const newRoomNumber = extractRoomNumber(roomName);

            if (newRoomNumber) {

                const duplicateNumber = otherRooms.find(room =>
                    extractRoomNumber(room.name) === newRoomNumber
                );

                if (duplicateNumber) {

                    const error = new Error(
                        `หมายเลขห้อง ${newRoomNumber} มีอยู่แล้ว (${duplicateNumber.name})`
                    );

                    error.statusCode = 409;
                    throw error;

                }

            }

            // อัปเดตข้อมูลห้อง
            // ไม่แก้ไขประวัติการจองเก่า

            db.prepare(`
                UPDATE rooms
                SET
                    name = ?,
                    capacity = ?,
                    type = ?
                WHERE id = ?
            `).run(
                roomName,
                roomCapacity,
                type,
                roomId
            );

            return {
                id: roomId,
                name: roomName,
                capacity: roomCapacity,
                type
            };

        });

        const room = updateRoom.immediate();

        return res.json({
            success: true,
            message: "แก้ไขข้อมูลห้องสำเร็จ",
            room
        });

    } catch (error) {

        if (error.statusCode) {

            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });

        }

        console.error("Edit room error:", error);

        return res.status(500).json({
            success: false,
            message: "ไม่สามารถแก้ไขข้อมูลห้องได้"
        });

    }

});


// ==========================================
// UPDATE ROOM STATUS - ADMIN ONLY
// ==========================================

router.patch("/:id/status", requireAdmin, (req, res) => {

    try {

        const roomId = req.params.id;
        const { isActive } = req.body || {};

        if (typeof isActive !== "boolean") {

            return res.status(400).json({
                success: false,
                message: "กรุณาระบุสถานะห้องให้ถูกต้อง"
            });

        }

        const result = db.prepare(`
            UPDATE rooms
            SET is_active = ?
            WHERE id = ?
        `).run(
            isActive ? 1 : 0,
            roomId
        );

        if (result.changes === 0) {

            return res.status(404).json({
                success: false,
                message: "ไม่พบห้องที่ต้องการแก้ไข"
            });

        }

        return res.json({
            success: true,
            message: isActive
                ? "เปิดใช้งานห้องสำเร็จ"
                : "ปิดใช้งานห้องสำเร็จ",
            roomId,
            isActive
        });

    } catch (error) {

        console.error("Update room status error:", error);

        return res.status(500).json({
            success: false,
            message: "ไม่สามารถเปลี่ยนสถานะห้องได้"
        });

    }

});


// ==========================================
// DELETE ROOM - ADMIN ONLY
// ลบได้เฉพาะห้องที่ไม่มีประวัติการจอง
// ==========================================

router.delete("/:id", requireAdmin, (req, res) => {

    try {

        const roomId = req.params.id;

        const deleteRoomTransaction = db.transaction(() => {

            const room = db.prepare(`
                SELECT id, name
                FROM rooms
                WHERE id = ?
            `).get(roomId);

            if (!room) {

                const error = new Error("ไม่พบห้องที่ต้องการลบ");
                error.statusCode = 404;
                throw error;

            }

            const bookingCount = db.prepare(`
                SELECT COUNT(*) AS total
                FROM bookings
                WHERE room_id = ?
            `).get(roomId).total;

            if (bookingCount > 0) {

                const error = new Error(
                    `ไม่สามารถลบห้อง "${room.name}" ได้ เนื่องจากมีประวัติการจอง ${bookingCount} รายการ กรุณาปิดใช้งานห้องแทน`
                );

                error.statusCode = 409;
                throw error;

            }

            db.prepare(`
                DELETE FROM rooms
                WHERE id = ?
            `).run(roomId);

            return room.name;

        });

        const deletedRoomName = deleteRoomTransaction.immediate();

        return res.json({
            success: true,
            message: `ลบห้อง ${deletedRoomName} สำเร็จ`,
            roomName: deletedRoomName
        });

    } catch (error) {

        if (error.statusCode) {

            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });

        }

        console.error("Delete room error:", error);

        return res.status(500).json({
            success: false,
            message: "ไม่สามารถลบห้องได้"
        });

    }

});


module.exports = router;
