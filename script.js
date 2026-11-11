// ==========================================
// HYBRID RESERVE - DATABASE VERSION
// Frontend: Express API + SQLite
// ==========================================

const API_BASE = "/api";

let rooms = [];
let adminBookings = [];
let adminRooms = [];
let adminDashboard = null;


// ==========================================
// HTML SECURITY
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
// API REQUEST HELPER
// ==========================================

async function apiRequest(endpoint, options = {}, authenticated = false) {

    const headers = {
        Accept: "application/json",
        ...(options.headers || {})
    };

    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    if (authenticated) {

        const token = sessionStorage.getItem("hybrid_admin_token");

        if (!token) {
            const error = new Error("กรุณาเข้าสู่ระบบ Admin");
            error.status = 401;
            throw error;
        }

        headers.Authorization = `Bearer ${token}`;

    }

    let response;

    try {

        response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

    } catch (error) {

        const networkError = new Error(
            "ไม่สามารถเชื่อมต่อ Server ได้ กรุณาตรวจสอบ Backend"
        );

        networkError.cause = error;
        throw networkError;

    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {

        const error = new Error(
            data?.message || `เกิดข้อผิดพลาด HTTP ${response.status}`
        );

        error.status = response.status;
        error.data = data;

        throw error;

    }

    return data;

}


// ==========================================
// DATE / TIME FUNCTIONS
// ==========================================

function dateTimeKey(date, time) {

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date || "") ||
        !/^\d{2}:\d{2}$/.test(time || "")
    ) {
        return null;
    }

    const parsed = new Date(`${date}T${time}:00`);

    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return `${date}T${time}`;

}


function splitDateTime(value) {

    if (typeof value !== "string" || !value.includes("T")) {
        return {
            date: "",
            time: ""
        };
    }

    const [date, time] = value.split("T");

    return {
        date,
        time: (time || "").slice(0, 5)
    };

}


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


function statusLabel(status) {

    return status === "cancelled"
        ? "ยกเลิกแล้ว"
        : "จองสำเร็จ";

}


function formatThaiDateTime(value) {

    if (!value || typeof value !== "string") return "-";

    const normalized = value.replace("T", " ");
    const [datePart, timePart] = normalized.split(/\s+/, 2);
    const dateLabel = formatThaiDate(datePart);

    if (!timePart) return dateLabel;

    return `${dateLabel} เวลา ${timePart.slice(0, 8)} น.`;

}


// ==========================================
// ADMIN: LOAD DASHBOARD SUMMARY
// ==========================================

async function loadAdminDashboard() {

    const button = document.getElementById("refresh-dashboard-btn");
    const status = document.getElementById("dashboard-refresh-status");
    const recentBody = document.getElementById("admin-dashboard-recent");
    const originalHTML = button?.innerHTML;

    if (button) {
        button.disabled = true;
        button.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin mr-1"></i>
            กำลังโหลด...
        `;
    }

    if (status) {
        status.textContent = "กำลังดึงข้อมูลจากฐานข้อมูล...";
        status.className = "text-[11px] text-indigo-400";
    }

    try {

        const data = await apiRequest(
            `/admin/dashboard?refresh=${Date.now()}`,
            {
                method: "GET",
                cache: "no-store"
            },
            true
        );

        if (!data?.success || !data.summary) {
            throw new Error("รูปแบบข้อมูล Dashboard จาก Server ไม่ถูกต้อง");
        }

        adminDashboard = data;
        renderAdminDashboard();

        if (status) {
            const time = new Date().toLocaleTimeString("th-TH", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            });
            status.textContent = `อัปเดตสำเร็จ ${time} · ${data.timezone || "เวลาระบบ"}`;
            status.className = "text-[11px] text-emerald-400";
        }

        return true;

    } catch (error) {

        console.error("Load dashboard error:", error);

        if (error.status === 401) {
            handleAdminError(error);
            return false;
        }

        if (recentBody) {
            recentBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center p-5 text-red-400 text-xs">
                        ${escapeHTML(error.message || "โหลดข้อมูล Dashboard ไม่สำเร็จ")}
                    </td>
                </tr>
            `;
        }

        if (status) {
            status.textContent = "โหลดข้อมูลไม่สำเร็จ · กดรีเฟรชเพื่อลองอีกครั้ง";
            status.className = "text-[11px] text-red-400";
        }

        return false;

    } finally {

        if (button) {
            button.disabled = false;
            button.innerHTML = originalHTML ||
                '<i class="fa-solid fa-rotate mr-1"></i> รีเฟรช Dashboard';
        }

    }

}


// ==========================================
// ADMIN: RENDER DASHBOARD
// ==========================================

