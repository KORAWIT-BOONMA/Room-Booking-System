
// ==========================================
// HYBRID RESERVE - JAVASCRIPT SYSTEM
// ==========================================

// DEFAULT ROOMS
const defaultRooms = [
    { id: "h1", name: "Room A - Creative Lounge", capacity: 8, type: "meeting" },
    { id: "h2", name: "Room B - Executive Chamber", capacity: 20, type: "meeting" },
    { id: "n1", name: "Normal Room 101", capacity: 4, type: "residence" },
    { id: "n2", name: "Normal Room 102", capacity: 4, type: "residence" },
    { id: "n3", name: "Normal Room 103", capacity: 4, type: "residence" },
    { id: "n4", name: "Normal Room 104", capacity: 4, type: "residence" },
    { id: "n5", name: "Normal Room 105", capacity: 4, type: "residence" },
    { id: "s1", name: "Suite Room 201 (Luxury)", capacity: 2, type: "residence" },
    { id: "s2", name: "Suite Room 202 (Luxury)", capacity: 2, type: "residence" },
    { id: "s3", name: "Suite Room 203 (Luxury)", capacity: 2, type: "residence" },
    { id: "s4", name: "Suite Room 204 (Luxury)", capacity: 2, type: "residence" },
    { id: "s5", name: "Suite Room 205 (Luxury)", capacity: 2, type: "residence" }
];


// ==========================================
// LOAD AND SAVE STORAGE
// ==========================================

function loadStorage(key, fallback) {
    try {
        const saved = localStorage.getItem(key);

        if (saved === null) return fallback;

        const parsed = JSON.parse(saved);

        return Array.isArray(parsed) ? parsed : fallback;

    } catch (error) {
        console.error(`อ่านข้อมูล ${key} ไม่สำเร็จ:`, error);
        return fallback;
    }
}

let rooms = loadStorage("h_rooms", [...defaultRooms]);
let bookings = loadStorage("h_bookings", []);


function syncStorage() {
    try {
        localStorage.setItem("h_rooms", JSON.stringify(rooms));
        localStorage.setItem("h_bookings", JSON.stringify(bookings));

    } catch (error) {
        console.error("บันทึกข้อมูลไม่สำเร็จ:", error);
        alert("ไม่สามารถบันทึกข้อมูลใน Browser ได้");
    }
}


// ==========================================
// HTML SECURITY HELPER
// ==========================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}


// ==========================================
// TAB NAVIGATION
// ==========================================

function switchTab(tab) {

    ["tab-book", "tab-my-booking", "tab-admin"].forEach(id => {
        document.getElementById(id).classList.add("hidden");
    });

    document.getElementById(`tab-${tab}`).classList.remove("hidden");

    ["book", "my-booking", "admin"].forEach(name => {

        const button = document.getElementById(`btn-tab-${name}`);

        button.className = name === tab
            ? "px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white transition"
            : "px-4 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-white transition";
    });
}


// ==========================================
// DATE AND TIME FUNCTIONS
// ==========================================

// แปลงวันเวลาเป็นรูปแบบที่เรียงเปรียบเทียบได้
// ตัวอย่าง 2026-11-09T09:00

function dateTimeKey(date, time) {

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
        return null;
    }

    if (!/^\d{2}:\d{2}$/.test(time || "")) {
        return null;
    }

    const parsed = new Date(`${date}T${time}:00`);

    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return `${date}T${time}`;
}


// ดึงช่วงเวลาเริ่มต้นและสิ้นสุดของรายการจอง
function bookingRange(booking) {

    const startDate = booking.startDate || booking.date;
    const endDate = booking.endDate || booking.date;

    const start = dateTimeKey(startDate, booking.startTime);
    const end = dateTimeKey(endDate, booking.endTime);

    if (!start || !end || start >= end) {
        return null;
    }

    return { start, end };
}


// แสดงวันที่ภาษาไทย
function formatThaiDate(dateStr) {

    if (!dateStr) return "-";

    const date = new Date(`${dateStr}T12:00:00`);

    if (Number.isNaN(date.getTime())) {
        return dateStr;
    }

    return date.toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}


