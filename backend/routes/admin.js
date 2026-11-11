const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const db = require("../db");

const requireAdmin = require("../middleware/auth");

const backupDirectory = path.resolve(
    __dirname,
    "..",
    "backups"
);

const BACKUP_FILENAME_PATTERN =
    /^hybrid-reserve-\d{17}\.db$/;

let backupInProgress = false;


// ==========================================
// DATE: CURRENT DATE IN THAILAND
// ==========================================

function getBangkokDate() {

    const parts = new Intl.DateTimeFormat("en-CA", {

        timeZone: "Asia/Bangkok",

        year: "numeric",

        month: "2-digit",

        day: "2-digit"

    }).formatToParts(new Date());


    const values = Object.fromEntries(

        parts.map((part) => [
            part.type,
            part.value
        ])

    );


    return `${values.year}-${values.month}-${values.day}`;

}


// ==========================================
// ADMIN: DASHBOARD SUMMARY
// GET /api/admin/dashboard
// ==========================================

router.get("/dashboard", requireAdmin, (req, res) => {

    try {

        const today = getBangkokDate();


        const roomStats = db.prepare(`

            SELECT

                COUNT(*) AS total,

                COALESCE(
                    SUM(
                        CASE
                            WHEN is_active = 1 THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS active,

                COALESCE(
                    SUM(
                        CASE
                            WHEN is_active = 0 THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS inactive

            FROM rooms

        `).get();


        const bookingStats = db.prepare(`

            SELECT

                COUNT(*) AS total,

                COALESCE(
                    SUM(
                        CASE
                            WHEN status = 'confirmed' THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS confirmed,

                COALESCE(
                    SUM(
                        CASE
                            WHEN status = 'cancelled' THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS cancelled,

                COALESCE(
                    SUM(
                        CASE
                            WHEN date(created_at, '+7 hours') = ?
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS createdToday,

                COALESCE(
                    SUM(
                        CASE
                            WHEN substr(start_at, 1, 10) = ?
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS scheduledToday

            FROM bookings

        `).get(today, today);


        const recentBookings = db.prepare(`

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

            ORDER BY created_at DESC, id DESC

            LIMIT 5

        `).all();


        return res.json({

            success: true,

            timezone: "Asia/Bangkok",

            today,

            summary: {

                rooms: {

                    total: Number(roomStats.total),

                    active: Number(roomStats.active),

                    inactive: Number(roomStats.inactive)

                },

                bookings: {

                    total: Number(bookingStats.total),

                    confirmed: Number(bookingStats.confirmed),

                    cancelled: Number(bookingStats.cancelled),

                    createdToday: Number(bookingStats.createdToday),

                    scheduledToday: Number(bookingStats.scheduledToday)

                }

            },

            recentBookings

        });

    } catch (error) {

        console.error("Get admin dashboard error:", error);

        return res.status(500).json({

            success: false,

            message: "ไม่สามารถโหลดข้อมูล Dashboard ได้"

        });

    }

});


// ==========================================
// ADMIN: CREATE SQLITE ONLINE BACKUP
// POST /api/admin/backup
// ==========================================

router.post("/backup", requireAdmin, async (req, res) => {

    if (backupInProgress) {

        return res.status(409).json({

            success: false,

            message: "กำลังสำรองฐานข้อมูลอยู่ กรุณารอสักครู่แล้วลองใหม่"

        });

    }


    backupInProgress = true;

    let backupPath;

    let backupFileName;


    try {

        await fs.promises.mkdir(
            backupDirectory,
            { recursive: true }
        );


        const timestamp = new Date()
            .toISOString()
            .replace(/\D/g, "");


        backupFileName =
            `hybrid-reserve-${timestamp}.db`;


        backupPath = path.join(
            backupDirectory,
            backupFileName
        );


        // SQLite Online Backup API.
        // It creates a consistent standalone database
        // without copying the live WAL files.

        await db.backup(backupPath);


        const stat = await fs.promises.stat(backupPath);


        if (!stat.isFile() || stat.size <= 0) {

            throw new Error(
                "Backup file was not created correctly"
            );

        }


        return res.status(201).json({

            success: true,

            message: "สำรองฐานข้อมูลสำเร็จ",

            backup: {

                fileName: backupFileName,

                createdAt: stat.mtime.toISOString(),

                sizeBytes: stat.size

            }

        });


    } catch (error) {

        if (backupPath) {

            await fs.promises
                .unlink(backupPath)
                .catch(() => {});

        }


        console.error(
            "Create database backup error:",
            error
        );


        return res.status(500).json({

            success: false,

            message: "ไม่สามารถสำรองฐานข้อมูลได้"

        });


    } finally {

        backupInProgress = false;

    }

});


// ==========================================
// ADMIN: LIST AVAILABLE BACKUPS
// GET /api/admin/backups
// ==========================================

router.get("/backups", requireAdmin, async (req, res) => {

    try {

        const entries = await fs.promises.readdir(
            backupDirectory,
            {
                withFileTypes: true
            }
        ).catch(error => {

            if (error.code === "ENOENT") {
                return [];
            }

            throw error;

        });


        const files = entries.filter(entry => (

            entry.isFile() &&

            BACKUP_FILENAME_PATTERN.test(entry.name)

        ));


        const backups = await Promise.all(

            files.map(async entry => {

                const fullPath = path.join(
                    backupDirectory,
                    entry.name
                );

                const stat = await fs.promises.stat(fullPath);


                return {

                    fileName: entry.name,

                    createdAt: stat.mtime.toISOString(),

                    sizeBytes: stat.size

                };

            })

        );


        backups.sort((a, b) => (

            b.createdAt.localeCompare(a.createdAt)

        ));


        return res.json({

            success: true,

            total: backups.length,

            backups: backups.slice(0, 30)

        });


    } catch (error) {

        console.error(
            "List database backups error:",
            error
        );


        return res.status(500).json({

            success: false,

            message: "ไม่สามารถอ่านรายการสำรองฐานข้อมูลได้"

        });

    }

});


// ==========================================
// ADMIN: DOWNLOAD A BACKUP
// GET /api/admin/backups/:filename/download
// ==========================================

router.get(
    "/backups/:filename/download",
    requireAdmin,
    async (req, res) => {

        const fileName = req.params.filename;


        if (

            typeof fileName !== "string" ||

            !BACKUP_FILENAME_PATTERN.test(fileName) ||

            path.basename(fileName) !== fileName

        ) {

            return res.status(400).json({

                success: false,

                message: "ชื่อไฟล์สำรองไม่ถูกต้อง"

            });

        }


        const backupPath = path.join(
            backupDirectory,
            fileName
        );


        try {

            const stat = await fs.promises.stat(backupPath);


            if (!stat.isFile()) {

                return res.status(404).json({

                    success: false,

                    message: "ไม่พบไฟล์สำรองฐานข้อมูล"

                });

            }


            return res.download(
                backupPath,
                fileName,
                error => {

                    if (error) {

                        console.error(
                            "Download database backup error:",
                            error
                        );


                        if (!res.headersSent) {

                            res.status(500).json({

                                success: false,

                                message: "ไม่สามารถดาวน์โหลดไฟล์สำรองได้"

                            });

                        }

                    }

                }
            );


        } catch (error) {

            if (error.code === "ENOENT") {

                return res.status(404).json({

                    success: false,

                    message: "ไม่พบไฟล์สำรองฐานข้อมูล"

                });

            }


            console.error(
                "Read database backup error:",
                error
            );


            return res.status(500).json({

                success: false,

                message: "ไม่สามารถอ่านไฟล์สำรองได้"

            });

        }

    }
);


// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;