function renderAdminDashboard() {

    if (!adminDashboard?.summary) return;

    const summary = adminDashboard.summary;
    const roomSummary = summary.rooms || {};
    const bookingSummary = summary.bookings || {};

    const values = {
        "dashboard-room-total": roomSummary.total,
        "dashboard-room-active": roomSummary.active,
        "dashboard-room-inactive": roomSummary.inactive,
        "dashboard-booking-total": bookingSummary.total,
        "dashboard-booking-confirmed": bookingSummary.confirmed,
        "dashboard-booking-cancelled": bookingSummary.cancelled,
        "dashboard-created-today": bookingSummary.createdToday,
        "dashboard-scheduled-today": bookingSummary.scheduledToday
    };

    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            const number = Number(value);
            element.textContent = Number.isFinite(number) ? number.toLocaleString("th-TH") : "0";
        }
    });

    const tbody = document.getElementById("admin-dashboard-recent");
    if (!tbody) return;

    const bookings = Array.isArray(adminDashboard.recentBookings)
        ? adminDashboard.recentBookings
        : [];

    tbody.replaceChildren();

    if (bookings.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center p-5 text-slate-500 text-xs">
                    ยังไม่มีรายการจองในระบบ
                </td>
            </tr>
        `;
        return;
    }

    bookings.forEach(booking => {

        const start = splitDateTime(booking.startAt);
        const isCancelled = booking.status === "cancelled";
        const row = document.createElement("tr");
        row.className = "hover:bg-slate-700/30 transition text-xs";

        row.innerHTML = `
            <td class="p-3 min-w-[170px]">
                <span class="block font-semibold text-indigo-300">
                    ${escapeHTML(booking.bookingCode || "-")}
                </span>
                <span class="block text-slate-400 mt-1">
                    ${escapeHTML(booking.roomName || "-")}
                </span>
            </td>
            <td class="p-3 min-w-[150px]">
                <span class="block text-slate-200">${escapeHTML(booking.userName || "-")}</span>
                <span class="block text-slate-500 mt-1 break-all">${escapeHTML(booking.userEmail || "-")}</span>
            </td>
            <td class="p-3 whitespace-nowrap text-slate-300">
                ${escapeHTML(formatThaiDate(start.date))}
                <span class="block text-slate-500 mt-1">${escapeHTML(start.time || "-")} น.</span>
            </td>
            <td class="p-3 text-center whitespace-nowrap">
                <span class="inline-block px-2 py-1 rounded-lg border text-[11px] ${
                    isCancelled
                        ? "bg-red-950/70 text-red-300 border-red-800/60"
                        : "bg-emerald-950/70 text-emerald-300 border-emerald-800/60"
                }">
                    ${escapeHTML(statusLabel(booking.status))}
                </span>
            </td>
        `;

        tbody.appendChild(row);

    });

}


// ==========================================
// ADMIN: CHANGE PASSWORD
// ==========================================

async function changeAdminPassword(event) {

    event.preventDefault();

    const currentPassword = document.getElementById("admin-current-password")?.value || "";
    const newPassword = document.getElementById("admin-new-password")?.value || "";
    const confirmPassword = document.getElementById("admin-confirm-password")?.value || "";
    const button = document.getElementById("change-admin-password-btn");
    const form = document.getElementById("admin-password-form");

    if (!currentPassword || !newPassword || !confirmPassword) {
        alert("กรุณากรอกรหัสผ่านให้ครบทุกช่อง");
        return;
    }

    if (newPassword.length < 12) {
        alert("รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 12 ตัวอักษร");
        return;
    }

    if (new TextEncoder().encode(newPassword).length > 72) {
        alert("รหัสผ่านใหม่ยาวเกินกำหนด สูงสุด 72 ไบต์");
        return;
    }

    if (newPassword !== confirmPassword) {
        alert("รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน");
        return;
    }

    if (newPassword === currentPassword) {
        alert("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน");
        return;
    }

    const originalHTML = button?.innerHTML;

    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> กำลังเปลี่ยนรหัสผ่าน...';
    }

    try {

        const data = await apiRequest("/auth/password", {
            method: "PATCH",
            body: JSON.stringify({
                currentPassword,
                newPassword,
                confirmPassword
            })
        }, true);

        form?.reset();

        alert(data.message || "เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่");

        // The server increments auth_version, so every old token is invalid now.
        clearAdminSession();
        switchTab("admin");

    } catch (error) {

        console.error("Change admin password error:", error);
        if (error.status === 401) {
            handleAdminError(error);
        } else {
            alert(error.message || "ไม่สามารถเปลี่ยนรหัสผ่านได้");
        }

    } finally {

        if (button) {
            button.disabled = false;
            button.innerHTML = originalHTML || '<i class="fa-solid fa-key mr-1"></i> เปลี่ยนรหัสผ่าน Admin';
        }

    }

}


// ==========================================
// ADMIN: DATABASE BACKUP LIST
// ==========================================

function formatFileSize(bytes) {

    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return "0 Bytes";
    if (value < 1024) return `${value} Bytes`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;

}


function renderDatabaseBackups(backups = []) {

    const container = document.getElementById("admin-backup-list");
    if (!container) return;

    container.replaceChildren();

    if (!Array.isArray(backups) || backups.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-500 text-center py-3">ยังไม่มีไฟล์สำรองฐานข้อมูล</p>';
        return;
    }

    backups.forEach(backup => {

        const item = document.createElement("div");
        item.className = "flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950 border border-slate-700 rounded-lg p-3";

        const created = backup.createdAt
            ? new Date(backup.createdAt).toLocaleString("th-TH")
            : "ไม่ทราบวันที่";

        item.innerHTML = `
            <div class="min-w-0">
                <p class="text-xs text-slate-200 font-medium break-all">${escapeHTML(backup.fileName)}</p>
                <p class="text-[10px] text-slate-500 mt-1">${escapeHTML(created)} · ${escapeHTML(formatFileSize(backup.sizeBytes))}</p>
            </div>
            <button type="button" class="download-database-backup shrink-0 text-xs bg-slate-700 hover:bg-slate-600 text-sky-300 px-3 py-2 rounded-lg transition">
                <i class="fa-solid fa-download mr-1"></i> ดาวน์โหลด
            </button>
        `;

        item.querySelector(".download-database-backup")?.addEventListener("click", () => {
            downloadDatabaseBackup(backup.fileName);
        });

        container.appendChild(item);

    });

}


async function loadDatabaseBackups() {

    const container = document.getElementById("admin-backup-list");
    if (!container || !sessionStorage.getItem("hybrid_admin_token")) return false;

    try {

        const data = await apiRequest("/admin/backups", {
            method: "GET",
            cache: "no-store"
        }, true);

        renderDatabaseBackups(data.backups || []);
        return true;

    } catch (error) {

        console.error("Load database backups error:", error);

        if (error.status === 401) {
            handleAdminError(error);
        } else {
            container.innerHTML = `<p class="text-xs text-red-400 text-center py-3">${escapeHTML(error.message || "โหลดรายการไฟล์สำรองไม่สำเร็จ")}</p>`;
        }

        return false;

    }

}


// ==========================================
// ADMIN: CREATE DATABASE BACKUP
// ==========================================

async function createDatabaseBackup() {

    const button = document.getElementById("create-database-backup-btn");
    const status = document.getElementById("database-backup-status");
    const originalHTML = button?.innerHTML;

    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> กำลังสำรองฐานข้อมูล...';
    }

    if (status) {
        status.textContent = "กำลังสร้างไฟล์สำรองจาก SQLite...";
        status.className = "text-[11px] text-sky-300";
    }

    try {

        const data = await apiRequest("/admin/backup", {
            method: "POST"
        }, true);

        if (!data?.success || !data.backup?.fileName) {
            throw new Error("Server ไม่ได้ส่งข้อมูลไฟล์สำรองกลับมา");
        }

        if (status) {
            status.textContent = `สำรองสำเร็จ: ${data.backup.fileName} · ${formatFileSize(data.backup.sizeBytes)}`;
            status.className = "text-[11px] text-emerald-400 break-all";
        }

        await loadDatabaseBackups();

    } catch (error) {

        console.error("Create database backup error:", error);

        if (status) {
            status.textContent = error.message || "สำรองฐานข้อมูลไม่สำเร็จ";
            status.className = "text-[11px] text-red-400";
        }

        if (error.status === 401) {
            handleAdminError(error);
        }

    } finally {

        if (button) {
            button.disabled = false;
            button.innerHTML = originalHTML || '<i class="fa-solid fa-cloud-arrow-down mr-1"></i> สำรองฐานข้อมูลตอนนี้';
        }

    }

}


// ==========================================
// ADMIN: DOWNLOAD DATABASE BACKUP
// ==========================================

async function downloadDatabaseBackup(fileName) {

    const token = sessionStorage.getItem("hybrid_admin_token");

    if (!token) {
        alert("กรุณาเข้าสู่ระบบ Admin ใหม่");
        return;
    }

    try {

        const response = await fetch(
            `${API_BASE}/admin/backups/${encodeURIComponent(fileName)}/download`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        if (!response.ok) {
            const data = await response.json().catch(() => null);
            const error = new Error(data?.message || `ดาวน์โหลดไม่สำเร็จ HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    } catch (error) {

        console.error("Download backup error:", error);

        if (error.status === 401) {
            handleAdminError(error);
        } else {
            alert(error.message || "ไม่สามารถดาวน์โหลดไฟล์สำรองได้");
        }

    }

}


