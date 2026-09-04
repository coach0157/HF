# แพลนขึ้น Production — ต้องเปลี่ยนอะไรบ้าง

ตอนนี้ระบบทั้งหมดรันบนเครื่อง local (dev) เท่านั้น — ไฟล์นี้ไล่ทุกจุดที่ **ต้องเปลี่ยน
ก่อนเปิดให้ลูกค้าจริงใช้งาน** แบ่งเป็น 3 ระดับความสำคัญ

**อ่านคู่กับ:** `CODE_MAP.md` (หาไฟล์), `PRODUCT_OVERVIEW.md` (สรุปฟีเจอร์)

---

## ระดับ 1 — ต้องทำก่อนมีลูกค้าจริงคนแรก (ห้ามข้าม)

### 1.1 เปลี่ยนความลับ (secrets) ทั้งหมด — ตอนนี้เป็นค่า placeholder ที่ใครก็เดาได้
`apps/backend/.env` ตอนนี้มี:
```
JWT_ACCESS_SECRET="change-me-access-secret"
JWT_REFRESH_SECRET="change-me-refresh-secret"
QR_TOKEN_SECRET="change-me-qr-secret"
```
**นี่คือรูรั่วความปลอดภัยที่ร้ายแรงที่สุดถ้าลืมแก้** — ถ้าใครเดาค่าพวกนี้ได้ ปลอม JWT
login เข้าระบบเป็นใครก็ได้ทันที (รวมถึงปลอม QR แขกด้วย)
- สร้างค่าสุ่มยาวๆ ใหม่ (เช่น `openssl rand -base64 48`) ให้ทั้ง 3 ตัวนี้ต่างกัน
- ใส่ในไฟล์ `.env` ของเซิร์ฟเวอร์ production เท่านั้น **ห้าม commit เข้า git เด็ดขาด**

### 1.2 ย้ายจากดิสก์เครื่อง local ไปเป็น cloud storage จริง
ตอนนี้รูปภาพทั้งหมด (บัตร ปชช., รูปแชท, avatar, รูปตรวจรอบ) เก็บในโฟลเดอร์
`apps/backend/uploads/` บนดิสก์เครื่องเดียว — ถ้าย้าย/รีสตาร์ทเซิร์ฟเวอร์รูปหายหมด
- เปลี่ยนไปใช้ **Cloudflare R2** (ถูก ไม่คิดค่า egress) — โค้ดออกแบบไว้ให้สลับง่ายแล้ว
  (`FileStorageService` มี interface เดียว แค่เปลี่ยน implementation ข้างใน)
- ใส่ `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` ใน `.env` จริง

### 1.3 เปิด HTTPS จริง + ปิด cleartext traffic ที่แอปมือถือ
ตอนนี้ backend เป็น `http://` ธรรมดา (ไม่เข้ารหัส) และแอปมือถือถูกตั้ง
`usesCleartextTraffic: true` ใน `apps/mobile/app.json` เพื่อให้ทดสอบตอน dev ได้
(อธิบายไว้ในบั๊กที่เคยแก้ — ข้อ 6 ของ `CODE_MAP.md`)
- ต้องมีโดเมนจริง + SSL (ฟรีผ่าน Let's Encrypt ถ้า host เอง หรือได้อัตโนมัติถ้าใช้
  Railway/Render/Vercel)
- พอมี `https://` แล้ว **ต้องลบ `usesCleartextTraffic: true` ออก** จาก
  `app.json` แล้ว build APK ใหม่ — ค่านี้ตอนนี้เปิดช่องให้ดักจับข้อมูลระหว่างทางได้
  ถ้าเจอ network แปลกๆ (เช่น WiFi สาธารณะ) ไม่ควรเปิดค้างไว้ในเวอร์ชันที่ขายจริง
- อัปเดต `eas.json`'s `EXPO_PUBLIC_API_BASE_URL` ให้เป็นโดเมนจริง (ไม่ใช่ LAN IP
  `192.168.1.104` ที่ใช้ทดสอบอยู่ตอนนี้)

### 1.4 จำกัด CORS
`apps/backend/src/main.ts` บรรทัด 13 มีคอมเมนต์เตือนตัวเองไว้แล้วว่า:
```ts
app.enableCors(); // TODO: restrict to the admin-web origin(s) before staging.
```
ตอนนี้ backend รับ request จาก**เว็บไหนก็ได้ในโลก** — ต้องจำกัดให้รับเฉพาะโดเมนเว็บ
admin จริงของเรา ก่อนเปิดใช้งานจริง

### 1.5 ต่อ SMS gateway จริง (OTP ตอนนี้เป็น mock)
ตอนนี้รหัส OTP แค่ log ออก console เซิร์ฟเวอร์ ไม่มีใครได้รับ SMS จริง — ต้องสมัคร
ผู้ให้บริการ SMS (เช่น Thaibulksms) แล้วต่อเข้า `OTP_PROVIDER` ใน `.env`
(โครงโค้ดรองรับไว้แล้ว แค่ยังไม่มี provider จริง)

### 1.6 ตั้งค่า production build ของแอปมือถือให้ถูกต้อง
`eas.json` ตอนนี้มีแค่ `preview` profile (สำหรับทดสอบ) ที่ตั้งค่า LAN IP ไว้ —
ต้องเพิ่ม `production` profile ที่ชี้ไป backend โดเมนจริง ก่อน submit ขึ้น Play Store/
App Store จริง