// ==========================================
// BOOKING CONFLICT CHECK
// ตรวจสอบการจองซ้ำและเวลาทับซ้อน
// ==========================================

function checkBookingConflict(
    roomId,
    startKey,
    endKey,
    ignoreBookingId = null
) {

    return bookings.find(existing => {

        // ตรวจสอบเฉพาะห้องเดียวกัน
        if (
            existing.roomId !== roomId ||
            existing.id === ignoreBookingId
        ) {
            return false;
        }

        const range = bookingRange(existing);

        if (!range) {
            console.warn(
                "ข้ามข้อมูลการจองเก่าที่วันเวลาผิดรูปแบบ:",
                existing
            );

            return false;
        }

        // ตรวจสอบเวลาทับซ้อน
        return startKey < range.end && endKey > range.start;

    }) || null;
}


// ==========================================
// HANDLE NEW BOOKING
// ==========================================

function handleBooking(event) {

    event.preventDefault();

    const roomId = document.getElementById("book-room").value;

    const startDate = document.getElementById("book-start-date").value;
    const startTime = document.getElementById("book-start-time").value;

    const endDate = document.getElementById("book-end-date").value;
    const endTime = document.getElementById("book-end-time").value;

    const userName = document.getElementById("book-name").value.trim();

    const userEmail = document.getElementById("book-email")
        .value.trim().toLowerCase();


    const startKey = dateTimeKey(startDate, startTime);
    const endKey = dateTimeKey(endDate, endTime);


    // ตรวจสอบวันที่และเวลา
    if (!startKey || !endKey || startKey >= endKey) {

        alert(
            "วันและเวลาสิ้นสุดต้องอยู่หลังจากวันเวลาเริ่มต้น กรุณาตรวจสอบอีกครั้ง"
        );

        return;
    }


    // ตรวจสอบห้อง
    const targetRoom = rooms.find(room => room.id === roomId);

    if (!targetRoom) {

        alert("ไม่พบห้องที่เลือก กรุณาเลือกห้องใหม่");

        return;
    }


    // ตรวจสอบการจองซ้ำ
    const conflict = checkBookingConflict(
        roomId,
        startKey,
        endKey
    );


    if (conflict) {

        const oldStartDate = conflict.startDate || conflict.date;
        const oldEndDate = conflict.endDate || conflict.date;

        alert(
            `ไม่สามารถจองได้ เนื่องจากห้องนี้มีรายการจองทับซ้อน\n\n` +
            `ผู้จอง: ${conflict.userName || "ไม่ระบุชื่อ"}\n` +
            `เข้า: ${formatThaiDate(oldStartDate)} เวลา ${conflict.startTime}\n` +
            `ออก: ${formatThaiDate(oldEndDate)} เวลา ${conflict.endTime}\n\n` +
            "กรุณาเลือกช่วงเวลาอื่นหรือเลือกห้องอื่น"
        );

        return;
    }


    // สร้างรายการจองใหม่
    const newBooking = {

        id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,

        roomId: roomId,
        roomName: targetRoom.name,
        roomType: targetRoom.type,

        startDate: startDate,
        startTime: startTime,

        endDate: endDate,
        endTime: endTime,

        userName: userName,
        userEmail: userEmail
    };


    bookings.push(newBooking);

    syncStorage();

    alert(
        `จอง ${targetRoom.name} สำเร็จแล้ว คุณ ${userName}`
    );

    document.getElementById("booking-form").reset();

    renderAdminTable();
}


// ==========================================
// SEARCH MY BOOKINGS
// ==========================================

