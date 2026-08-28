# MVP Backlog — ระบบความปลอดภัยและอำนวยความสะดวกหมู่บ้าน

อ้างอิง: `village-security-app-spec.md` (source of truth) — เอกสารนี้แปลง scope ข้อ 0 และ 4 (MVP: Auth, Visitor QR + Entry/Exit Log, Announcement, SOS, Admin Dashboard บางส่วน) เป็น backlog ระดับ implementation

---

## 1. Scope สรุป

**อยู่ใน scope MVP รอบนี้ (backend API + admin web เท่านั้น ไม่มี mobile app จริง):**
- Auth: login ด้วยเบอร์โทร + OTP, ออก JWT ที่มี `village_id` + `role`
- Visitor QR: สร้าง/revoke QR, entry log (scan/manual), exit-confirm flow (ไม่ auto-close)
- Announcement: สร้าง/ดึงฟีด/read receipt, 3 ระดับความสำคัญ, target scope
- SOS/Emergency: trigger, routing ผ่าน `guard_shifts` (on_duty เท่านั้น), acknowledge
- Admin Dashboard (เว็บ): จัดการประกาศ, ดู SOS, จัดการสมาชิก/บ้านพื้นฐาน, จัดการ guard shift พื้นฐาน
- Multi-tenant foundation: `villages` เป็น tenant หลัก, RLS กัน tenant รั่วข้ามหมู่บ้าน (จำเป็นต่อทุกโมดูลข้างบน จึงรวมเป็น epic พื้นฐานก่อน Auth)

**ไม่อยู่ใน scope รอบนี้ (เฟส 2/3 ตามสเปก):** Chat, ทำเนียบลูกบ้าน, แจ้งซ่อม (Maintenance), จองพื้นที่ส่วนกลาง (Booking), ชำระเงิน (Payment), LPR/CCTV, แอปมือถือจริงของลูกบ้าน/รปภ. (มีแค่ API รองรับให้ทีม mobile ต่อยอดภายหลัง)

---

## 2. Backlog แบ่งตาม Epic

### Epic 0 — Platform Foundation & Multi-tenant Setup

**เหตุผลที่ต้องมี:** สเปกข้อ 3.2/3.3 กำหนดว่าทุกตารางระดับบนต้องมี `village_id` และทุก endpoint (ยกเว้น `/auth/*` และ scan QR ของแขก) ต้องกรองข้อมูลด้วย `village_id` จาก JWT เท่านั้น ห้าม trust จาก client — เป็นรากฐานที่ทุก epic อื่นต้องพึ่งพา

**Acceptance Criteria (จากสเปก 3.2, 3.3, 3.4):**
- มีตาราง `villages` เป็น tenant หลัก, ตารางบนสุด (users, houses) มีคอลัมน์ `village_id` ตรง, ตารางลูก (visitor_passes, entry_logs, sos_alerts ฯลฯ) denormalize `village_id` ไว้ด้วย
- มี Row-Level Security (RLS) ระดับ PostgreSQL กัน tenant data รั่วข้ามหมู่บ้านตั้งแต่ชั้น database
- ทุก endpoint (ยกเว้น auth/scan) แนบ `village_id` จาก JWT อัตโนมัติ ไม่รับค่าจาก client

**Implementation Tasks:**
- [ ] Setup project skeleton: NestJS + PostgreSQL + Prisma (ตาม tech stack แนะนำในสเปก 3.1)
- [ ] Prisma schema: `villages`, `users`, `houses`, `house_members`
- [ ] Migration + seed script (sample village, admin user, sample house)
- [ ] Middleware/interceptor: decode JWT → inject `village_id`/`role`/`user_id` เข้า request context
- [ ] เขียน PostgreSQL RLS policy สำหรับทุกตารางที่มี `village_id` (ใช้ session variable ผูกกับ context ด้านบน)
- [ ] Integration test: ยืนยันว่า query ข้าม tenant คืนค่าว่างเสมอแม้ application layer มีบั๊ก (กันรั่วระดับ DB)
- [ ] Setup file storage (S3/Cloudflare R2): แยก bucket/permission "รูปบัตร ปชช./ทะเบียนรถ" ออกจาก "รูป entry log ทั่วไป" ตามสเปก 3.4
- [ ] Audit log table + middleware บันทึกการเข้าถึงข้อมูลอ่อนไหวโดยแอดมิน
- [ ] Rate-limiting middleware กลาง (ใช้ร่วมกับ QR creation, manual entry, SOS ในภายหลัง)
- [ ] CI pipeline พื้นฐาน (lint, unit test, build) ก่อนเริ่ม epic อื่น

