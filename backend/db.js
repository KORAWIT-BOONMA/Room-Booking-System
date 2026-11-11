const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");


// ==========================================
// DATABASE CONFIGURATION
// ==========================================

const dataDirectory = path.join(__dirname, "data");

if (!fs.existsSync(dataDirectory)) {

    fs.mkdirSync(dataDirectory, {
        recursive: true
    });

}

const databasePath = path.join(
    dataDirectory,
    "hybrid-reserve.db"
);

const db = new Database(databasePath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");


// ==========================================
// CREATE TABLES
// ==========================================

db.exec(`

    CREATE TABLE IF NOT EXISTS rooms (

        id TEXT PRIMARY KEY,

        name TEXT NOT NULL,

        capacity INTEGER NOT NULL
            CHECK (capacity > 0),

        type TEXT NOT NULL
            CHECK (
                type IN ('meeting', 'residence')
            ),

        is_active INTEGER NOT NULL DEFAULT 1,

        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

    );


    CREATE TABLE IF NOT EXISTS admins (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        username TEXT NOT NULL UNIQUE,

        password_hash TEXT NOT NULL,

        auth_version INTEGER NOT NULL DEFAULT 0,

        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

    );


    CREATE TABLE IF NOT EXISTS bookings (

        id TEXT PRIMARY KEY,

        booking_code TEXT NOT NULL UNIQUE,

        room_id TEXT NOT NULL,

        room_name TEXT NOT NULL,

        room_type TEXT NOT NULL,

        start_at TEXT NOT NULL,

        end_at TEXT NOT NULL,

        user_name TEXT NOT NULL,

        user_email TEXT NOT NULL,

        status TEXT NOT NULL DEFAULT 'confirmed'
            CHECK (
                status IN ('confirmed', 'cancelled')
            ),

        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        cancelled_at TEXT,

        CHECK (start_at < end_at),

        FOREIGN KEY (room_id)
            REFERENCES rooms(id)

    );


    CREATE INDEX IF NOT EXISTS idx_bookings_room_time

    ON bookings(room_id, start_at, end_at);


    CREATE INDEX IF NOT EXISTS idx_bookings_status

    ON bookings(status);


    CREATE INDEX IF NOT EXISTS idx_bookings_email

    ON bookings(user_email);

`);


// ==========================================
// ADMIN SESSION VERSION MIGRATION
// ==========================================

// ตรวจสอบก่อนว่าตาราง admins มี auth_version หรือยัง

const adminColumns = db.pragma("table_info(admins)");

if (
    !adminColumns.some(column => column.name === "auth_version")
) {

    db.exec(`

        ALTER TABLE admins

        ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0

    `);

}


// ==========================================
// DEFAULT ROOMS
// ==========================================

const defaultRooms = [

    {
        id: "h1",
        name: "Room A - Creative Lounge",
        capacity: 8,
        type: "meeting"
    },

    {
        id: "h2",
        name: "Room B - Executive Chamber",
        capacity: 20,
        type: "meeting"
    },

    {
        id: "n1",
        name: "Normal Room 101",
        capacity: 4,
        type: "residence"
    },

    {
        id: "n2",
        name: "Normal Room 102",
        capacity: 4,
        type: "residence"
    },

    {
        id: "n3",
        name: "Normal Room 103",
        capacity: 4,
        type: "residence"
    },

    {
        id: "n4",
        name: "Normal Room 104",
        capacity: 4,
        type: "residence"
    },

    {
        id: "n5",
        name: "Normal Room 105",
        capacity: 4,
        type: "residence"
    },

    {
        id: "s1",
        name: "Suite Room 201 (Luxury)",
        capacity: 2,
        type: "residence"
    },

    {
        id: "s2",
        name: "Suite Room 202 (Luxury)",
        capacity: 2,
        type: "residence"
    },

    {
        id: "s3",
        name: "Suite Room 203 (Luxury)",
        capacity: 2,
        type: "residence"
    },

    {
        id: "s4",
        name: "Suite Room 204 (Luxury)",
        capacity: 2,
        type: "residence"
    },

    {
        id: "s5",
        name: "Suite Room 205 (Luxury)",
        capacity: 2,
        type: "residence"
    }

];


// ==========================================
// SEED DEFAULT ROOMS
// ==========================================

const insertRoom = db.prepare(`

    INSERT OR IGNORE INTO rooms

    (id, name, capacity, type)

    VALUES (?, ?, ?, ?)

`);


const seedRooms = db.transaction(() => {

    for (const room of defaultRooms) {

        insertRoom.run(

            room.id,

            room.name,

            room.capacity,

            room.type

        );

    }

});

seedRooms();


// ==========================================
// EXPORT DATABASE
// ==========================================

module.exports = db;

console.log("SQLite database connected successfully.");