// ==========================================
// TAB NAVIGATION
// ==========================================

function switchTab(tab) {

    ["tab-book", "tab-my-booking", "tab-admin"].forEach(id => {

        const section = document.getElementById(id);

        if (section) {
            section.classList.add("hidden");
        }

    });

    const target = document.getElementById(`tab-${tab}`);

    if (target) {
        target.classList.remove("hidden");
    }

    ["book", "my-booking", "admin"].forEach(name => {

        const button = document.getElementById(`btn-tab-${name}`);

        if (!button) return;

        button.className = name === tab
            ? "px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white transition"
            : "px-4 py-2 text-sm font-medium rounded-lg text-slate-400 hover:text-white transition";

    });

}


// ==========================================
// ADMIN SESSION
// ==========================================

function clearAdminSession() {

    sessionStorage.removeItem("hybrid_admin_token");
    sessionStorage.removeItem("hybrid_admin_username");

    const gate = document.getElementById("admin-gate");
    const content = document.getElementById("admin-content");

    if (gate) {
        gate.classList.remove("hidden");
    }

    if (content) {
        content.classList.add("hidden");
        content.classList.remove("grid");
    }

    const usernameInput = document.getElementById("admin-username");
    const passwordInput = document.getElementById("admin-pass");

    if (usernameInput) usernameInput.value = "";
    if (passwordInput) passwordInput.value = "";

    const sessionName = document.getElementById("admin-session-name");

    if (sessionName) {
        sessionName.textContent = "ผู้ดูแลระบบ";
    }

    adminBookings = [];
    adminRooms = [];
    adminDashboard = null;
    renderDatabaseBackups([]);
    document.getElementById("admin-password-form")?.reset();

    const backupStatus = document.getElementById("database-backup-status");
    if (backupStatus) {
        backupStatus.textContent = "ยังไม่มีการสำรองใน Session นี้";
        backupStatus.className = "text-[11px] text-slate-400";
    }

    resetAdminBookingFilters();
    renderAdminDashboard();
    renderAdminRooms();

    const refreshStatus = document.getElementById(
        "admin-room-refresh-status"
    );

    if (refreshStatus) {
        refreshStatus.textContent = "";
    }

    closeEditRoom();
    closeBookingDetail();

}


// ==========================================
// SHOW ADMIN CONTENT
// ==========================================

function showAdminContent(username) {

    const gate = document.getElementById("admin-gate");
    const content = document.getElementById("admin-content");

    if (gate) {
        gate.classList.add("hidden");
    }

    if (content) {
        content.classList.remove("hidden");
        content.classList.add("grid");

        content.setAttribute(
            "title",
            `ผู้ดูแลระบบ: ${username || "Admin"}`
        );
    }

    const sessionName = document.getElementById("admin-session-name");

    if (sessionName) {
        sessionName.textContent = username || "Admin";
    }

}


// ==========================================
// ADMIN LOGOUT
// ==========================================

function logoutAdmin() {

    const confirmed = confirm(
        "ต้องการออกจากระบบ Admin หรือไม่?"
    );

    if (!confirmed) return;

    clearAdminSession();

    switchTab("admin");

    alert("ออกจากระบบ Admin เรียบร้อยแล้ว");

}


// ==========================================
// ADMIN ERROR HANDLER
// ==========================================

function handleAdminError(error) {

    console.error("Admin API Error:", error);

    if (error.status === 401) {

        clearAdminSession();

        alert(
            "Session หมดอายุหรือไม่มีสิทธิ์ Admin กรุณาเข้าสู่ระบบใหม่"
        );

        return;

    }

    alert(error.message || "เกิดข้อผิดพลาดในการจัดการระบบ");

}


// ==========================================
// ADMIN LOGIN
// ==========================================

async function unlockAdmin() {

    const usernameInput = document.getElementById("admin-username");
    const passwordInput = document.getElementById("admin-pass");
    const loginButton = document.getElementById("admin-login-button");

    if (!usernameInput || !passwordInput || !loginButton) {
        alert("ไม่พบช่อง Username หรือ Password");
        return;
    }

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
        alert("กรุณากรอก Username และ Password");
        return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "กำลังตรวจสอบ...";

    try {

        const data = await apiRequest("/auth/login", {
            method: "POST",
            body: JSON.stringify({
                username,
                password
            })
        });

        if (!data.accessToken || !data.admin) {
            throw new Error("ไม่ได้รับข้อมูล Session จาก Server");
        }

        sessionStorage.setItem(
            "hybrid_admin_token",
            data.accessToken
        );

        sessionStorage.setItem(
            "hybrid_admin_username",
            data.admin.username
        );

        passwordInput.value = "";

        showAdminContent(data.admin.username);

        alert(`เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ${data.admin.username}`);

        await Promise.all([
            loadAdminDashboard(),
            loadAdminBookings(),
            loadAdminRooms(),
            loadDatabaseBackups()
        ]);

    } catch (error) {

        console.error("Login Error:", error);

        alert(error.message || "ไม่สามารถเข้าสู่ระบบได้");

    } finally {

        loginButton.disabled = false;
        loginButton.textContent = "เข้าสู่แผงควบคุม";

    }

}


// ==========================================
// RESTORE ADMIN SESSION
// ==========================================

async function restoreAdminSession() {

    const token = sessionStorage.getItem("hybrid_admin_token");

    if (!token) {
        clearAdminSession();
        return;
    }

    try {

        const data = await apiRequest(
            "/auth/me",
            { method: "GET" },
            true
        );

        showAdminContent(data.admin?.username);

        await Promise.all([
            loadAdminDashboard(),
            loadAdminBookings(),
            loadAdminRooms(),
            loadDatabaseBackups()
        ]);

    } catch (error) {

        console.error("Restore session error:", error);

        if (error.status === 401) {
            clearAdminSession();
        } else {
            alert(error.message || "ไม่สามารถตรวจสอบ Session ได้");
        }

    }

}


// ==========================================
// LOAD ACTIVE ROOMS
// ==========================================

async function loadRooms() {

    try {

        const data = await apiRequest("/rooms");

        rooms = Array.isArray(data.rooms)
            ? data.rooms
            : [];

        initRoomUI();

        return true;

    } catch (error) {

        console.error("Load rooms error:", error);

        rooms = [];

        initRoomUI();

        alert(error.message || "ไม่สามารถโหลดข้อมูลห้องได้");

        return false;

    }

}


// ==========================================
// INITIALIZE ROOM UI
// ==========================================