**Priority:** P0 (blocker ของทุก epic) — **Dependency:** ไม่มี (เริ่มก่อนสุด)

---

### Epic 1 — Auth (เบอร์โทร + OTP, JWT)

**User Story (จากสเปก 3.4):** ในฐานะผู้ใช้ทุก role ฉันต้อง login ด้วยเบอร์โทร + OTP แทน/เสริม password เพื่อลดความเสี่ยง credential stuffing และตรงกับพฤติกรรมผู้ใช้ไทย

**Acceptance Criteria (จากสเปก 3.3):**
- `POST /auth/login` — เบอร์โทร + OTP, คืน JWT ที่มี `village_id`, `role` (และ `user_id`, `house_id` ที่เกี่ยวข้อง)
- `POST /auth/refresh` — ออก token ใหม่โดยไม่ต้อง OTP ซ้ำ
- ทุก endpoint ที่ไม่ใช่ auth/scan ต้องผ่าน RBAC ตาม role (Resident/Guard/Admin) — จากสเปก 3.4 "จำกัดสิทธิ์ตาม RBAC ทุก endpoint"

**Implementation Tasks:**
- [ ] OTP service: ส่ง OTP ผ่าน SMS provider (mock/stub สำหรับ dev env)
- [ ] Rate-limit การขอ OTP ต่อเบอร์/ต่อ IP (กัน spam และ brute force)
- [ ] JWT issuing: payload มี `village_id`, `role`, `user_id`, `house_id`, expiry ที่เหมาะสม
- [ ] Refresh token: จัดเก็บ + rotation + revoke เมื่อ logout
- [ ] `POST /auth/login` endpoint พร้อม validation (เบอร์โทร format, OTP ถูกต้อง, ไม่หมดอายุ)
- [ ] `POST /auth/refresh` endpoint
- [ ] RBAC guard/decorator (NestJS) ใช้ตรวจ role ทุก endpoint ที่ต้องป้องกัน
- [ ] Users CRUD ระดับพื้นฐาน (backend service ให้ Admin Dashboard เรียกใช้ใน Epic 5)
- [ ] Unit test: OTP expiry/reuse ถูกปฏิเสธ, JWT payload ถูกต้อง, RBAC guard บล็อก role ผิด
- [ ] Integration test: login flow ต้นจนจบ (ขอ OTP → verify → ได้ JWT → refresh)

**Priority:** P0 — **Dependency:** ต้องรอ Epic 0 (multi-tenant/DB) เสร็จก่อน; ทุก epic ถัดไปต้องรอ Epic 1 เสร็จ (ทุก endpoint ต้องมี JWT/RBAC)

---

### Epic 2 — Visitor QR + Entry/Exit Log

**User Stories (จากสเปก 2.1):**
- ในฐานะลูกบ้าน ฉันต้องการสร้าง QR Code ให้แขก เพื่อให้เข้าหมู่บ้านได้โดยไม่ต้องโทรแจ้ง รปภ. ล่วงหน้า
- ในฐานะ รปภ. ฉันต้องการสแกน QR แล้วเห็นข้อมูลแขกทันที เพื่อยืนยันตัวตนก่อนอนุญาตเข้า
- ในฐานะลูกบ้าน ฉันต้องการได้รับแจ้งเตือนทันทีเมื่อแขกของฉันมาถึงป้อมยาม

