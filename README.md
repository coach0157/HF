# Village Security & Community App

ระบบความปลอดภัยและอำนวยความสะดวกหมู่บ้าน — multi-tenant SaaS: backend API +
admin dashboard (เว็บ) + แอปมือถือ Resident/Guard (Expo/React Native)

- **Spec (source of truth):** [`village-security-app-spec.md`](./village-security-app-spec.md)
- **Design system (สี/spacing/component):** [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md)
- **MVP backlog:** [`docs/MVP_BACKLOG.md`](./docs/MVP_BACKLOG.md)
- **Phase 2 backlog** (แชท, แจ้งซ่อม, ทำเนียบรถรับจ้าง, push): [`docs/PHASE2_BACKLOG.md`](./docs/PHASE2_BACKLOG.md)
- **Architecture / ADRs / RLS pattern:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- **QA reports** (ทุกรอบ): [`docs/QA_REPORT.md`](./docs/QA_REPORT.md)

## สถานะปัจจุบัน

**เสร็จและผ่าน QA แล้ว:** MVP (Auth OTP, Visitor QR+Entry/Exit, ประกาศ, SOS),
Phase 2 ทั้งหมด (แชท real-time, แจ้งซ่อม, ทำเนียบรถรับจ้าง), Push Notification
(Expo Push — สแกนเข้า/SOS/ประกาศ/แชท), อัปโหลดรูปโปรไฟล์, ดีไซน์เขียว-ฟ้าทั้งเว็บ/แอป

**ยังไม่ทำ (Phase 3):** จองพื้นที่ส่วนกลาง, ชำระค่าส่วนกลาง (ต้องมีบัญชี payment
gateway จริง), CCTV/LPR (ต้องมีอุปกรณ์จริง)

**Known limitation ที่ยังค้าง:** SMS fallback สำหรับประกาศฉุกเฉินยังไม่ implement,
OTP/refresh-token store เป็น in-memory (ไม่รองรับ backend หลาย instance),
ยังไม่เคยทดสอบแอปมือถือบนอุปกรณ์จริง/emulator เต็มรูปแบบ (verify แค่ระดับ
code/backend integration) — รายละเอียดดู `docs/QA_REPORT.md`

## Repo layout

```
apps/
  backend/       NestJS API — auth, visitor-pass, entry-log, announcement,
                 sos, guard-shift, house, transport-provider, maintenance,
                 chat (Socket.io), push notifications, audit log
  admin-web/     React (Vite) admin dashboard
  mobile/        Expo/React Native — Resident + Guard (1 app, role-based nav)
infra/
  postgres/init/ Bootstrap SQL ที่รันครั้งเดียวตอนสร้าง Postgres container
docs/
  ARCHITECTURE.md      ADR ทั้งหมด (multi-tenant RLS, Socket.io, push, ฯลฯ)
  DESIGN_SYSTEM.md     สี/spacing/component ที่ใช้ร่วมกันทั้งเว็บ/แอป
  MVP_BACKLOG.md        Epic 0-7 (MVP)
  PHASE2_BACKLOG.md     Epic 8-11 (Phase 2 + push)
  QA_REPORT.md          ผลทดสอบทุกรอบ
docker-compose.yml   local Postgres
```

Monorepo tooling: **npm workspaces** (`apps/*`) — ไม่ใช้ Nx/Turborepo (ดูเหตุผล
ที่ ARCHITECTURE.md ADR-001)

## Prerequisites

- Node.js >= 20
- Docker Desktop (สำหรับ Postgres local)
- มือถือ Android/iOS จริง + แอป **Expo Go** (สำหรับทดสอบแอปมือถือแบบเร็ว) หรือ
  บัญชี Expo ฟรีถ้าจะ build เป็น APK จริง (ดูหัวข้อ "ทดสอบบนมือถือ" ด้านล่าง)

## First-time setup

```bash
# 1. ติดตั้ง dependency ทั้ง workspace (backend + admin-web + mobile)
npm install

# 2. เปิด Postgres (สร้าง role/database อัตโนมัติจาก infra/postgres/init/01-init.sql)
docker compose up -d db

# 3. ตั้งค่า backend
cp apps/backend/.env.example apps/backend/.env
# ค่า default ตรงกับ docker-compose.yml อยู่แล้ว ไม่ต้องแก้อะไรสำหรับ local dev

# 4. Migrate database (migration ทั้งหมด commit ไว้แล้วใน apps/backend/prisma/migrations/)
npm run prisma:migrate:dev

# 5. Seed หมู่บ้านตัวอย่าง + user ทดสอบ (idempotent — รันซ้ำได้ไม่สร้างข้อมูลซ้ำ)
npm run prisma:seed

# 6. ตั้งค่า admin-web
cp apps/admin-web/.env.example apps/admin-web/.env.local

# 7. ตั้งค่า mobile — สำคัญ: ถ้าจะทดสอบบนมือถือจริง (ไม่ใช่แค่ web preview)
#    ต้องแก้ IP ให้เป็น LAN IP ของเครื่องนี้ (ดูด้วย `ipconfig`) ไม่ใช่ localhost
#    เพราะ "localhost" บนมือถือหมายถึงตัวมือถือเอง ไม่ใช่คอมที่รัน backend
cp apps/mobile/.env.example apps/mobile/.env.local
# แก้ EXPO_PUBLIC_API_BASE_URL ใน .env.local ให้เป็น http://<LAN-IP-ของคุณ>:3001
```