function initRoomUI() {

    const select = document.getElementById("book-room");
    const badgeList = document.getElementById("room-badge-list");

    if (!select || !badgeList) return;

    select.replaceChildren();
    badgeList.replaceChildren();

    if (rooms.length === 0) {

        const option = document.createElement("option");

        option.value = "";
        option.textContent = "ไม่พบห้องที่เปิดให้บริการ";
        option.disabled = true;
        option.selected = true;

        select.appendChild(option);

        badgeList.innerHTML = `
            <p class="text-slate-400 text-sm text-center py-6">
                ยังไม่มีข้อมูลห้องที่เปิดให้บริการ
            </p>
        `;

        return;

    }

    rooms.forEach(room => {

        const isMeeting = room.type === "meeting";

        const option = document.createElement("option");

        option.value = room.id;

        option.textContent =
            `[${isMeeting ? "ห้องประชุม" : "ที่พัก"}] ${room.name} (สูงสุด ${room.capacity} คน)`;

        select.appendChild(option);

        const badge = document.createElement("div");

        badge.className =
            `p-3 rounded-xl border ${
                isMeeting
                    ? "border-indigo-500/30"
                    : "border-emerald-500/30"
            } bg-slate-950 flex items-center justify-between text-sm shadow-sm`;

        badge.innerHTML = `
            <div class="flex items-center gap-2.5">

                <i class="fa-solid ${
                    isMeeting
                        ? "fa-briefcase text-indigo-400"
                        : "fa-bed text-emerald-400"
                }"></i>

                <span class="font-medium text-slate-200">
                    ${escapeHTML(room.name)}
                </span>

            </div>

            <span class="text-[11px] px-2 py-0.5 rounded border ${
                isMeeting
                    ? "bg-indigo-950 text-indigo-300 border-indigo-800/40"
                    : "bg-emerald-950 text-emerald-300 border-emerald-800/40"
            }">
                ${Number(room.capacity)} คน
            </span>
        `;

        badgeList.appendChild(badge);

    });

}


// ==========================================
// ADMIN: LOAD ALL ROOMS
// ==========================================

async function loadAdminRooms() {

    const button = document.getElementById(
        "refresh-admin-rooms-btn"
    );

    const status = document.getElementById(
        "admin-room-refresh-status"
    );

    const originalHTML = button?.innerHTML;

    if (button) {

        button.disabled = true;

        button.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin mr-1"></i>
            กำลังรีเฟรช...
        `;

    }

    if (status) {
        status.textContent = "กำลังดึงข้อมูลจากฐานข้อมูล...";
        status.className = "text-[11px] text-indigo-400";
    }

    try {

        const data = await apiRequest(
            `/rooms/admin?refresh=${Date.now()}`,
            {
                method: "GET",
                cache: "no-store"
            },
            true
        );

        adminRooms = Array.isArray(data.rooms)
            ? data.rooms
            : [];

        renderAdminRooms();

        if (status) {

            const time = new Date().toLocaleTimeString(
                "th-TH",
                {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                }
            );

            status.textContent =
                `อัปเดตข้อมูลสำเร็จ ${adminRooms.length} ห้อง · ${time}`;

            status.className = "text-[11px] text-emerald-400";

        }

        return true;

    } catch (error) {

        console.error("Load admin rooms error:", error);

        if (status) {
            status.textContent = "รีเฟรชไม่สำเร็จ";
            status.className = "text-[11px] text-red-400";
        }

        handleAdminError(error);

        return false;

    } finally {

        if (button) {
            button.disabled = false;

            button.innerHTML = originalHTML ||
                '<i class="fa-solid fa-rotate mr-1"></i> รีเฟรชรายการห้อง';
        }

    }

}


// ==========================================
// ADMIN: RENDER ROOM MANAGEMENT
// ==========================================

function renderAdminRooms() {

    const container = document.getElementById("admin-room-list");

    if (!container) return;

    container.replaceChildren();

    if (adminRooms.length === 0) {

        container.innerHTML = `
            <p class="text-slate-400 text-sm text-center py-6 md:col-span-2">
                ไม่พบข้อมูลห้องในระบบ
            </p>
        `;

        return;

    }

    adminRooms.forEach(room => {

        const isActive = Number(room.isActive) === 1;
        const isMeeting = room.type === "meeting";
        const bookingCount = Number(room.bookingCount || 0);

        const card = document.createElement("div");

        card.className =
            "bg-slate-950 p-4 rounded-xl border border-slate-700 flex flex-col gap-3";

        card.innerHTML = `

            <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-3">

                <div class="space-y-1">

                    <div class="flex items-center gap-2">

                        <i class="fa-solid ${
                            isMeeting
                                ? "fa-briefcase text-indigo-400"
                                : "fa-bed text-emerald-400"
                        }"></i>

                        <span class="text-sm font-bold text-slate-200">
                            ${escapeHTML(room.name)}
                        </span>

                    </div>

                    <p class="text-xs text-slate-400">
                        ${isMeeting ? "ห้องประชุม" : "ห้องพัก / ที่พัก"}
                        · ความจุ ${Number(room.capacity)} คน
                    </p>

                    <p class="text-[11px] ${
                        isActive ? "text-emerald-400" : "text-red-400"
                    }">
                        ${isActive ? "● เปิดใช้งาน" : "● ปิดใช้งาน"}
                    </p>

                    <p class="text-[11px] text-slate-500">
                        ประวัติการจอง ${bookingCount} รายการ
                    </p>

                </div>

                <div class="flex flex-wrap gap-2">

                    <button
                        type="button"
                        class="edit-room-button text-xs font-semibold px-3 py-2 rounded-lg border border-indigo-800 text-indigo-300 bg-indigo-950 hover:bg-indigo-900 transition">

                        <i class="fa-solid fa-pen-to-square mr-1"></i>
                        แก้ไข

                    </button>

                    <button
                        type="button"
                        class="room-status-button text-xs font-semibold px-3 py-2 rounded-lg border transition ${
                            isActive
                                ? "text-red-300 border-red-800 bg-red-950 hover:bg-red-900"
                                : "text-emerald-300 border-emerald-800 bg-emerald-950 hover:bg-emerald-900"
                        }">

                        <i class="fa-solid ${
                            isActive ? "fa-ban" : "fa-check"
                        } mr-1"></i>

                        ${isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}

                    </button>

                    ${
                        bookingCount === 0
                            ? `
                                <button
                                    type="button"
                                    class="delete-room-button text-xs font-semibold px-3 py-2 rounded-lg border border-red-800 text-red-300 bg-red-950 hover:bg-red-900 transition">

                                    <i class="fa-solid fa-trash mr-1"></i>
                                    ลบห้อง

                                </button>
                            `
                            : `
                                <span class="text-[10px] text-slate-500 px-2 py-2">
                                    มีประวัติ ไม่สามารถลบได้
                                </span>
                            `
                    }

                </div>

            </div>

        `;

        card.querySelector(".edit-room-button")
            .addEventListener("click", () => {
                openEditRoom(room.id);
            });

        card.querySelector(".room-status-button")
            .addEventListener("click", () => {
                toggleRoomStatus(room.id, isActive);
            });

        const deleteButton = card.querySelector(".delete-room-button");

        if (deleteButton) {

            deleteButton.addEventListener("click", () => {
                deleteRoom(room.id, room.name);
            });

        }

        container.appendChild(card);

    });

}


// ==========================================
// ADMIN: EDIT ROOM - OPEN MODAL
// ==========================================

function openEditRoom(roomId) {

    const room = adminRooms.find(item => item.id === roomId);

    if (!room) {
        alert("ไม่พบข้อมูลห้องที่ต้องการแก้ไข");
        return;
    }

    document.getElementById("edit-room-id").value = room.id;
    document.getElementById("edit-room-name").value = room.name;
    document.getElementById("edit-room-capacity").value = room.capacity;
    document.getElementById("edit-room-type").value = room.type;

    const modal = document.getElementById("edit-room-modal");

    modal.classList.remove("hidden");
    modal.classList.add("flex");

    document.getElementById("edit-room-name").focus();

}


// ==========================================
// ADMIN: EDIT ROOM - CLOSE MODAL
// ==========================================

function closeEditRoom() {

    const modal = document.getElementById("edit-room-modal");

    if (!modal) return;

    modal.classList.add("hidden");
    modal.classList.remove("flex");

    const idInput = document.getElementById("edit-room-id");

    if (idInput) {
        idInput.value = "";
    }

}


// ==========================================
// ADMIN: EDIT ROOM - SAVE CHANGES
// ==========================================

async function saveRoomChanges() {

    const roomId = document.getElementById("edit-room-id").value;

    const name = document.getElementById("edit-room-name")
        .value.trim();

    const capacity = Number(
        document.getElementById("edit-room-capacity").value
    );

    const type = document.getElementById("edit-room-type").value;

    const saveButton = document.getElementById(
        "edit-room-save-button"
    );

    if (!roomId) {
        alert("ไม่พบรหัสห้องที่ต้องการแก้ไข");
        return;
    }

    if (!name || name.length > 120) {
        alert("กรุณากรอกชื่อห้องไม่เกิน 120 ตัวอักษร");
        return;
    }

    if (
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        capacity > 500
    ) {
        alert("ความจุต้องเป็นจำนวนเต็มระหว่าง 1 ถึง 500 คน");
        return;
    }

    if (!["meeting", "residence"].includes(type)) {
        alert("กรุณาเลือกประเภทห้องให้ถูกต้อง");
        return;
    }

    const originalHTML = saveButton?.innerHTML;

    if (saveButton) {

        saveButton.disabled = true;

        saveButton.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin mr-1"></i>
            กำลังบันทึก...
        `;

    }

    try {

        const data = await apiRequest(
            `/rooms/${encodeURIComponent(roomId)}`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    name,
                    capacity,
                    type
                })
            },
            true
        );

        closeEditRoom();

        alert(data.message || "แก้ไขข้อมูลห้องสำเร็จ");

        await Promise.all([
            loadRooms(),
            loadAdminRooms(),
            loadAdminDashboard()
        ]);

    } catch (error) {

        console.error("Save room changes error:", error);

        handleAdminError(error);

    } finally {

        if (saveButton) {

            saveButton.disabled = false;

            saveButton.innerHTML = originalHTML ||
                '<i class="fa-solid fa-floppy-disk mr-1"></i> บันทึกการแก้ไข';

        }

    }

}