**Acceptance Criteria (จากสเปก 2.1, 3.4 — คัดตรงตามสเปก):**
- QR มีอายุใช้งานตามกำหนด (single/multi use) ใช้ซ้ำไม่ได้หลังหมดอายุ
- สแกนสำเร็จ → push notification ถึงเจ้าของบ้านภายใน 3 วิ (soft target ไม่ใช่ SLA เข้มงวด)
- ทุก entry/exit บันทึก: เวลา, ผู้บันทึก/วิธีบันทึก (QR/manual), รูปถ่าย (ถ้ามี), สถานะ
- Entry-Exit flow: QR ใบเดียวใช้ได้ทั้งเข้า-ออก สถานะ `unused → entered → exited`; **`exit_time` ต้องมีขั้นตอนยืนยัน ไม่ auto-close ทันทีที่สแกน** — ยืนยันได้ 2 ทาง (ตั้งค่าเปิดใช้ทางใดทางหนึ่งหรือทั้งคู่): (1) รปภ. สแกนที่จุดออก + กดปุ่ม "ยืนยันแขกออก" อีกครั้ง (2) push ให้เจ้าของบ้านกดยืนยันเอง
- รองรับกรณีไม่มี QR: รปภ. บันทึกด้วยมือ + ถ่ายรูปบัตร ปชช./ทะเบียนรถ
- ประวัติค้นหาย้อนหลังได้อย่างน้อย 6 เดือน
- QR revocation: `PATCH /visitor-passes/:id/revoke` ให้ลูกบ้านยกเลิก QR ได้ทันที → status `revoked` → สแกนไม่ผ่านแม้ยังไม่หมดอายุ
- รูปบัตร ปชช./ทะเบียนรถ เก็บแยก bucket, เข้ารหัส at-rest, อายุเก็บสั้นกว่า entry log ทั่วไป (เช่นลบอัตโนมัติหลัง 90 วัน)
- จำกัด rate การสร้าง QR และการบันทึก manual entry ต่อบัญชี, alert แอดมินเมื่อเกิน threshold

**Implementation Tasks:**
- [ ] Prisma schema: `visitor_passes`, `entry_logs` (ตามโครงสร้างสเปก 3.2)
- [ ] QR token generator: signed JWT (แยกจาก auth JWT) ที่มี `pass_id`, `valid_from/to`, `usage_type`, เซ็นด้วย secret ป้องกันปลอมแปลง
- [ ] `POST /visitor-passes` — resident เท่านั้น, validate ช่วงเวลา/usage_type, apply rate-limit
- [ ] `PATCH /visitor-passes/:id/revoke` — เจ้าของ pass เท่านั้น, เปลี่ยน status → `revoked`
- [ ] `GET /visitor-passes/:token` — สำหรับ guard scan, ตรวจลายเซ็น/หมดอายุ/revoked ก่อนคืนข้อมูล
- [ ] `POST /entry-logs` — บันทึกเข้า (จาก scan หรือ manual), เปลี่ยน pass status `unused → entered`
- [ ] Manual entry: endpoint/flag รองรับกรณีไม่มี QR + upload รูปบัตร/ทะเบียน
- [ ] Photo upload service สำหรับ entry log → เชื่อม bucket แยกตาม data class (จาก Epic 0) + job auto-delete รูปบัตร ปชช. หลัง 90 วัน
- [ ] `PATCH /entry-logs/:id/confirm-exit` — รองรับ 2 วิธียืนยัน (`guard`/`resident`), บันทึก `exit_confirmed_by_user_id`, `exit_confirmation_method`
- [ ] `GET /entry-logs?house_id=&date=` — pagination, index รองรับ query ย้อนหลัง 6 เดือน
- [ ] Push notification (FCM) เมื่อสแกนเข้าสำเร็จ → แจ้งเจ้าของบ้าน
- [ ] Rate-limit endpoint สร้าง QR / manual entry ต่อ user/guard + hook แจ้ง alert แอดมินเมื่อเกิน threshold
- [ ] Design note + stub endpoint สำหรับ revoked-token sync list (เตรียมไว้ให้ guard app แบบ offline ในอนาคตดึงไปเช็คได้ — ไม่ต้องสร้าง UI ในรอบนี้)
- [ ] Unit test: QR หมดอายุปฏิเสธการสแกน, revoke แล้วสแกนไม่ผ่าน, single-use ใช้ซ้ำไม่ได้, exit ไม่ auto-close จากการสแกนอย่างเดียว
- [ ] Integration test: flow เต็ม สร้าง QR → scan entry → confirm-exit (ทั้ง 2 วิธี)

