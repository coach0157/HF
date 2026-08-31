# แผนที่โครงสร้างโค้ด (Code Map)

เอกสารนี้ทำไว้ให้**หาไฟล์ที่ต้องแก้เจอเร็วๆ**เวลาไม่มี Claude ช่วย — ไม่ใช่เอกสารอธิบาย
ฟีเจอร์ (ดู `PRODUCT_OVERVIEW.md` สำหรับอันนั้น) และไม่ใช่ architecture ลึกๆ (ดู
`ARCHITECTURE.md` สำหรับอันนั้น)

---

## 1. ภาพรวม — 3 โปรแกรมแยกกัน อยู่ในโฟลเดอร์เดียว

```
D:\HF\
├── apps/
│   ├── backend/      ← "สมอง" ของระบบ — API + ฐานข้อมูล ทุกฟีเจอร์จริงๆ อยู่ที่นี่
│   ├── admin-web/     ← เว็บที่แอดมินเปิดในเบราว์เซอร์ (localhost:5173)
│   └── mobile/        ← แอปมือถือ resident+guard (สร้างเป็น .apk ติดตั้งจริง)
├── docs/               ← เอกสารทั้งหมด (ไฟล์นี้ก็อยู่ที่นี่)
└── village-security-app-spec.md  ← สเปกต้นฉบับ
```

**กฎจำง่ายๆ:** ดู path ของไฟล์เป็นหลัก
- `apps/backend/...` → แก้ตรงนี้ = แก้ "หลังบ้าน" (logic, ฐานข้อมูล, การตรวจสิทธิ์)
- `apps/admin-web/...` → แก้ตรงนี้ = แก้ "หน้าเว็บที่แอดมินเห็น"
- `apps/mobile/...` → แก้ตรงนี้ = แก้ "แอปในมือถือที่ลูกบ้าน/รปภ. เห็น"

**เว็บกับมือถือไม่มีโค้ดจริงของตัวเอง** — มันแค่ "เรียก" backend ผ่าน internet
(HTTP) เพื่อขอ/บันทึกข้อมูล ถ้าอยากรู้ว่าข้อมูลจริงๆ ถูกตรวจสอบ/บันทึกยังไง ต้องไปดูที่
backend เสมอ ไม่ใช่ฝั่งเว็บ/มือถือ

---

## 2. apps/backend — หลังบ้าน (NestJS)

```
apps/backend/
├── prisma/
│   ├── schema.prisma        ← โครงสร้างฐานข้อมูลทั้งหมด (ทุกตาราง ทุก field)
│   ├── migrations/          ← ประวัติการแก้ฐานข้อมูล (ห้ามแก้ไฟล์เก่า สร้างใหม่เสมอ)
│   └── seed.ts               ← ข้อมูลตัวอย่างที่ใส่ตอน `npm run prisma:seed`
├── src/
│   ├── modules/               ← ★ ฟีเจอร์ทั้งหมดอยู่ที่นี่ แยกโฟลเดอร์ตามฟีเจอร์
│   │   ├── auth/               (login, OTP, JWT)
│   │   ├── visitor-pass/       (สร้าง/ยกเลิก QR)
│   │   ├── entry-log/          (บันทึกเข้า-ออก, ยืนยันแขกออก)
│   │   ├── announcement/       (ประกาศ)
│   │   ├── sos/                 (แจ้งเหตุฉุกเฉิน)
│   │   ├── guard-shift/        (เข้า-ออกเวร รปภ.)
│   │   ├── house/               (ข้อมูลบ้าน)
│   │   ├── transport-provider/ (ทำเนียบรถรับจ้าง)
│   │   ├── maintenance/         (แจ้งซ่อม)
│   │   ├── chat/                (แชท — มี WebSocket ด้วย)
│   │   └── patrol-log/          (บันทึกตรวจรอบ รปภ.)
│   └── common/                 ← โค้ดที่หลายฟีเจอร์ใช้ร่วมกัน
│       ├── rls/                  (ระบบกันข้อมูลรั่วข้ามหมู่บ้าน — อย่าไปแตะถ้าไม่แน่ใจ)
│       ├── push/                 (ส่ง push notification)
│       ├── files/                (เสิร์ฟรูปภาพ)
│       └── storage/              (บันทึกไฟล์ลงดิสก์)
└── .env                        ← ค่าคอนฟิกจริง (พอร์ต, secret, database url)
```