// ==========================================
// ADMIN: TOGGLE ROOM STATUS
// ==========================================

async function toggleRoomStatus(roomId, currentStatus) {

    const nextStatus = !currentStatus;

    const confirmed = confirm(
        nextStatus
            ? "ต้องการเปิดใช้งานห้องนี้อีกครั้งหรือไม่?"
            : "ต้องการปิดใช้งานห้องนี้หรือไม่?\n\nห้องจะไม่ปรากฏให้ลูกค้าจองใหม่ แต่ประวัติเดิมยังอยู่"
    );

    if (!confirmed) return;

    try {

        const data = await apiRequest(
            `/rooms/${encodeURIComponent(roomId)}/status`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    isActive: nextStatus
                })
            },
            true
        );

        alert(data.message || "เปลี่ยนสถานะห้องสำเร็จ");

        await Promise.all([
            loadRooms(),
            loadAdminRooms(),
            loadAdminDashboard()
        ]);

    } catch (error) {

        handleAdminError(error);

    }

}


// ==========================================
// ADMIN: DELETE ROOM SAFELY
// ==========================================

async function deleteRoom(roomId, roomName) {

    const confirmed = confirm(
        `ต้องการลบห้อง "${roomName}" ใช่หรือไม่?\n\n` +
        "ระบบจะลบได้เฉพาะห้องที่ไม่มีประวัติการจองเท่านั้น\n" +
        "การดำเนินการนี้ไม่สามารถย้อนกลับได้"
    );

    if (!confirmed) return;

    try {

        const data = await apiRequest(
            `/rooms/${encodeURIComponent(roomId)}`,
            {
                method: "DELETE"
            },
            true
        );

        alert(data.message || "ลบห้องสำเร็จ");

        await Promise.all([
            loadRooms(),
            loadAdminRooms(),
            loadAdminDashboard()
        ]);

    } catch (error) {

        handleAdminError(error);

    }

}


// ==========================================
// CREATE BOOKING - SAVE TO SQLITE
// ==========================================

