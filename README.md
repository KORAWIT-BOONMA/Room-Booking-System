# HYBRID RESERVE

ระบบจองห้องพักและห้องประชุม พัฒนาด้วย HTML, CSS, JavaScript และ Node.js พร้อมฐานข้อมูล SQLite เพื่อจัดการการจองและบริหารระบบผ่านหน้า Admin

## Features

### Customer
- แสดงรายการห้องที่เปิดให้บริการ
- เลือกห้องและระบุวันที่เข้าพักและวันที่ออก
- ตรวจสอบการจองที่มีช่วงเวลาทับซ้อน
- สร้างรายการจองและรับ Booking Code
- ค้นหารายการจองด้วย Email และ Booking Code

### Admin
- เข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ
- Dashboard แสดงข้อมูลสรุปการจอง
- ค้นหาและกรองรายการจอง
- ดูรายละเอียดการจอง
- ยกเลิกการจองโดยเก็บประวัติไว้ในระบบ
- เพิ่ม แก้ไข เปิดใช้งาน และปิดใช้งานห้อง
- ป้องกันการลบห้องที่มีประวัติการจอง
- เปลี่ยนรหัสผ่าน Admin
- ป้องกันการเข้าสู่ระบบผิดซ้ำ
- สำรองฐานข้อมูล SQLite และดาวน์โหลดไฟล์ Backup

## Tech Stack

**Frontend**
- HTML5
- CSS3
- JavaScript (Vanilla JS)
- Tailwind CSS
- Font Awesome

**Backend**
- Node.js
- Express.js
- better-sqlite3
- bcryptjs
- JSON Web Token (JWT)
- dotenv

**Database**
- SQLite

## Project Structure

```text
RoomBooking/
│
├── index.html
├── script.js
├── style.css
├── README.md
│
└── backend/
    ├── server.js
    ├── db.js
    ├── .env
    ├── package.json
    ├── routes/
    ├── middleware/
    ├── scripts/
    ├── data/
    └── backups/
```

## Installation

### 1. Requirements

- Node.js
- npm

### 2. Install dependencies

เปิด Terminal ที่โฟลเดอร์ backend

```bash
cd backend
npm install
```

### 3. Configure environment variables

สร้างไฟล์ `.env` ภายในโฟลเดอร์ `backend` และกำหนดค่าตามที่ระบบต้องใช้

ตัวแปร `JWT_SECRET` ต้องมีความยาวอย่างน้อย 32 ตัวอักษร และควรใช้ค่าที่สุ่มและคาดเดายาก

ห้ามเผยแพร่ไฟล์ `.env` หรือข้อมูลลับผ่าน GitHub

### 4. Create Admin account

```bash
npm run create-admin
```

### 5. Start the server

```bash
npm run dev
```

เปิดเว็บไซต์ผ่านเบราว์เซอร์:

```text
http://localhost:3000
```

## Database and Backup

ระบบใช้ SQLite สำหรับจัดเก็บข้อมูลการจอง ห้อง และบัญชี Admin

ตำแหน่งฐานข้อมูล:

```text
backend/data/hybrid-reserve.db
```

ไฟล์สำรองฐานข้อมูลจะถูกจัดเก็บใน:

```text
backend/backups/
```

ผู้ดูแลระบบสามารถสร้าง ตรวจสอบ และดาวน์โหลดไฟล์สำรองผ่านหน้า Admin ได้

## Security

- เข้ารหัสรหัสผ่านด้วย bcrypt
- ใช้ JWT สำหรับตรวจสอบสิทธิ์ Admin
- ตรวจสอบสิทธิ์ก่อนเข้าถึง API สำหรับผู้ดูแลระบบ
- มีระบบจำกัดความพยายามเข้าสู่ระบบ
- เปลี่ยนรหัสผ่าน Admin ได้
- สำรองฐานข้อมูลด้วย SQLite Online Backup API

**หมายเหตุ:** ระบบจำกัดการเข้าสู่ระบบผิดซ้ำในปัจจุบันเก็บตัวนับไว้ในหน่วยความจำของ Backend จึงเริ่มนับใหม่เมื่อเซิร์ฟเวอร์เริ่มทำงานอีกครั้ง

## Important Notes

- ไม่ควรอัปโหลด `.env`, ฐานข้อมูลจริง, ไฟล์ Backup หรือ `node_modules` ขึ้น GitHub
- ควรสำรองฐานข้อมูลอย่างสม่ำเสมอ
- ควรเก็บไฟล์ Backup ไว้ในพื้นที่ปลอดภัย

---

Developed as a room reservation and management system project.

https://room-booking-system-production-0378c954.up.railway.app/