function searchMyBookings() {

    const email = document.getElementById("search-email")
        .value.trim().toLowerCase();

    const resultArea = document.getElementById("my-booking-results");


    if (!email) {

        alert("กรุณาระบุอีเมลเพื่อค้นหาประวัติการจอง");

        return;
    }


    const myBookings = bookings.filter(item =>
        (item.userEmail || "").toLowerCase() === email
    );

    resultArea.replaceChildren();


    if (myBookings.length === 0) {

        resultArea.innerHTML = `
            <p class="text-slate-400 text-sm text-center col-span-2 py-6">
                ไม่พบประวัติการจองภายใต้อีเมล ${escapeHTML(email)}
            </p>
        `;

        return;
    }


    myBookings.forEach(booking => {

        const startDate = booking.startDate || booking.date;
        const endDate = booking.endDate || booking.date;

        const isMeeting = booking.roomType === "meeting";


        const card = document.createElement("div");

        card.className =
            "bg-slate-950 p-4 rounded-xl border border-slate-700 flex justify-between items-center font-mono";


        card.innerHTML = `
            <div class="space-y-1">

                <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800 ${isMeeting ? "text-indigo-400" : "text-emerald-400"}">
                    ${isMeeting ? "ห้องประชุม" : "ห้องพัก/คอนโด"}
                </span>

                <h4 class="text-sm font-bold text-slate-200 mt-1">
                    ${escapeHTML(booking.roomName)}
                </h4>

                <p class="text-xs text-slate-300">
                    เข้า: ${formatThaiDate(startDate)}
                    (${escapeHTML(booking.startTime)} น.)
                </p>

                <p class="text-xs text-slate-400">
                    ออก: ${formatThaiDate(endDate)}
                    (${escapeHTML(booking.endTime)} น.)
                </p>

            </div>

            <button type="button"
                class="cancel-booking bg-red-950 hover:bg-red-900 border border-red-700 text-red-200 text-xs py-1.5 px-3 rounded-lg transition h-fit">
                ยกเลิก
            </button>
        `;


        card.querySelector(".cancel-booking")
            .addEventListener("click", () => cancelBooking(booking.id));


        resultArea.appendChild(card);
    });
}


// ==========================================
// CANCEL BOOKING
// ==========================================

function cancelBooking(bookingId) {

    if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการยกเลิกรายการจองนี้?")) {
        return;
    }

    bookings = bookings.filter(item => item.id !== bookingId);

    syncStorage();

    alert("ยกเลิกการจองสำเร็จแล้ว");

    searchMyBookings();

    renderAdminTable();
}


// ==========================================
// ADMIN LOGIN
// ==========================================

function unlockAdmin() {

    const password = document.getElementById("admin-pass").value;

    // รหัสผ่านนี้มีไว้ทดสอบเท่านั้น
    if (password === "admin1234") {

        document.getElementById("admin-gate").classList.add("hidden");

        const adminContent = document.getElementById("admin-content");

        adminContent.classList.remove("hidden");
        adminContent.classList.add("grid");

        renderAdminTable();

    } else {

        alert("รหัสผ่านไม่ถูกต้อง");

    }
}


// ==========================================
// ADD NEW ROOM
// ==========================================