async function handleBooking(event) {

    event.preventDefault();

    const roomId = document.getElementById("book-room").value;

    const startDate = document.getElementById("book-start-date").value;
    const startTime = document.getElementById("book-start-time").value;

    const endDate = document.getElementById("book-end-date").value;
    const endTime = document.getElementById("book-end-time").value;

    const userName = document.getElementById("book-name")
        .value.trim();

    const userEmail = document.getElementById("book-email")
        .value.trim().toLowerCase();

    const startKey = dateTimeKey(startDate, startTime);
    const endKey = dateTimeKey(endDate, endTime);

    if (!roomId) {
        alert("กรุณาเลือกห้องที่ต้องการจอง");
        return;
    }

    if (!startKey || !endKey || startKey >= endKey) {
        alert("วันและเวลาสิ้นสุดต้องอยู่หลังจากวันเวลาเริ่มต้น กรุณาตรวจสอบอีกครั้ง");
        return;
    }

    if (!userName || !userEmail) {
        alert("กรุณากรอกชื่อและอีเมลผู้จอง");
        return;
    }

    const form = document.getElementById("booking-form");

    const submitButton =
        event.submitter || form.querySelector('button[type="submit"]');

    const originalButtonHTML = submitButton?.innerHTML;

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "กำลังบันทึกการจอง...";
    }

    try {

        const data = await apiRequest("/bookings", {
            method: "POST",
            body: JSON.stringify({
                roomId,
                startDate,
                startTime,
                endDate,
                endTime,
                userName,
                userEmail
            })
        });

        if (!data.booking) {
            throw new Error("Server ไม่ได้ส่งข้อมูลการจองกลับมา");
        }

        const booking = data.booking;

        alert(
            `จอง ${booking.roomName} สำเร็จแล้ว\n\n` +
            `รหัสการจอง: ${booking.bookingCode}\n\n` +
            "กรุณาบันทึก Booking Code ไว้ใช้ตรวจสอบประวัติการจอง"
        );

        form.reset();

        if (sessionStorage.getItem("hybrid_admin_token")) {
            await Promise.all([
                loadAdminBookings(),
                loadAdminDashboard()
            ]);
        }

    } catch (error) {

        console.error("Create booking error:", error);

        if (error.data?.conflict) {

            const conflict = error.data.conflict;

            const start = splitDateTime(conflict.startAt);
            const end = splitDateTime(conflict.endAt);

            alert(
                `${error.message}\n\n` +
                `ช่วงเวลาที่ชนกัน: ` +
                `${formatThaiDate(start.date)} ${start.time} - ` +
                `${formatThaiDate(end.date)} ${end.time}`
            );

        } else {

            alert(error.message || "ไม่สามารถบันทึกการจองได้");

        }

    } finally {

        if (submitButton) {

            submitButton.disabled = false;

            submitButton.innerHTML = originalButtonHTML ||
                '<i class="fa-regular fa-circle-check mr-1"></i> ยืนยันการส่งข้อมูลจองห้อง';

        }

    }

}


// ==========================================
// CUSTOMER: SEARCH OWN BOOKING
// ==========================================

async function searchMyBookings() {

    const emailInput = document.getElementById("search-email");
    const codeInput = document.getElementById("search-booking-code");
    const resultArea = document.getElementById("my-booking-results");

    if (!emailInput || !codeInput || !resultArea) {
        alert("ไม่พบช่องค้นหาประวัติการจอง");
        return;
    }

    const email = emailInput.value.trim().toLowerCase();
    const bookingCode = codeInput.value.trim().toUpperCase();

    resultArea.replaceChildren();

    if (!email || !bookingCode) {

        resultArea.innerHTML = `
            <p class="text-amber-400 text-sm text-center col-span-2 py-6">
                กรุณากรอกอีเมลและ Booking Code
            </p>
        `;

        return;

    }

    resultArea.innerHTML = `
        <p class="text-slate-400 text-sm text-center col-span-2 py-6">
            กำลังค้นหาประวัติการจอง...
        </p>
    `;

    try {

        const query = new URLSearchParams({
            email,
            bookingCode
        });

        const data = await apiRequest(
            `/bookings/my?${query.toString()}`
        );

        renderMyBooking(data.booking);

    } catch (error) {

        console.error("Search booking error:", error);

        resultArea.innerHTML = `
            <p class="text-red-400 text-sm text-center col-span-2 py-6">
                ${escapeHTML(error.message || "ค้นหาประวัติไม่สำเร็จ")}
            </p>
        `;

    }

}


// ==========================================
// RENDER CUSTOMER BOOKING
// ==========================================

function renderMyBooking(booking) {

    const resultArea = document.getElementById("my-booking-results");

    if (!resultArea) return;

    resultArea.replaceChildren();

    const start = splitDateTime(booking.startAt);
    const end = splitDateTime(booking.endAt);

    const isCancelled = booking.status === "cancelled";

    const card = document.createElement("div");

    card.className =
        "bg-slate-950 p-5 rounded-xl border border-slate-700 space-y-3 col-span-1 md:col-span-2";

    card.innerHTML = `

        <div class="flex flex-wrap justify-between items-center gap-2">

            <span class="text-sm font-bold text-slate-200">
                ${escapeHTML(booking.roomName)}
            </span>

            <span class="text-xs px-2 py-1 rounded ${
                isCancelled
                    ? "bg-red-950 text-red-300 border border-red-800"
                    : "bg-emerald-950 text-emerald-300 border border-emerald-800"
            }">

                ${statusLabel(booking.status)}

            </span>

        </div>

        <div class="text-xs text-slate-400 space-y-1">

            <p>
                Booking Code:
                <b class="text-indigo-300">
                    ${escapeHTML(booking.bookingCode)}
                </b>
            </p>

            <p>
                ผู้จอง:
                <span class="text-slate-200">
                    ${escapeHTML(booking.userName)}
                </span>
            </p>

            <p>
                เข้า:
                ${formatThaiDate(start.date)}
                เวลา ${escapeHTML(start.time)} น.
            </p>

            <p>
                ออก:
                ${formatThaiDate(end.date)}
                เวลา ${escapeHTML(end.time)} น.
            </p>

        </div>

        ${
            isCancelled
                ? `<p class="text-xs text-red-400">รายการนี้ถูกยกเลิกแล้ว</p>`
                : `<p class="text-xs text-emerald-400">รายการจองได้รับการบันทึกในระบบแล้ว</p>`
        }

    `;

    resultArea.appendChild(card);

}


// ==========================================
// ADMIN: LOAD ALL BOOKINGS
// ==========================================

async function loadAdminBookings() {

    try {

        const data = await apiRequest(
            "/bookings",
            { method: "GET" },
            true
        );

        adminBookings = Array.isArray(data.bookings)
            ? data.bookings
            : [];

        renderAdminTable();

        return true;

    } catch (error) {

        handleAdminError(error);

        return false;

    }

}


// ==========================================
// ADMIN: BOOKING SEARCH / FILTER
// ==========================================

function getFilteredAdminBookings() {

    const search = (document.getElementById("admin-booking-search")?.value || "")
        .trim()
        .toLocaleLowerCase("th-TH");

    const status = document.getElementById("admin-booking-status-filter")?.value || "all";
    const roomType = document.getElementById("admin-booking-type-filter")?.value || "all";
    const dateFrom = document.getElementById("admin-booking-date-from")?.value || "";
    const dateTo = document.getElementById("admin-booking-date-to")?.value || "";

    return adminBookings.filter(booking => {

        const searchableText = [
            booking.bookingCode,
            booking.roomName,
            booking.userName,
            booking.userEmail
        ].join(" ").toLocaleLowerCase("th-TH");

        if (search && !searchableText.includes(search)) {
            return false;
        }

        if (status !== "all" && booking.status !== status) {
            return false;
        }

        if (roomType !== "all" && booking.roomType !== roomType) {
            return false;
        }

        const bookingStartDate = splitDateTime(booking.startAt).date;

        if (dateFrom && (!bookingStartDate || bookingStartDate < dateFrom)) {
            return false;
        }

        if (dateTo && (!bookingStartDate || bookingStartDate > dateTo)) {
            return false;
        }

        return true;

    });

}