**Priority:** P0 — **Dependency:** Epic 0, Epic 1

---

### Epic 3 — Announcement

**User Story (จากสเปก 2.2):** ในฐานะแอดมิน ฉันต้องการส่งประกาศแบบเลือกระดับความสำคัญ เพื่อให้ลูกบ้านรับรู้ตามความเร่งด่วน

**Acceptance Criteria (จากสเปก 2.2):**
- ประกาศแบ่ง 3 ระดับ: ปกติ/สำคัญ/ฉุกเฉิน — สี/เสียงแจ้งเตือนต่างกัน, ระดับฉุกเฉินส่ง push + SMS สำรอง
- แอดมินกำหนดกลุ่มเป้าหมายได้ (ทั้งหมู่บ้าน/โซน/บ้านเฉพาะเลขที่)
- เก็บสถานะการอ่าน (read receipt) ยืนยันว่าลูกบ้านเห็นประกาศสำคัญแล้ว

**Implementation Tasks:**
- [ ] Prisma schema: `announcements`, `announcement_reads`
- [ ] `POST /announcements` — admin เท่านั้น, validate `level`, `target_scope` (all/zone/house)
- [ ] `GET /announcements` — ดึงฟีดกรองตาม target_scope ของผู้ใช้ (ใช้ house/zone จากตาราง houses)
- [ ] `POST /announcements/:id/read` — บันทึก read receipt แบบ idempotent (ไม่ insert ซ้ำ)
- [ ] Push notification service ต่อระดับความสำคัญ (สี/เสียงจัดการฝั่ง client ในอนาคต, backend ส่ง metadata `level`)
- [ ] SMS fallback สำหรับประกาศระดับฉุกเฉิน (integration กับ SMS provider)
- [ ] Target-scope resolution logic: resolve รายชื่อ user ปลายทางจาก scope (all/zone/house) ก่อนส่ง notification
- [ ] Unit test: target scope filter ถูกต้อง (zone/house เฉพาะ ไม่หลุดข้ามกลุ่ม), read receipt ไม่ duplicate
- [ ] Integration test: สร้างประกาศระดับฉุกเฉิน → ยืนยันว่า push + SMS ถูก trigger

**Priority:** P0 — **Dependency:** Epic 0, Epic 1

---

### Epic 4 — SOS / Emergency Alert

**User Story (จากสเปก 2.2):** ในฐานะลูกบ้าน ฉันต้องการกดปุ่ม SOS เมื่อเกิดเหตุฉุกเฉิน เพื่อแจ้ง รปภ./เพื่อนบ้านใกล้เคียงทันที

**Acceptance Criteria (จากสเปก 2.2):**
- ปุ่ม SOS ต้องกดค้างอย่างน้อย 2 วินาที (ฝั่ง client — backend รับ payload หลัง client ยืนยันแล้ว)
- ส่งพิกัด GPS + เลขที่บ้านไปยัง **รปภ. ที่กำลังปฏิบัติหน้าที่เท่านั้น** — query จาก `guard_shifts` ที่ `status = on_duty` ณ เวลานั้น ห้ามส่งหา รปภ. ที่เลิกกะแล้ว
- ส่งถึงเพื่อนบ้านในระยะที่ตั้งค่าไว้ได้ (optional, ใช้ `houses.latitude/longitude`)
- SOS endpoint ต้องมี rate-limit ป้องกันสแปม แต่ไม่บล็อกจนเหตุฉุกเฉินจริงส่งไม่ทัน (จากสเปก 3.4)