**ในแต่ละโฟลเดอร์ฟีเจอร์ (เช่น `modules/announcement/`) จะมีไฟล์แบบนี้เสมอ:**

| ไฟล์ | แก้ตอนไหน |
|---|---|
| `*.controller.ts` | อยากเพิ่ม/แก้ **URL ที่เรียกได้** (เช่น `POST /announcements`) |
| `*.service.ts` | อยาก**แก้ logic จริง** เช่น เงื่อนไข, การคำนวณ, กติกาธุรกิจ — ไฟล์นี้แก้บ่อยสุด |
| `dto/*.dto.ts` | อยากแก้ว่า**รับข้อมูลอะไรบ้าง**ตอนเรียก API (field ไหนจำเป็น/ไม่จำเป็น) |
| `*.spec.ts` | เทสอัตโนมัติของฟีเจอร์นั้น (รันด้วย `npm test` ใน apps/backend) |

**อยากแก้ฐานข้อมูล** (เพิ่ม/แก้ field, เพิ่มตารางใหม่)**:**
1. แก้ `prisma/schema.prisma`
2. รัน `npm run prisma:migrate:dev` (จะถามชื่อ migration แล้วสร้างไฟล์ใหม่ใน `migrations/` ให้เอง)
3. **ห้ามลืม** — ถ้าเพิ่มตารางใหม่ ต้องไปเพิ่มชื่อตารางใน `prisma/sql/rls-policies.sql` ด้วย ไม่งั้นตารางนั้นจะโดนบล็อกอ่านไม่ได้เลย (ระบบกันข้อมูลรั่วจะบล็อกทุกตารางที่ไม่มีชื่ออยู่ในลิสต์นี้)

---

## 3. apps/admin-web — เว็บแอดมิน (React)

```
apps/admin-web/src/
├── pages/                  ← ★ แต่ละไฟล์ = 1 หน้าเว็บที่เห็นจริง
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── AnnouncementsPage.tsx
│   ├── SosPage.tsx
│   ├── MembersPage.tsx        (จัดการสมาชิก/บ้าน)
│   ├── GuardShiftsPage.tsx
│   ├── EntryLogsPage.tsx
│   ├── TransportProvidersPage.tsx
│   ├── MaintenanceTicketsPage.tsx
│   ├── ChatPage.tsx
│   └── PatrolLogsPage.tsx
├── components/              ← ชิ้นส่วน UI ที่ใช้ซ้ำหลายหน้า
│   ├── Button.tsx, Card.tsx, Badge.tsx   (ปุ่ม/การ์ด/ป้ายสถานะมาตรฐาน)
│   ├── AppLayout.tsx           (แถบเมนูด้านบน — เพิ่มเมนูใหม่ที่นี่)
│   └── AuthedImage.tsx         (ตัวโหลดรูปแบบมีสิทธิ์ — ใช้แทน <img> ธรรมดาเสมอ)
├── lib/
│   ├── api.ts                  (ตัวเรียก backend — URL ของ backend อยู่ที่นี่)
│   ├── auth.ts                 (เก็บ session/token ไว้ในเบราว์เซอร์)
│   └── theme.ts                 (★ สีทั้งหมดของเว็บ — อยากเปลี่ยนสีธีมมาแก้ที่นี่)
└── App.tsx                    ← กำหนดว่า URL ไหนไปหน้าไหน (route)
```

**อยากรู้ว่าปุ่ม/หน้าจอ เรียก backend endpoint ไหน:** เปิดไฟล์หน้านั้นใน `pages/`
มองหา `api.get(...)` / `api.post(...)` / `api.patch(...)` — string ที่อยู่ในนั้นคือ
URL ที่ไปเรียกที่ backend (เทียบกับ `*.controller.ts` ฝั่ง backend ได้เลย)