function resetAdminBookingFilters() {

    const search = document.getElementById("admin-booking-search");
    const status = document.getElementById("admin-booking-status-filter");
    const type = document.getElementById("admin-booking-type-filter");
    const dateFrom = document.getElementById("admin-booking-date-from");
    const dateTo = document.getElementById("admin-booking-date-to");

    if (search) search.value = "";
    if (status) status.value = "all";
    if (type) type.value = "all";
    if (dateFrom) {
        dateFrom.value = "";
        dateFrom.removeAttribute("max");
    }
    if (dateTo) {
        dateTo.value = "";
        dateTo.removeAttribute("min");
    }

    renderAdminTable();

}


// ==========================================
// ADMIN: RENDER BOOKING TABLE
// ==========================================

function renderAdminTable() {

    const tbody = document.getElementById("admin-booking-table");
    const count = document.getElementById("admin-booking-count");

    if (!tbody) return;

    tbody.replaceChildren();

    const filteredBookings = getFilteredAdminBookings();

    if (count) {
        count.textContent = adminBookings.length === filteredBookings.length
            ? `ทั้งหมด ${adminBookings.length.toLocaleString("th-TH")} รายการ`
            : `แสดง ${filteredBookings.length.toLocaleString("th-TH")} จาก ${adminBookings.length.toLocaleString("th-TH")} รายการ`;
    }

    if (adminBookings.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center p-6 text-slate-500 text-sm">
                    ยังไม่มีข้อมูลการจองในฐานข้อมูล
                </td>
            </tr>
        `;

        return;

    }

    if (filteredBookings.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center p-6 text-slate-400 text-sm">
                    ไม่พบรายการที่ตรงกับคำค้นหาหรือตัวกรอง
                </td>
            </tr>
        `;

        return;

    }

    filteredBookings.forEach(booking => {

        const start = splitDateTime(booking.startAt);
        const end = splitDateTime(booking.endAt);

        const isMeeting = booking.roomType === "meeting";
        const isCancelled = booking.status === "cancelled";

        const row = document.createElement("tr");

        row.className =
            "hover:bg-slate-700/30 transition text-slate-300 font-mono";

        row.innerHTML = `

            <td class="p-3 text-sm font-sans text-slate-200">

                <div class="flex flex-col gap-1">

                    <span class="text-[10px] px-1.5 py-0.5 rounded w-fit ${
                        isMeeting
                            ? "bg-indigo-950 text-indigo-400"
                            : "bg-emerald-950 text-emerald-400"
                    }">

                        ${isMeeting ? "ประชุม" : "ที่พัก"}

                    </span>

                    <span>${escapeHTML(booking.roomName)}</span>

                    <span class="text-[10px] text-slate-500">
                        ${escapeHTML(booking.bookingCode)}
                    </span>

                    <span class="text-[10px] ${
                        isCancelled ? "text-red-400" : "text-emerald-400"
                    }">

                        ${statusLabel(booking.status)}

                    </span>

                </div>

            </td>


            <td class="p-3 text-xs space-y-1">

                <span class="block text-slate-400">
                    เข้า:
                    <b class="text-slate-200">${escapeHTML(formatThaiDate(start.date))}</b>
                    เวลา <b class="text-indigo-400">${escapeHTML(start.time)} น.</b>
                </span>

                <span class="block text-slate-400">
                    ออก:
                    <b class="text-slate-200">${escapeHTML(formatThaiDate(end.date))}</b>
                    เวลา <b class="text-emerald-400">${escapeHTML(end.time)} น.</b>
                </span>

            </td>


            <td class="p-3 text-xs">

                <span class="block text-slate-100 font-sans font-semibold">
                    ${escapeHTML(booking.userName)}
                </span>

                <span class="text-slate-400 break-all">
                    ${escapeHTML(booking.userEmail)}
                </span>

            </td>


            <td class="p-3 text-center">

                <div class="flex flex-col sm:flex-row justify-center items-center gap-2">
                    <button type="button"
                        class="view-booking-detail whitespace-nowrap text-indigo-300 hover:text-indigo-200 text-xs px-2.5 py-2 border border-indigo-800/60 bg-indigo-950/40 rounded-lg transition">
                        <i class="fa-solid fa-eye mr-1"></i>
                        ดูรายละเอียด
                    </button>

                    ${
                        isCancelled
                            ? `<span class="text-[11px] text-slate-500 px-2 py-1">ยกเลิกแล้ว</span>`
                            : `
                                <button type="button"
                                    class="cancel-admin-booking whitespace-nowrap text-amber-400 hover:text-amber-300 text-xs px-2.5 py-2 border border-amber-800/50 rounded-lg transition">
                                    <i class="fa-solid fa-ban mr-1"></i>
                                    ยกเลิกการจอง
                                </button>
                            `
                    }
                </div>

            </td>

        `;

        const detailButton = row.querySelector(".view-booking-detail");
        detailButton?.addEventListener("click", () => {
            openBookingDetail(booking.id);
        });

        const cancelButton = row.querySelector(".cancel-admin-booking");

        if (cancelButton) {
            cancelButton.addEventListener("click", () => {
                cancelBookingByAdmin(booking.id);
            });
        }

        tbody.appendChild(row);

    });

}


// ==========================================
// ADMIN: BOOKING DETAIL MODAL
// ==========================================

function openBookingDetail(bookingId) {

    const booking = adminBookings.find(item => String(item.id) === String(bookingId));

    if (!booking) {
        alert("ไม่พบข้อมูลการจองที่ต้องการดู");
        return;
    }

    const modal = document.getElementById("booking-detail-modal");
    const code = document.getElementById("booking-detail-code");
    const content = document.getElementById("booking-detail-content");

    if (!modal || !code || !content) return;

    const start = splitDateTime(booking.startAt);
    const end = splitDateTime(booking.endAt);
    const isMeeting = booking.roomType === "meeting";
    const isCancelled = booking.status === "cancelled";

    code.textContent = `Booking Code: ${booking.bookingCode || "-"}`;

    const details = [
        {
            label: "ชื่อห้อง",
            value: booking.roomName || "-",
            icon: "fa-door-open"
        },
        {
            label: "ประเภทห้อง",
            value: isMeeting ? "ห้องประชุม" : "ห้องพัก / ที่พัก",
            icon: isMeeting ? "fa-briefcase" : "fa-bed"
        },
        {
            label: "ชื่อผู้จอง",
            value: booking.userName || "-",
            icon: "fa-user"
        },
        {
            label: "อีเมลผู้จอง",
            value: booking.userEmail || "-",
            icon: "fa-envelope"
        },
        {
            label: "วันและเวลาเข้าใช้",
            value: `${formatThaiDate(start.date)} เวลา ${start.time || "-"} น.`,
            icon: "fa-calendar-check"
        },
        {
            label: "วันและเวลาออก",
            value: `${formatThaiDate(end.date)} เวลา ${end.time || "-"} น.`,
            icon: "fa-calendar-xmark"
        },
        {
            label: "วันที่สร้างรายการ",
            value: formatThaiDateTime(booking.createdAt),
            icon: "fa-clock"
        },
        {
            label: "วันที่ยกเลิก",
            value: booking.cancelledAt ? formatThaiDateTime(booking.cancelledAt) : "-",
            icon: "fa-ban"
        }
    ];

    content.innerHTML = details.map(detail => `
        <div class="bg-slate-950 border border-slate-700/70 rounded-xl p-3 min-w-0">
            <p class="text-[11px] text-slate-500 mb-1">
                <i class="fa-solid ${detail.icon} mr-1.5 text-indigo-400"></i>
                ${escapeHTML(detail.label)}
            </p>
            <p class="text-sm text-slate-100 break-words">${escapeHTML(detail.value)}</p>
        </div>
    `).join("");

    const statusCard = document.createElement("div");
    statusCard.className = `sm:col-span-2 rounded-xl border p-3 ${
        isCancelled
            ? "bg-red-950/40 border-red-800/60"
            : "bg-emerald-950/40 border-emerald-800/60"
    }`;
    statusCard.innerHTML = `
        <p class="text-[11px] text-slate-400 mb-1">สถานะการจอง</p>
        <p class="text-sm font-bold ${isCancelled ? "text-red-300" : "text-emerald-300"}">
            ${escapeHTML(statusLabel(booking.status))}
        </p>
    `;
    content.appendChild(statusCard);

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    document.body.classList.add("overflow-hidden");

    modal.querySelector('button[aria-label="ปิดรายละเอียดการจอง"]')?.focus();

}