**Implementation Tasks:**
- [ ] Prisma schema: `sos_alerts`, `guard_shifts`
- [ ] Guard shift API พื้นฐาน: `POST`/`PATCH /guard-shifts` (ตั้ง on_duty/off_duty) — จำเป็นสำหรับ routing, ใช้จาก Admin Dashboard ใน Epic 5
- [ ] `POST /sos-alerts` — resident เท่านั้น, validate `house_id`, `latitude/longitude`
- [ ] Routing logic: query `guard_shifts WHERE status='on_duty' AND village_id=...` ณ เวลา trigger → ส่ง push เฉพาะกลุ่มนี้
- [ ] Optional: notify เพื่อนบ้านในระยะที่กำหนด (คำนวณระยะจาก `houses.latitude/longitude`, ตั้งค่ารัศมีได้)
- [ ] `PATCH /sos-alerts/:id/acknowledge` — guard เท่านั้น, เปลี่ยน status `pending → acknowledged`, บันทึก `acknowledged_by_guard_id`
- [ ] Rate-limit ต่อ user แบบ cooldown (ไม่ blanket-block ทั้ง endpoint เพื่อไม่ปิดกั้นเหตุจริง)
- [ ] Real-time delivery ไปยัง guard ที่ on-duty (WebSocket หรือ FCM push ตาม stack ที่เลือก)
- [ ] Unit test: routing ส่งถึงเฉพาะ on_duty guard, exclude off_duty, acknowledge เปลี่ยน status ถูกต้อง
- [ ] Integration test: trigger SOS → guard ที่ on_duty ได้รับ → acknowledge สำเร็จ; guard off_duty ไม่ได้รับ

**Priority:** P0 — **Dependency:** Epic 0, Epic 1 (guard_shifts data ใช้ร่วมกับ Epic 5 สำหรับ UI จัดการ)

---

### Epic 5 — Admin Dashboard (เว็บ) — เฉพาะส่วนรองรับ 4 โมดูล MVP

**User Story (อิงสเปก 1.3):** ในฐานะแอดมิน ฉันต้องการหน้าเว็บจัดการประกาศ ดูรายการ SOS และจัดการสมาชิก/บ้านพื้นฐาน เพื่อดำเนินงานหมู่บ้านได้โดยไม่ต้องเรียก API ตรง

**Acceptance Criteria (derived จากสเปก 1.3 + 2.2 + 3.3, จำกัดเฉพาะ 4 โมดูล MVP):**
- แอดมิน login ด้วยเบอร์โทร+OTP เช่นเดียวกับ role อื่น ผ่าน guard route ตาม role
- จัดการประกาศ: สร้าง/แก้ไข/ลบ, เลือกระดับความสำคัญ, กำหนดกลุ่มเป้าหมาย
- ดู SOS: รายการ sos_alerts พร้อมสถานะ/พิกัดบ้าน, ปุ่มโทรกลับ (ดูอย่างเดียว — acknowledge ทำโดย guard)
- จัดการสมาชิก/บ้านพื้นฐาน: เพิ่ม/ลบลูกบ้าน, ผูกบ้านเลขที่, จัดการสิทธิ์ รปภ., จัดการ guard shift (on_duty/off_duty)

**Implementation Tasks:**
- [ ] Setup React admin project + auth login page (เบอร์โทร+OTP) + route guard ตาม role (P0)
- [ ] หน้าจัดการประกาศ: list/create/edit/delete, เลือกระดับ, เลือก target scope (P0 — จำเป็นสำหรับทดสอบ flow ประกาศทั้งระบบ)
- [ ] หน้า SOS dashboard: รายการ real-time (pending/acknowledged/resolved), แสดงพิกัด/เลขที่บ้าน, ปุ่มโทรกลับ (`tel:` link) (P0 — จำเป็นสำหรับ ops งานจริง)
- [ ] หน้าจัดการสมาชิก/บ้าน: CRUD users (resident/guard), ผูก house_no, list ตามโซน (P1)
- [ ] หน้าจัดการ guard shift: assign on_duty/off_duty ต่อ รปภ. (P1 แต่ต้องมีอย่างน้อย manual toggle ก่อน SOS ทดสอบจริงได้)
- [ ] หน้า entry log พื้นฐาน (view/search ตาม house_id/date) เพื่อ oversight (P1)
- [ ] Frontend route guard sync กับ backend RBAC (กันแอดมินเห็นข้อมูลผิด role)
- [ ] E2E test (Playwright/Cypress) critical flow: login → สร้างประกาศ → ดู SOS list → toggle guard shift

**Priority:** P0 สำหรับ "จัดการประกาศ" และ "ดู SOS" (จำเป็นต่อการใช้งาน core flow จริง) / P1 สำหรับส่วนจัดการสมาชิก/บ้าน/guard shift UI และ entry log view — **Dependency:** Epic 1–4 (ต้องมี API ให้เรียกก่อน)