**อยากเพิ่มหน้าใหม่:**
1. สร้างไฟล์ใหม่ใน `pages/`
2. เพิ่ม route ใน `App.tsx`
3. เพิ่มลิงก์เมนูใน `components/AppLayout.tsx`

---

## 4. apps/mobile — แอปมือถือ (Expo/React Native)

**สำคัญ: แอปเดียว ใช้ได้ทั้ง resident และ guard** — สลับหน้าจอตาม role ตอน login
ไม่ใช่ 2 แอปแยกกัน

```
apps/mobile/src/
├── screens/
│   ├── auth/                   (หน้า login, กรอก OTP — ใช้ร่วมทั้ง 2 role)
│   ├── resident/                ★ หน้าจอฝั่งลูกบ้านทั้งหมด
│   │   ├── HomeScreen.tsx
│   │   ├── InviteGuestScreen.tsx, QrDisplayScreen.tsx
│   │   ├── EntryHistoryScreen.tsx
│   │   ├── AnnouncementsScreen.tsx
│   │   ├── TransportScreen.tsx
│   │   ├── MaintenanceScreen.tsx, CreateMaintenanceScreen.tsx
│   │   ├── ChatListScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── guard/                    ★ หน้าจอฝั่ง รปภ. ทั้งหมด
│   │   ├── HomeScreen.tsx
│   │   ├── ScanQrScreen.tsx, ManualEntryScreen.tsx, ExitConfirmScreen.tsx
│   │   ├── SosListScreen.tsx
│   │   ├── PatrolLogScreen.tsx
│   │   ├── ChatListScreen.tsx
│   │   └── ProfileScreen.tsx
│   └── shared/                  (หน้าที่ทั้ง 2 role ใช้ร่วมกัน เช่น ChatRoomScreen)
├── navigation/                 ← ★ กำหนดว่าแท็บ/เมนูมีอะไรบ้าง กดแล้วไปหน้าไหน
│   ├── ResidentTabNavigator.tsx  (แท็บด้านล่างฝั่งลูกบ้าน)
│   ├── GuardTabNavigator.tsx     (แท็บด้านล่างฝั่ง รปภ.)
│   └── RootNavigator.tsx         (ตัดสินว่าจะโชว์ฝั่งไหนหลัง login)
├── components/                 (Button, Card, Badge, Avatar, SosHoldButton — ใช้ซ้ำ)
├── lib/
│   ├── api.ts                    (ตัวเรียก backend)
│   ├── theme.ts                   (★ สีทั้งหมดของแอป)
│   └── push.ts                    (ตั้งค่า push notification)
├── app.json                     ← ★ คอนฟิกแอป (ชื่อแอป, ไอคอน, สิทธิ์ที่ขอ, plugin)
│                                    **จุดที่เคยพังเพราะตั้งค่าปลูกอินชนกัน (ดูข้อ 6)**
├── eas.json                     ← คอนฟิกตอน build เป็น .apk (มี LAN IP ของ backend ฝังอยู่)
└── .env.local                    (ไม่ถูกเก็บใน git — ใช้ตอน dev ผ่าน Expo Go เท่านั้น)
```

**อยากเพิ่มหน้าจอใหม่:**
1. สร้างไฟล์ใหม่ใน `screens/resident/` หรือ `screens/guard/`
2. เพิ่มเข้า navigator ที่เกี่ยวข้อง (`ResidentTabNavigator.tsx`/`GuardTabNavigator.tsx`)
   และเพิ่ม type ใน `navigation/types.ts`

**สำคัญมาก — ทุกครั้งที่แก้โค้ดในนี้แล้วอยากทดสอบบนมือถือจริง (ไม่ใช่ Expo Go):**
ต้อง **build .apk ใหม่เสมอ** ด้วยคำสั่ง (รันใน `apps/mobile/`):
```bash
npx eas-cli build --platform android --profile preview --non-interactive
```
รอ 5-15 นาที จะได้ลิงก์ติดตั้งใหม่ — โค้ดแก้แล้วไม่ขึ้นเองบนเครื่องที่ติดตั้งแอปไว้แล้ว
ต้องโหลดตัวใหม่ทับทุกครั้ง