function closeBookingDetail() {

    const modal = document.getElementById("booking-detail-modal");

    if (!modal) return;

    modal.classList.add("hidden");
    modal.classList.remove("flex");
    document.body.classList.remove("overflow-hidden");

}


// ==========================================
// ADMIN: CANCEL BOOKING
// ==========================================

async function cancelBookingByAdmin(bookingId) {

    const confirmed = confirm(
        "ยืนยันการยกเลิกรายการจองนี้หรือไม่?\n\n" +
        "ข้อมูลจะยังถูกเก็บไว้ในประวัติ แต่สถานะจะเปลี่ยนเป็นยกเลิก"
    );

    if (!confirmed) return;

    try {

        const data = await apiRequest(
            `/bookings/${encodeURIComponent(bookingId)}/cancel`,
            {
                method: "PATCH"
            },
            true
        );

        alert(data.message || "ยกเลิกรายการจองสำเร็จ");

        await Promise.all([
            loadAdminBookings(),
            loadAdminDashboard()
        ]);

    } catch (error) {

        handleAdminError(error);

    }

}


// ==========================================
// ADMIN: ADD NEW ROOM
// ==========================================

async function addNewRoom() {

    const type = document.getElementById("new-room-type").value;

    const name = document.getElementById("new-room-name")
        .value.trim();

    const capacity = Number(
        document.getElementById("new-room-cap").value
    );

    if (!name || name.length > 120) {
        alert("กรุณากรอกชื่อห้องไม่เกิน 120 ตัวอักษร");
        return;
    }

    if (
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        capacity > 500
    ) {
        alert("ความจุต้องเป็นจำนวนเต็มระหว่าง 1 ถึง 500 คน");
        return;
    }

    try {

        const data = await apiRequest(
            "/rooms",
            {
                method: "POST",
                body: JSON.stringify({
                    name,
                    capacity,
                    type
                })
            },
            true
        );

        alert(data.message || `เพิ่มห้อง ${name} สำเร็จ`);

        document.getElementById("new-room-name").value = "";
        document.getElementById("new-room-cap").value = "";

        await Promise.all([
            loadRooms(),
            loadAdminRooms(),
            loadAdminDashboard()
        ]);

    } catch (error) {

        handleAdminError(error);

    }

}


// ==========================================
// START SYSTEM
// ==========================================

async function startSystem() {

    initRoomUI();

    renderAdminTable();

    renderAdminRooms();

    await loadRooms();

    await restoreAdminSession();

}


// ==========================================
// ENTER KEY SUPPORT
// ==========================================

function setupSearchEnterKey() {

    const emailInput = document.getElementById("search-email");
    const codeInput = document.getElementById("search-booking-code");

    [emailInput, codeInput].forEach(input => {

        if (!input) return;

        input.addEventListener("keydown", event => {

            if (event.key === "Enter") {
                event.preventDefault();
                searchMyBookings();
            }

        });

    });

}


// ==========================================
// EDIT ROOM MODAL KEYBOARD SUPPORT
// ==========================================

function setupEditRoomModal() {

    const modal = document.getElementById("edit-room-modal");

    if (!modal) return;

    modal.addEventListener("click", event => {

        if (event.target === modal) {
            closeEditRoom();
        }

    });

    document.addEventListener("keydown", event => {

        if (event.key === "Escape" && !modal.classList.contains("hidden")) {
            closeEditRoom();
        }

    });

}


// ==========================================
// ADMIN BOOKING FILTER EVENTS
// ==========================================

function setupAdminBookingFilters() {

    const search = document.getElementById("admin-booking-search");
    const status = document.getElementById("admin-booking-status-filter");
    const type = document.getElementById("admin-booking-type-filter");
    const dateFrom = document.getElementById("admin-booking-date-from");
    const dateTo = document.getElementById("admin-booking-date-to");
    const resetButton = document.getElementById("admin-booking-reset-filters");

    [search, status, type, dateFrom, dateTo].forEach(control => {
        if (!control) return;
        control.addEventListener(control === search ? "input" : "change", renderAdminTable);
    });

    resetButton?.addEventListener("click", resetAdminBookingFilters);

    dateFrom?.addEventListener("change", () => {
        if (dateTo && dateFrom.value) {
            dateTo.min = dateFrom.value;
        } else if (dateTo) {
            dateTo.removeAttribute("min");
        }
    });

    dateTo?.addEventListener("change", () => {
        if (dateFrom && dateTo.value) {
            dateFrom.max = dateTo.value;
        } else if (dateFrom) {
            dateFrom.removeAttribute("max");
        }
    });

}


// ==========================================
// BOOKING DETAIL MODAL KEYBOARD SUPPORT
// ==========================================

function setupBookingDetailModal() {

    const modal = document.getElementById("booking-detail-modal");

    if (!modal) return;

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closeBookingDetail();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !modal.classList.contains("hidden")) {
            closeBookingDetail();
        }
    });

}


// ==========================================
// ADMIN SECURITY EVENTS
// ==========================================

function setupAdminSecurityEvents() {

    const passwordForm = document.getElementById("admin-password-form");
    const backupButton = document.getElementById("create-database-backup-btn");

    passwordForm?.addEventListener("submit", changeAdminPassword);

    backupButton?.addEventListener("click", createDatabaseBackup);

}


// ==========================================
// INITIALIZE
// ==========================================

setupSearchEnterKey();
setupEditRoomModal();
setupAdminBookingFilters();
setupBookingDetailModal();
setupAdminSecurityEvents();

startSystem();