### Seed users (สำหรับ login ทดสอบ)

OTP เป็น mock — โค้ดจะ log ออก console ของ backend (ดูใน terminal ที่รัน `npm run dev:backend`)

| Role | เบอร์โทร | ใช้กับ |
|---|---|---|
| Admin | `0800000000` | Admin Dashboard (เว็บ) |
| Resident | `0811111111` | แอปมือถือ Resident |
| Guard | `0822222222` | แอปมือถือ Guard |

## Running in dev

```bash
# Terminal 1 — backend
npm run dev:backend          # http://localhost:3001 (Swagger ที่ /docs)

# Terminal 2 — admin dashboard
npm run dev:admin            # http://localhost:5173

# Terminal 3 — mobile (Expo dev server)
npm run dev:mobile           # ขึ้น QR code ให้สแกนด้วย Expo Go
```

Smoke-test backend:

```bash
curl http://localhost:3001/health
# => {"status":"ok","db":"connected"}
```

**เจอ `EADDRINUSE` ตอน start backend?** เช็คก่อนว่ามันรันอยู่แล้วจริงไหมด้วย
`curl http://localhost:3001/health` — ถ้าได้ผลลัพธ์กลับมาแปลว่าใช้งานได้อยู่แล้ว
ไม่ต้อง start ซ้ำ (มักเกิดจาก process เก่าที่ค้างจากรอบทดสอบก่อนหน้า)

## ทดสอบบนมือถือจริง

### วิธีเร็ว — Expo Go (ไม่ต้อง build)
ติดตั้งแอป **Expo Go** จาก Play Store/App Store บนมือถือ (ต้องต่อ WiFi วงเดียว
กับคอมที่รัน `npm run dev:mobile`) แล้วสแกน QR ที่ขึ้นในเทอร์มินัล

> ⚠️ **ข้อจำกัดสำคัญ:** Expo Go บน **Android ตัด remote push notification ออก
> ตั้งแต่ SDK 53** — จะไม่เห็น push notification จริงถ้าทดสอบผ่าน Expo Go
> ต้อง build เป็น dev/standalone build (ดูด้านล่าง) ถึงจะทดสอบ push ได้จริง
> ถ้า Expo Go ขึ้น "incompatible SDK version" ให้อัปเดต Expo Go จาก Play Store
> หรือโหลดเวอร์ชันที่ตรง SDK จาก https://expo.dev/go

### วิธี build เป็น APK จริง (จำเป็นถ้าจะทดสอบ push notification)
```bash
cd apps/mobile
npx eas-cli login              # ต้องมีบัญชี Expo ของคุณเอง (สมัครฟรี)
npx eas-cli init                # ผูกโปรเจกต์กับบัญชี — ทำครั้งเดียว
npx eas-cli build --platform android --profile preview
```
รอ build เสร็จ (ปกติ 5-15 นาที) จะได้ลิงก์ดาวน์โหลด `.apk` ติดตั้งตรงบนมือถือได้เลย
(profile `preview` ใน `apps/mobile/eas.json` ตั้งไว้ให้ build เป็น APK ไม่ใช่ AAB)

> ⚠️ **สำคัญ — IP หลังบ้าน:** `apps/mobile/.env.local` เป็นไฟล์ที่ gitignore ไว้
> **EAS Build (cloud) ไม่อัปโหลดไฟล์นี้ไปด้วย** จึงต้องกำหนด
> `EXPO_PUBLIC_API_BASE_URL` ไว้ตรงใน `apps/mobile/eas.json` (คีย์ `build.preview.env`)
> แทน — ถ้า LAN IP ของเครื่องที่รัน backend เปลี่ยน (เช่น ต่อ WiFi คนละที่ หรือ
> router จ่าย IP ใหม่) ต้องแก้ค่านี้ใน `eas.json` แล้ว build ใหม่ ไม่งั้นแอปที่ build
> ไว้จะเชื่อมต่อ backend ไม่ได้ (อาการ: "ส่ง OTP ไม่สำเร็จ" ทั้งที่ backend รันอยู่ปกติ)

## Database access / Prisma Studio

```bash
npm run --workspace apps/backend prisma:studio
```

## รัน test

```bash
# Backend: unit + e2e (ต้องมี Postgres รันอยู่)
npm run --workspace apps/backend test
npm run --workspace apps/backend test:e2e

# Type-check ทุก workspace
npm run build              # backend + admin-web (รวม type-check)
npm run typecheck:mobile   # mobile
```

## Stopping

```bash
docker compose down        # หยุด Postgres, เก็บข้อมูลไว้
docker compose down -v     # หยุด Postgres และล้างข้อมูลทิ้งทั้งหมด
```