---

## 5. ที่ที่มักต้องแก้บ่อยที่สุด (Quick Reference)

| อยากแก้... | ไปที่ไฟล์ |
|---|---|
| สีธีมทั้งแอป (เว็บ) | `apps/admin-web/src/lib/theme.ts` |
| สีธีมทั้งแอป (มือถือ) | `apps/mobile/src/theme.ts` |
| กติกา/เงื่อนไขฟีเจอร์ใดฟีเจอร์หนึ่ง | `apps/backend/src/modules/<ชื่อฟีเจอร์>/*.service.ts` |
| หน้าตา/ข้อความในหน้าเว็บ | `apps/admin-web/src/pages/<ชื่อหน้า>.tsx` |
| หน้าตา/ข้อความในแอปมือถือ | `apps/mobile/src/screens/<resident หรือ guard>/<ชื่อหน้า>.tsx` |
| เพิ่ม field ใหม่ในฐานข้อมูล | `apps/backend/prisma/schema.prisma` แล้ว `npm run prisma:migrate:dev` |
| เมนู/แท็บที่กดได้ (เว็บ) | `apps/admin-web/src/components/AppLayout.tsx` |
| เมนู/แท็บที่กดได้ (มือถือ) | `apps/mobile/src/navigation/*TabNavigator.tsx` |
| ข้อความ error ที่ผู้ใช้เห็น | มักอยู่ในไฟล์หน้าจอ/`.service.ts` ตรงๆ ที่ error นั้นเกิด (ค้นคำใน error message ด้วย VS Code Search ทั้งโปรเจกต์ตรงๆ ได้เลย เร็วสุด) |
| พอร์ตที่ backend รัน (default 3001) | `apps/backend/.env` |
| ราคา/API key ต่างๆ (secret) | `apps/backend/.env` (ไม่ถูกเก็บใน git ห้ามลบ) |

---

## 6. บั๊กที่เคยเจอแล้ว — กันเจอซ้ำ

- **`EADDRINUSE` ตอน start backend** → เช็คก่อนว่ารันอยู่แล้วจริงไหมด้วย
  `curl http://localhost:3001/health` ถ้าได้ผลกลับมาไม่ต้อง start ซ้ำ (ระบบมี
  auto-kill พอร์ตเก่าให้แล้วตั้งแต่รอบที่แก้ไป)
- **แก้โค้ดมือถือแล้วไม่เห็นผลบนมือถือจริง** → ต้อง build .apk ใหม่เสมอ (ดูข้อ 4)
- **รูปภาพไม่ขึ้นในเว็บ Admin** → ถ้าเปิดเว็บทิ้งไว้นานเกิน 15 นาทีแล้วรูปหาย ให้ reload
  หน้าเว็บ (token หมดอายุ — ระบบ refresh อัตโนมัติแล้วแต่บาง edge case ต้อง reload เอง)
- **เพิ่ม Expo plugin ใหม่ใน `app.json` แล้วกล้อง/สิทธิ์อื่นหายไป** → เช็คว่า plugin
  ใหม่ไม่ได้ตั้งค่า permission เป็น `false` ทับสิทธิ์ที่ plugin อื่นต้องใช้ (เคยเกิดจริง
  — ดู `apps/mobile/app.json`'s `expo-image-picker` config เป็นตัวอย่าง)
- **เพิ่มตารางใหม่ในฐานข้อมูลแล้ว query ไม่เจอข้อมูลเลย (ได้ผลว่างเปล่าตลอด)** →
  ลืมเพิ่มชื่อตารางใน `apps/backend/prisma/sql/rls-policies.sql` เกือบทุกครั้ง — เป็น
  บั๊กที่เกิดซ้ำหลายรอบในโปรเจกต์นี้ เช็คไฟล์นี้ก่อนเสมอเวลาตารางใหม่ "หาไม่เจอ"