function addNewRoom() {

    const type = document.getElementById("new-room-type").value;

    const name = document.getElementById("new-room-name")
        .value.trim();

    const capacity = Number.parseInt(
        document.getElementById("new-room-cap").value,
        10
    );


    if (!name || !Number.isInteger(capacity) || capacity < 1) {

        alert("กรุณากรอกชื่อห้องและความจุอย่างน้อย 1 คน");

        return;
    }


    rooms.push({

        id: `rm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,

        name: name,

        capacity: capacity,

        type: type

    });


    syncStorage();

    document.getElementById("new-room-name").value = "";

    document.getElementById("new-room-cap").value = "";

    initRoomUI();

    alert(`สร้างพื้นที่ ${name} สำเร็จแล้ว`);
}


// ==========================================
// ADMIN DELETE BOOKING
// ==========================================

function deleteBookingByAdmin(id) {

    if (!confirm("ยืนยันการลบรายการจองนี้หรือไม่?")) {
        return;
    }

    bookings = bookings.filter(item => item.id !== id);

    syncStorage();

    renderAdminTable();
}


// ==========================================
// CLEAR ALL DATA
// ==========================================

function clearAllData() {

    if (!confirm("ต้องการล้างข้อมูลห้องและรายการจองทั้งหมดกลับสู่ค่าเริ่มต้นใช่หรือไม่?")) {
        return;
    }

    rooms = [...defaultRooms];

    bookings = [];

    syncStorage();

    initRoomUI();

    renderAdminTable();

    alert("ล้างข้อมูลเรียบร้อยแล้ว");
}


// ==========================================
// INITIALIZE ROOM UI
// ==========================================

function initRoomUI() {

    const select = document.getElementById("book-room");

    const badgeList = document.getElementById("room-badge-list");

    select.replaceChildren();

    badgeList.replaceChildren();


    rooms.forEach(room => {

        const isMeeting = room.type === "meeting";


        // เพิ่มห้องลงใน Dropdown
        const option = document.createElement("option");

        option.value = room.id;

        option.textContent =
            `[${isMeeting ? "ห้องประชุม" : "ที่พัก"}] ${room.name} (สูงสุด ${room.capacity} คน)`;

        select.appendChild(option);


        // สร้างรายการห้องทางด้านขวา
        const badge = document.createElement("div");

        badge.className =
            `p-3 rounded-xl border ${isMeeting ? "border-indigo-500/30" : "border-emerald-500/30"} bg-slate-950 flex items-center justify-between text-sm shadow-sm`;


        badge.innerHTML = `

            <div class="flex items-center gap-2.5">

                <i class="fa-solid ${isMeeting ? "fa-briefcase text-indigo-400" : "fa-bed text-emerald-400"}"></i>

                <span class="font-medium text-slate-200">
                    ${escapeHTML(room.name)}
                </span>

            </div>

            <span class="text-[11px] px-2 py-0.5 rounded border ${isMeeting ? "bg-indigo-950 text-indigo-300 border-indigo-800/40" : "bg-emerald-950 text-emerald-300 border-emerald-800/40"}">
                ${room.capacity} คน
            </span>

        `;


        badgeList.appendChild(badge);

    });
}


// ==========================================
// RENDER ADMIN BOOKING TABLE
// ==========================================

function renderAdminTable() {

    const tbody = document.getElementById("admin-booking-table");

    tbody.replaceChildren();


    if (bookings.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="4"
                    class="text-center p-6 text-slate-500 text-sm">
                    ยังไม่มีข้อมูลการจองในระบบ
                </td>
            </tr>
        `;

        return;
    }


    bookings.forEach(booking => {

        const startDate = booking.startDate || booking.date;

        const endDate = booking.endDate || booking.date;

        const isMeeting = booking.roomType === "meeting";


        const row = document.createElement("tr");

        row.className =
            "hover:bg-slate-700/30 transition text-slate-300 font-mono";


        row.innerHTML = `

            <td class="p-3 text-sm font-sans text-slate-200">

                <div class="flex items-center gap-1">

                    <span class="text-[10px] px-1.5 py-0.5 rounded ${isMeeting ? "bg-indigo-950 text-indigo-400" : "bg-emerald-950 text-emerald-400"}">
                        ${isMeeting ? "ประชุม" : "ที่พัก"}
                    </span>

                    <span>${escapeHTML(booking.roomName)}</span>

                </div>

            </td>


            <td class="p-3 text-xs space-y-1">

                <span class="block text-slate-400">
                    เข้า:
                    <b class="text-slate-200">${escapeHTML(startDate)}</b>
                    เวลา
                    <b class="text-indigo-400">${escapeHTML(booking.startTime)} น.</b>
                </span>

                <span class="block text-slate-400">
                    ออก:
                    <b class="text-slate-200">${escapeHTML(endDate)}</b>
                    เวลา
                    <b class="text-emerald-400">${escapeHTML(booking.endTime)} น.</b>
                </span>

            </td>


            <td class="p-3 text-xs">

                <span class="block text-slate-100 font-sans font-semibold">
                    ${escapeHTML(booking.userName)}
                </span>

                <span class="text-slate-400">
                    ${escapeHTML(booking.userEmail)}
                </span>

            </td>


            <td class="p-3 text-center">

                <button type="button"
                    class="delete-booking text-red-400 hover:text-red-300 text-sm p-1">
                    ลบ
                </button>

            </td>

        `;


        row.querySelector(".delete-booking")
            .addEventListener("click", () => deleteBookingByAdmin(booking.id));


        tbody.appendChild(row);

    });
}


// ==========================================
// START SYSTEM
// ==========================================

initRoomUI();

renderAdminTable();