### 1.7 ย้าย backend + database ไป server จริง (ไม่ใช่ docker-compose บนเครื่องนี้)
ตอนนี้ Postgres รันผ่าน `docker-compose.yml` บนเครื่องนี้เท่านั้น — ต้องมี:
- Server จริง (VPS เช่น DigitalOcean/Vultr หรือ managed Postgres เช่น Supabase/Neon)
- ตั้ง `NODE_ENV=production` ให้ถูกต้อง (ตอนนี้ default เป็น `development` — สำคัญ
  เพราะมีโค้ดหลายจุดเช็คค่านี้ เช่น `OTP_DEV_BYPASS_CODE` จะใช้งานไม่ได้เฉพาะตอน
  production เท่านั้น)
- ตั้ง database backup อัตโนมัติ (ยังไม่มีตอนนี้เลย — ถ้าเครื่อง server พังข้อมูลหายหมด)

---

## ระดับ 2 — ควรทำก่อนขยายลูกค้าเกิน 2-3 หมู่บ้าน

### 2.1 OTP/refresh token ต้องย้ายจาก in-memory ไป Redis
ตอนนี้รหัส OTP เก็บอยู่ในหน่วยความจำของโปรเซส backend เดียว — ถ้ามีลูกค้าเยอะขึ้นจน
ต้องรัน backend มากกว่า 1 เครื่อง (scale horizontal) ระบบ OTP จะพังทันที (คนละเครื่อง
ไม่เห็นรหัสของกันและกัน) — ต้องย้ายไป Redis ก่อนจะ scale ได้

### 2.2 Error monitoring / uptime monitoring
ตอนนี้ error แค่ขึ้นใน console log ไม่มีใครแจ้งเตือนถ้าระบบล่ม — ควรต่อ Sentry (จับ
error) + uptime monitor (เช่น UptimeRobot ฟรี) **สำคัญเป็นพิเศษเพราะระบบนี้มีฟีเจอร์
SOS ฉุกเฉิน — ถ้าระบบล่มตอนมีเหตุฉุกเฉินจริงเป็นเรื่องใหญ่**

### 2.3 มีหน้าทางสำหรับ onboard หมู่บ้านใหม่
ตอนนี้การเพิ่มหมู่บ้านใหม่ต้องทำผ่าน `prisma:seed`/แก้ฐานข้อมูลตรงๆ ไม่มี UI ให้
สมัคร/สร้างหมู่บ้านใหม่เอง — ถ้าจะขายจริงหลายหมู่บ้าน ควรมีอย่างน้อย internal
tool/checklist ให้ตัวเองสร้างหมู่บ้านใหม่ได้เร็วๆ โดยไม่ต้องเปิด Prisma Studio ทุกครั้ง

### 2.4 Push notification receipt polling
ตอนนี้ระบบลบ push token ที่ตายแล้วได้แค่ตอนที่ Expo แจ้งตอนส่ง (ticket-level) แต่ยัง
ไม่มี job ตรวจสอบ receipt แบบ async ในภายหลัง (Expo แจ้งบางเคสช้ากว่านั้น) — ไม่กระทบ
การใช้งานตอนนี้ แค่ทำให้ token ตายบางตัวค้างในฐานข้อมูลนานกว่าที่ควร ไม่เร่งด่วน

---

## ระดับ 3 — ควรทำ แต่ไม่บล็อกการขาย

### 3.1 ทดสอบบนอุปกรณ์จริงให้กว้างขึ้น
ตอนนี้ทดสอบจริงแค่มือถือ Samsung เครื่องเดียว — ก่อนขยายลูกค้าควรลองอย่างน้อย Xiaomi/
Oppo อีก 1-2 เครื่อง (ยี่ห้อพวกนี้มีระบบจำกัด background app ที่ต่างจาก Samsung ตามที่
เจอปัญหา battery optimization มาแล้วรอบหนึ่ง)

### 3.2 Security review / pentest โดยมืออาชีพ
ระบบมีข้อมูล PDPA อ่อนไหว (รูปบัตร ปชช.) ควรมีคนนอกมาตรวจสอบความปลอดภัยก่อนขยาย
ลูกค้าเยอะๆ — ไม่จำเป็นสำหรับลูกค้า 2-3 รายแรกที่เป็น pilot

### 3.3 เอกสารกฎหมายจริง (Privacy Policy / Terms of Service)
โค้ดออกแบบเรื่อง data retention/PDPA ไว้แล้ว แต่ยังไม่มีเอกสารกฎหมายจริงที่ลูกบ้าน
ต้องกดยินยอมก่อนใช้งาน — ควรมีก่อนเปิดขายเป็นทางการ (ไม่ใช่แค่ pilot ฟรี)

---

## สรุปเรียงลำดับทำจริง (แนะนำ)

1. เปลี่ยน secrets (1.1) — ทำได้เดี๋ยวนี้ ไม่มีข้อแม้
2. ย้าย server+database ไป production จริง (1.7)
3. ต่อ HTTPS (1.3) + จำกัด CORS (1.4)
4. ย้าย file storage ไป R2 (1.2)
5. ต่อ SMS gateway จริง (1.5)
6. ตั้ง `production` build profile มือถือ (1.6) แล้ว build/submit ขึ้น store
7. จากนั้นค่อยไล่ระดับ 2-3 ตามที่ลูกค้าเพิ่มขึ้นจริง