---

## 3. ลำดับความสำคัญและ Dependency

| Epic | Priority | Depends on | หมายเหตุ |
|---|---|---|---|
| 0. Platform Foundation & Multi-tenant | P0 | — | ต้องเสร็จก่อนทุก epic |
| 1. Auth | P0 | Epic 0 | ทุก endpoint ที่เหลือต้องมี JWT/RBAC จาก epic นี้ |
| 2. Visitor QR + Entry/Exit Log | P0 | Epic 0, 1 | พัฒนาขนานกับ Epic 3, 4 ได้ |
| 3. Announcement | P0 | Epic 0, 1 | พัฒนาขนานกับ Epic 2, 4 ได้ |
| 4. SOS / Emergency | P0 | Epic 0, 1 | ต้องมี `guard_shifts` (สร้างใน epic นี้เอง) — พัฒนาขนานกับ Epic 2, 3 ได้ |
| 5. Admin Dashboard (เว็บ) | P0 (ประกาศ, SOS view) / P1 (ส่วนที่เหลือ) | Epic 1–4 | เริ่ม UI shell/login ขนานได้ตั้งแต่ Epic 1 เสร็จ แต่ฟีเจอร์แต่ละหน้าต้องรอ API ของ epic ที่เกี่ยวข้อง |

**แนวทางลำดับการทำงานจริง:** Epic 0 → Epic 1 → (Epic 2, 3, 4 ขนานกัน โดยทีม backend แบ่งงานตาม module) → Epic 5 ทยอยต่อ UI ทันทีที่แต่ละ API ของ Epic 2/3/4 พร้อม (ไม่ต้องรอครบทั้งหมด)

---

## 4. Definition of Done ของ MVP รอบนี้

- Backend: endpoint ทั้งหมดตามสเปก 3.3 ในส่วน Auth/Visitor Pass/Entry-logs/Announcements/SOS ใช้งานได้จริง ผ่าน RBAC + `village_id` filter จาก JWT ทุก endpoint และ RLS ระดับ DB active
- Auth: login ด้วยเบอร์โทร+OTP และ refresh token ทำงานครบ end-to-end
- Visitor QR: ครบ flow สร้าง → scan entry → confirm-exit (ทั้ง guard และ resident confirm) → revoke ได้ทันที และ QR ที่ revoked/expired สแกนไม่ผ่าน
- Announcement: สร้าง/ดึงฟีดตาม target scope/read receipt ทำงานถูกต้อง, ระดับฉุกเฉินยิง push+SMS จริง
- SOS: trigger → routing ถึงเฉพาะ guard on_duty → acknowledge ได้, มี rate-limit ที่ไม่บล็อกเหตุจริง
- Admin Dashboard: login ได้, จัดการประกาศได้ครบ, เห็นรายการ SOS พร้อมพิกัด/ปุ่มโทรกลับ, จัดการสมาชิก/บ้าน/guard shift พื้นฐานได้
- Automated test: unit test ครอบคลุม critical path ที่ระบุไว้ในแต่ละ epic ผ่านหมดใน CI, มี integration test อย่างน้อย 1 เคสต่อ epic
- Security/PDPA: entry_logs เก็บย้อนหลังได้ 6 เดือน, รูปบัตร ปชช./ทะเบียนรถ แยก bucket + ลบอัตโนมัติหลัง 90 วัน, มี audit log การเข้าถึงข้อมูลอ่อนไหวโดยแอดมิน, ไม่มี secret ฝังในโค้ด
- API มีเอกสาร (OpenAPI/Swagger) พร้อมให้ทีม mobile ต่อยอดในเฟสถัดไป (แม้ยังไม่สร้างแอปมือถือใน MVP นี้)
- Deploy ขึ้น staging environment และผ่าน smoke test ของทุก flow หลักก่อนปิด MVP

**Out of scope ยืนยันอีกครั้ง (ห้ามทำในรอบนี้):** Chat, Maintenance ticket, Facility booking, Payment, LPR/CCTV, mobile app จริงของลูกบ้าน/รปภ.
