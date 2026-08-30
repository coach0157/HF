# Phase 2 Backlog — ระบบความปลอดภัยและอำนวยความสะดวกหมู่บ้าน

อ้างอิง: `village-security-app-spec.md` ข้อ 2.1 (Access Control push trigger),
2.2 (Announcement/SOS push trigger), 2.3 (Chat), 2.4 (Maintenance), 2.7
(Transport Directory), ข้อ 4 (Roadmap — เฟส 2 = 4-6 สัปดาห์) — เอกสารนี้แปลง
scope เฟส 2 เป็น backlog ระดับ implementation ในรูปแบบเดียวกับ
[`MVP_BACKLOG.md`](./MVP_BACKLOG.md) ต่อจาก Epic 0-7 เดิม สถาปัตยกรรม/schema
ที่ตัดสินใจไว้สำหรับ 3 epic แรก (8-10) ถูกบันทึกเป็น ADR/decision note ใน
[`ARCHITECTURE.md`](./ARCHITECTURE.md) §8 — **Epic 11 (Push Notifications)**
เพิ่มเข้ามาภายหลัง (ผู้ใช้ขอเพิ่มหลัง Epic 8-10 เสร็จและเทสผ่านแล้ว) มี
ADR ของตัวเองที่ ARCHITECTURE.md ADR-006

---

## 1. Scope สรุป

**อยู่ใน scope เฟส 2 รอบนี้ (backend API + admin-web + mobile):**
- **Epic 8 — Chat:** แชท 1:1 ลูกบ้าน-นิติบุคคล/รปภ. + แชทกลุ่มหมู่บ้าน (WebSocket จริง)
- **Epic 9 — Maintenance:** แจ้งซ่อม+รูป → ใบงาน (เลขที่ ticket) → มอบหมายช่าง → ติดตามสถานะ
- **Epic 10 — Transport Directory:** ทำเนียบรถรับจ้าง/แท็กซี่ที่แอดมินดูแล ลูกบ้านกดโทรออก (`tel:`) — **ไม่ใช่การเชื่อม API เรียกรถจริง** (แทนที่ "ทำเนียบลูกบ้าน" เดิมที่ถูกตัดออกตามข้อ 2.7 ของสเปก)
- **Epic 11 — Push Notifications:** ปิด gap "push notification stub" ที่ถูก report
  ไว้ตั้งแต่ MVP Epic 2/3/4 (entry-log/announcement/sos) และ Phase 2 Epic 8
  (chat) ให้เป็นการส่งจริงผ่าน **Expo Push Notification Service** — 4 trigger:
  สแกน QR เข้าสำเร็จ, SOS, ประกาศ, ข้อความแชทใหม่ (ดูรายละเอียดด้านล่าง)

**Dependency กับของเดิม:** ทั้ง 3 epic พึ่งพา **เฉพาะ Epic 0 (multi-tenant/RLS
foundation) และ Epic 1 (Auth/RBAC)** เท่านั้น — ไม่ผูกกับ Epic 2-7 (Visitor QR,
Announcement, SOS, Admin Dashboard เดิม, Mobile scaffold เดิม) ยกเว้นการใช้
JWT/RBAC guard และ pattern `getTenantPrismaClient()` ที่มีอยู่แล้วร่วมกัน จึง
พัฒนาขนานกับงาน maintenance ของ MVP เดิมได้เต็มที่ และพัฒนาขนานกันเองระหว่าง 3
epic นี้ได้เช่นกัน (ดู §3 สำหรับคำแนะนำลำดับถ้าทำโดยทีมเดียว)

**Schema:** `ChatRoom`/`ChatParticipant`/`ChatMessage` และ `MaintenanceTicket`
มีอยู่แล้วตั้งแต่รอบ MVP (สร้างไว้ล่วงหน้าเพื่อให้ table shape นิ่ง) — รอบนี้
ตรวจสอบแล้วและ**แก้ schema จริงแล้ว** (migration ใหม่ประยุกต์ใช้แล้วกับ DB
local) ดูรายละเอียดทั้งหมดใน ARCHITECTURE.md §8:
- `ChatRoom` เพิ่ม `residentsCanPost`, `ChatParticipant` เพิ่ม `lastReadAt`
- `MaintenanceTicket.category` เปลี่ยนจาก `String` → enum `MaintenanceCategory`, เพิ่ม `ticketNumber` (unique ต่อหมู่บ้าน) + ตารางใหม่ `MaintenanceTicketCounter` สำหรับออกเลขที่ใบงานแบบ atomic
- ตารางใหม่ทั้งหมด: `TransportProvider` (+ enum `TransportProviderType`), `MaintenanceTicketCounter`

**Epic 11's schema (เพิ่มภายหลัง Epic 8-10 เสร็จ):** ตารางใหม่ `PushToken`
(unique ต่อ `(userId, expoPushToken)`, RLS เปิดแล้ว) — **แก้ schema จริงแล้ว**
(migration `20260828223706_add_push_tokens` +
`20260828223707_rls_push_tokens` ประยุกต์ใช้แล้วกับ DB local) ดูรายละเอียด
เต็มใน ARCHITECTURE.md ADR-006

**ไม่อยู่ใน scope รอบนี้:** business logic/controller/service, UI จริงของ
Epic 8-10 ทั้ง 3 โมดูล (backend module ยังไม่มี
`src/modules/chat|maintenance|transport-provider/` เลย ตอนที่เขียนแผนนี้ —
Dev agent รอบถัดไปเริ่มจากศูนย์โดยอิง schema/ADR ที่ทำไว้แล้วในรอบนี้),
ธุรกิจ logic การส่ง push จริงของ Epic 11 (ดูหัวข้อ Epic 11 ด้านล่างสำหรับ
ขอบเขตที่ชัดเจน), Facility Booking/Payment/LPR (เฟส 3)

---

## 2. Backlog แบ่งตาม Epic

### Epic 8 — Chat (WebSocket)

**User Stories (จากสเปก 2.3 — ไม่มี user story ตรงในสเปก แปลงจาก AC):**
- ในฐานะลูกบ้าน ฉันต้องการแชท 1:1 กับนิติบุคคล/รปภ. เพื่อสอบถามหรือแจ้งเรื่องได้โดยตรงโดยไม่ต้องโทร
- ในฐานะลูกบ้าน ฉันต้องการดู/พูดคุยในกลุ่มหมู่บ้าน เพื่อรับรู้ข่าวสารร่วมกับเพื่อนบ้านและนิติบุคคล
- ในฐานะแอดมิน/รปภ. ฉันต้องการแชทตอบลูกบ้านที่ติดต่อเข้ามา รวมถึงรับแจ้งเบาะแส/รายงานปัญหาพร้อมรูปได้ตรงจุด

**Acceptance Criteria (จากสเปก 2.3 + schema decision ใน ARCHITECTURE.md §8):**
- แชท 1:1 ระหว่างลูกบ้าน-นิติบุคคล และ ลูกบ้าน-รปภ. (ห้องแบบ `DIRECT`)
- แชทกลุ่มหมู่บ้าน (ห้องแบบ `GROUP`) — ค่าเริ่มต้น broadcast แบบ read-only จากแอดมินเท่านั้น (`ChatRoom.residentsCanPost = false`) แอดมินตั้งค่าเปิดให้ลูกบ้านโพสต์ได้ต่อห้อง (`residentsCanPost = true`)
- แนบรูปภาพในข้อความได้ (ใช้ file-storage service เดียวกับ entry-log's bucket ทั่วไป — รูปแชทไม่ใช่ข้อมูลอ่อนไหวระดับบัตร ปชช.)
- ประวัติแชทเก็บถาวร ค้นหา/ดึงย้อนหลังแบบ pagination ได้ (`GET /chat-rooms/:id/messages`)
- WebSocket connection ต้อง auth ด้วย JWT เดียวกับ REST (ไม่ใช่ token แยก) และ RLS/tenant isolation ต้องทำงานถูกต้องกับทุก query ที่เกิดจาก WS event เช่นเดียวกับ REST request (ดู ADR-005)
- การเข้าห้องแชท (join room) ต้องเช็คสิทธิ์ระดับห้อง (เป็น `ChatParticipant` ของห้องนั้นจริง) เพิ่มเติมจาก RLS ระดับหมู่บ้าน — RLS ป้องกันข้ามหมู่บ้านเท่านั้น ไม่ป้องกันข้ามห้องภายในหมู่บ้านเดียวกัน

**Implementation Tasks — Backend:**
- [ ] เพิ่ม dependency: `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` (เวอร์ชันคู่กับ Nest 11.x ตาม ADR §4 เดิม — ดู ARCHITECTURE.md §8.1 สำหรับเวอร์ชันแนะนำ)
- [ ] Refactor: แยก transaction-wrap + `SET LOCAL app.current_village_id/current_user_id/current_role` logic ออกจาก `RlsInterceptor` เป็น helper กลาง (`common/rls/tenant-transaction.ts`) ให้ `RlsInterceptor` (HTTP) และ gateway ใหม่ (WS) เรียกใช้ร่วมกัน — ห้ามเขียน SET LOCAL sequence ซ้ำมือใน gateway (ADR-005)
- [ ] `ChatGateway` (`@WebSocketGateway`) — `handleConnection`: verify JWT จาก `socket.handshake.auth.token`, decode claims, เก็บใน `socket.data`, disconnect ทันทีถ้า invalid/expired
- [ ] `WsRlsInterceptor`/guard สำหรับแต่ละ `@SubscribeMessage` handler — เปิด transaction + SET LOCAL ต่อ event โดยใช้ helper ข้างบน แล้วให้ service เรียก `getTenantPrismaClient()` แบบเดียวกับ REST module
- [ ] WS events: `join_room` (verify `ChatParticipant` membership ก่อน `socket.join()`), `send_message` (persist `ChatMessage`, broadcast ไปยัง socket.io room), `mark_read` (update `ChatParticipant.lastReadAt`), `typing` (optional, ephemeral ไม่ persist)
- [ ] REST: `POST /chat-rooms` (find-or-create ห้อง DIRECT ระหว่าง 2 คน; สร้างห้อง GROUP เฉพาะ ADMIN), `GET /chat-rooms` (รายการห้องของ user ปัจจุบัน พร้อม unread count จาก `lastReadAt`), `GET /chat-rooms/:id/messages?page=&pageSize=` (ประวัติ, ใช้ index `[villageId, chatRoomId, createdAt]` ที่มีอยู่แล้ว)
- [ ] Image upload endpoint สำหรับแนบรูปในแชท (คืน URL แล้วส่งผ่าน WS `send_message` พร้อม `imageUrl`)
- [ ] Village group room provisioning: สร้าง `GROUP` ChatRoom เริ่มต้น 1 ห้องต่อหมู่บ้าน (lazy-create ตอน admin คนแรก login หรือ seed ตอนสร้างหมู่บ้าน — ตัดสินใจตอน implement) + sync participant (เพิ่มลูกบ้าน/รปภ./แอดมินใหม่เข้าห้องอัตโนมัติ)
- [ ] Rate-limit `send_message` ต่อ user (ป้องกัน spam/flood คล้าย pattern `perUserThrottle` ที่ใช้กับ SOS/entry-log)
- [ ] Unit test: WS auth ปฏิเสธ token ผิด/หมดอายุ, RLS กันข้ามหมู่บ้านใน WS event, กันข้ามห้อง (ไม่ใช่ participant เข้าไม่ได้), group room read-only enforcement เมื่อ `residentsCanPost=false`
- [ ] Integration test: สร้างห้อง DIRECT → ส่งข้อความ → อีกฝั่ง (WS client) ได้รับ real-time → history ผ่าน REST ตรงกัน; group broadcast ทดสอบ 1 เคส

**Implementation Tasks — admin-web ("นิติบุคคล" persona):**
- [ ] หน้าแชท: รายการห้องสนทนา (DIRECT จากลูกบ้านทุกคน + GROUP), เปิดดูข้อความ/ส่งข้อความ/แนบรูป, mark read
- [ ] Composer สำหรับ broadcast กลุ่มหมู่บ้าน (เมื่อ `residentsCanPost=false` เป็นช่องทางเดียวที่โพสต์ในกลุ่มได้)
- [ ] Socket.io client (`socket.io-client`) wiring ผูกกับ `lib/auth.ts` token เดิม, reconnect + refresh token ก่อน reconnect เมื่อ token หมดอายุ

**Implementation Tasks — mobile:**
- [ ] Resident `ChatScreen`: 3 แท็บ "นิติบุคคล" / "รปภ." / "กลุ่มหมู่บ้าน" ตาม mockup สเปก 1.1 — แต่ละแท็บ find-or-create ห้อง DIRECT ที่เหมาะสมหรือเข้าห้อง GROUP
- [ ] Guard `ChatScreen`: รายการแชท DIRECT จากลูกบ้านที่ทักเข้ามา
- [ ] `lib/chat.ts`: `socket.io-client` wiring แบบเดียวกับ admin-web, reuse `lib/auth.ts`/`lib/api.ts` token
- [ ] แนบรูปผ่าน `expo-image-picker` (dependency ใหม่ — ยังไม่มีใน `apps/mobile` วันนี้)
- [ ] Push notification เมื่อมีข้อความใหม่ตอนแอปอยู่ background — ใช้ FCM gap เดียวกับที่ report ไว้แล้วใน MVP Epic 6/7 (ยังไม่มี push token registration endpoint) ไม่ใช่ gap ใหม่

**Priority:** P1 — **Dependency:** Epic 0 (multi-tenant/RLS), Epic 1 (Auth/JWT) เท่านั้น

---

### Epic 9 — Maintenance (แจ้งซ่อม)

**User Stories (แปลงจาก AC สเปก 2.4):**
- ในฐานะลูกบ้าน ฉันต้องการแจ้งปัญหาซ่อมแซมพร้อมรูปถ่ายและหมวดหมู่ เพื่อให้นิติบุคคลรับทราบและดำเนินการได้เร็ว
- ในฐานะลูกบ้าน ฉันต้องการติดตามสถานะใบงานซ่อมของฉัน (รับเรื่อง/กำลังดำเนินการ/เสร็จสิ้น) เพื่อรู้ความคืบหน้าโดยไม่ต้องโทรถาม
- ในฐานะแอดมิน ฉันต้องการมอบหมายงานซ่อมให้ทีมช่างพร้อมกำหนดวันนัดหมาย เพื่อบริหารจัดการงานซ่อมเป็นระบบ

**Acceptance Criteria (จากสเปก 2.4 + schema decision ใน ARCHITECTURE.md §8):**
- ลูกบ้านแจ้งปัญหาพร้อมหมวดหมู่ (ไฟฟ้า/ประปา/ถนน/อื่นๆ — enum `MaintenanceCategory` แล้ว) + รูปแนบ + คำอธิบาย
- ระบบสร้างเลขที่ใบงาน (`ticketNumber`, unique ต่อหมู่บ้าน) อัตโนมัติแบบ race-safe (ผ่าน `MaintenanceTicketCounter`)
- สถานะไปข้างหน้าเท่านั้น: `OPEN` (รับเรื่อง) → `IN_PROGRESS` (กำลังดำเนินการ) → `DONE` (เสร็จสิ้น) — ปฏิเสธการข้ามขั้น/ย้อนกลับ
- แอดมินมอบหมายงานให้ทีมช่างได้ (`assignedTo` — free text, **ไม่ใช่ FK ไป User**, ดูเหตุผลใน ARCHITECTURE.md §8) พร้อมกำหนดวันนัดหมาย (`scheduledDate`)
- ลูกบ้านเห็นเฉพาะใบงานของบ้านตัวเอง, แอดมินเห็นทุกใบงานในหมู่บ้าน กรองตามสถานะ/หมวดหมู่ได้

**Implementation Tasks — Backend:**
- [ ] สร้าง module `src/modules/maintenance/` (controller/service/dto ตาม pattern เดียวกับ `sos`/`entry-log`)
- [ ] `POST /maintenance-tickets` — `@Roles("RESIDENT")`, validate category/description, `houseId` มาจาก JWT claims เท่านั้น (ห้าม trust จาก client), generate `ticketNumber` แบบ atomic ภายใน transaction เดียวกับการ insert ticket (`UPDATE maintenance_ticket_counters SET last_seq = last_seq + 1 WHERE village_id = ... RETURNING last_seq`, upsert แถวถ้ายังไม่มี)
- [ ] `PATCH /maintenance-tickets/:id/status` — `@Roles("ADMIN")`, บังคับ transition ไปข้างหน้าเท่านั้น (OPEN→IN_PROGRESS→DONE), reject ข้าม/ย้อน
- [ ] `PATCH /maintenance-tickets/:id/assign` — `@Roles("ADMIN")`, set `assignedTo` + `scheduledDate`
- [ ] `GET /maintenance-tickets` — resident scope เฉพาะ `houseId` ของตัวเอง (เหมือน pattern `entry-log`'s `list()`), admin เห็นทั้งหมด + filter `status`/`category`, pagination
- [ ] `GET /maintenance-tickets/:id` — detail รวมรูป
- [ ] Photo upload — reuse `file-storage.service.ts` (bucket ทั่วไป `S3_BUCKET_ENTRY_LOGS` ไม่ใช่ sensitive bucket — รูปงานซ่อมไม่ใช่บัตร ปชช.)
- [ ] Push notification แจ้งลูกบ้านเมื่อสถานะเปลี่ยน — gap เดียวกับ FCM ที่ยังไม่ wire จริงใน MVP (report ไม่ implement, เหมือน SOS/announcement)
- [ ] Unit test: status transition guard (ปฏิเสธข้าม/ย้อน), `ticketNumber` ไม่ชนกันภายใต้การสร้างพร้อมกัน (concurrency test), resident เห็นเฉพาะใบงานบ้านตัวเอง
- [ ] Integration test: full flow สร้าง → assign → in_progress → done, เลขที่ใบงาน sequential ต่อหมู่บ้าน

**Implementation Tasks — admin-web:**
- [ ] หน้า "แจ้งซ่อม": list ทุกใบงาน (filter สถานะ/หมวดหมู่), detail view พร้อมรูป, ฟอร์ม assign (`assignedTo` + `scheduledDate`), ปุ่มเปลี่ยนสถานะ (บังคับลำดับใน UI ให้ตรงกับ backend guard)

**Implementation Tasks — mobile (resident):**
- [ ] "แจ้งซ่อม" screen: ฟอร์ม (เลือกหมวดหมู่, คำอธิบาย, ถ่ายรูปผ่าน `expo-camera`/`expo-image-picker`) → `POST /maintenance-tickets`
- [ ] รายการใบงาน + หน้ารายละเอียด/ติดตามสถานะ (badge สีตาม status คล้าย pattern announcement level)

**Priority:** P1 — **Dependency:** Epic 0, Epic 1 เท่านั้น

---

### Epic 10 — Transport Directory (ทำเนียบรถรับจ้าง)

**User Story (จากสเปก 2.7 — ตรงตัว):** ในฐานะลูกบ้าน ฉันต้องการดูรายชื่อ+เบอร์โทร
วิน/แท็กซี่ที่หมู่บ้านแนะนำ เพื่อเรียกรถโดยสารได้สะดวกโดยไม่ต้องหาเบอร์เอง

**Acceptance Criteria (จากสเปก 2.7 ตรงตัว):**
- แอดมินเพิ่ม/แก้ไข/ลบ/เปิด-ปิดการแสดงผล รายชื่อผู้ให้บริการ: ชื่อ/ชื่อเล่นคนขับ, ประเภท (วินมอเตอร์ไซค์/แท็กซี่/รถตู้/อื่นๆ — enum `TransportProviderType` แล้ว), เบอร์โทร, พื้นที่ให้บริการ/หมายเหตุ
- ลูกบ้านดูรายการที่ `isActive = true` เท่านั้น พร้อมปุ่มโทรออกทันที (`tel:` link) — **ไม่มีระบบจองคิว/ติดตามตำแหน่งรถ**
- เรียง/กรองตามประเภทได้ (optional, index `[villageId, type]` รองรับไว้แล้ว)

**Implementation Tasks — Backend:**
- [ ] สร้าง module `src/modules/transport-provider/` (controller/service/dto)
- [ ] `POST /transport-providers` — `@Roles("ADMIN")`
- [ ] `PATCH /transport-providers/:id` — `@Roles("ADMIN")` (แก้ไขทุก field รวม toggle `isActive`)
- [ ] `DELETE /transport-providers/:id` — `@Roles("ADMIN")` (ลบจริง — สเปกแยก "ลบ" ออกจาก "เปิด-ปิดการแสดงผล" เป็นคนละ action)
- [ ] `GET /transport-providers` — admin เห็นทั้งหมดรวม inactive; resident/guard เห็นเฉพาะ `isActive=true`, รองรับ `?type=` filter
- [ ] Unit test: resident ไม่เห็นรายการ inactive, admin CRUD ครบ, RLS กันข้ามหมู่บ้าน
- [ ] Integration test: สร้าง → resident list เห็น (active) → admin toggle inactive → resident list ไม่เห็นอีกต่อไป

**Implementation Tasks — admin-web:**
- [ ] หน้า "ทำเนียบรถรับจ้าง": list/create/edit/delete, toggle switch เปิด-ปิดการแสดงผล

**Implementation Tasks — mobile (resident):**
- [ ] "เรียกรถโดยสาร" screen: รายการผู้ให้บริการ active (filter ตามประเภทได้), แต่ละแถวมีปุ่มโทร (`Linking.openURL('tel:' + phone)`)

**Priority:** P1 — **Dependency:** Epic 0, Epic 1 เท่านั้น — เป็น epic ที่ complexity ต่ำสุดในเฟส 2 (CRUD ตรงไปตรงมา ไม่มี real-time/state machine)

---

### Epic 11 — Push Notifications (Expo Push Notification Service)

**บริบท:** ทุก trigger ที่ควรส่ง push ถูก report เป็น gap (TODO comment ใน
service + "documented gap, not implemented" ใน docstring) มาตั้งแต่รอบ
MVP/Phase 2 ก่อนหน้า — **routing logic (ใครควรได้รับ) implement ครบแล้วทุก
จุด**, มีแค่ transport (การส่งจริงไปเครื่อง) เป็น stub:
- `entry-log.service.ts`'s `createFromQr()` — TODO comment ระบุ "FCM push to
  `host` within ~3s" ยังไม่ทำ
- `sos.service.ts`'s `trigger()` — คืนค่า `routedToGuardUserIds` ที่ resolve
  ครบแล้ว แต่ TODO comment ระบุ "real-time delivery... not implemented"
- `announcement.service.ts`'s `create()` — คืนค่า `recipientUserIds` ที่
  resolve ครบแล้ว แต่ TODO comment ระบุ "actual push/SMS provider wiring...
  not implemented" (SMS fallback ของประกาศระดับฉุกเฉินยังคงเป็น gap เดิม
  ที่ **ไม่ต้องแก้รอบนี้** ตามที่ผู้ใช้ระบุ — เฉพาะ push)
- `chat.gateway.ts`'s `onSendMessage()` — ยังไม่มี TODO comment เพราะ chat
  ถูก implement ก่อนที่ผู้ใช้จะขอ push เพิ่ม (trigger ใหม่ล่าสุดในรอบนี้)

**Decision ที่ตัดสินใจไว้แล้ว:** ใช้ **Expo Push Notification Service**
(`expo-server-sdk-node` ฝั่ง backend, `expo-notifications` ฝั่ง mobile —
ติดตั้งอยู่แล้วตั้งแต่ scaffold รอบ MVP) แทนการเชื่อม raw Firebase FCM ตรง —
เหตุผลเต็มอยู่ใน ARCHITECTURE.md ADR-006 รวมถึง fire-and-forget vs. await
decision และ deep-link data schema

**User Stories:**
- ในฐานะลูกบ้าน ฉันต้องการได้รับแจ้งเตือนทันทีในมือถือเมื่อแขกของฉันมาถึง
  ป้อมยาม โดยไม่ต้องเปิดแอปค้างไว้ (สเปก 2.1)
- ในฐานะ รปภ. ที่กำลังปฏิบัติหน้าที่ ฉันต้องการได้รับแจ้งเตือนทันทีเมื่อมีคน
  กด SOS เพื่อตอบสนองได้เร็วที่สุด (สเปก 2.2)
- ในฐานะลูกบ้าน ฉันต้องการได้รับแจ้งเตือนเมื่อแอดมินออกประกาศ โดยเฉพาะ
  ระดับสำคัญ/ฉุกเฉิน แม้ไม่ได้เปิดแอปอยู่ (สเปก 2.2)
- ในฐานะลูกบ้าน/รปภ./แอดมิน ฉันต้องการได้รับแจ้งเตือนเมื่อมีข้อความแชทใหม่
  เข้ามาในห้องที่ฉันอยู่ โดยไม่ต้องเปิดแอปแช่ไว้ดูตลอด (เพิ่มใหม่ล่าสุด
  ต่อจาก Epic 8 เดิม)

**Acceptance Criteria (4 trigger):**
1. **สแกน QR เข้าสำเร็จ** (`entry-log.service.ts`'s `createFromQr()`) —
   ส่ง push ไปยังเจ้าของบ้าน (`pass.createdByUserId`) หลัง transaction ของ
   request ปิดแล้ว (ตาม §3.3's "don't hold the transaction open across a
   slow external call") ภายใน ~3 วิ (soft target ตามสเปก 2.1 — ไม่ใช่ SLA
   เข้มงวด, ขึ้นกับความเสถียรเครือข่าย/Expo push service) — ไม่ส่งซ้ำในกรณี
   `alreadyEntered: true` (สแกนซ้ำที่จุดออก ไม่ใช่การมาถึงใหม่)
2. **SOS ถูกกด** (`sos.service.ts`'s `trigger()`) — ส่ง push ไปยังทุก guard
   ใน `routedToGuardUserIds` (on-duty เท่านั้น, resolve ไว้แล้ว) — เป็น
   trigger ที่ **สำคัญที่สุด** (ความปลอดภัยชีวิต) จึงเป็นตัวชี้ขาดของ
   fire-and-forget decision ใน ADR-006 (ต้องไม่ให้ push ช้าไปหน่วง response
   ของ endpoint ที่ resident กำลังรอ confirm ว่า SOS ถูกบันทึกแล้ว)
3. **ประกาศระดับฉุกเฉิน (และระดับอื่นด้วย)** (`announcement.service.ts`'s
   `create()`) — ส่ง push ไปยังทุก user ใน `recipientUserIds` (resolve จาก
   target_scope ไว้แล้ว) พร้อม metadata `level` ให้ client เลือกสี/เสียง
   ตามสเปก 2.2 — **SMS fallback สำหรับระดับฉุกเฉินยังคงเป็น gap เดิมที่ไม่
   แก้รอบนี้** (ระบุไว้ชัดเจนโดยผู้ใช้)
4. **ข้อความแชทใหม่** (`chat.gateway.ts`'s `onSendMessage()`) — ส่ง push ไป
   ยัง participant ทุกคนของห้องนั้น **ยกเว้นผู้ส่งเอง** — ใช้ query
   `ChatParticipant` ของห้อง (มี pattern อยู่แล้วใน `chat.service.ts`'s
   `assertMembership`/`listRooms`) กรอง `userId !== senderId` — เป็น
   trigger ที่ผู้ใช้เพิ่งขอเพิ่มล่าสุด ไม่ได้อยู่ใน gap ที่ report ไว้เดิม
- ทุก trigger ต้อง**ไม่ throw/ไม่ block response หลัก**ถ้าการส่ง push ล้มเหลว
  (เครือข่าย Expo ล่ม, token หมดอายุ ฯลฯ) — ดู ADR-006's fire-and-forget
  decision สำหรับเหตุผลแบบ per-trigger (ไม่ใช่ blanket เดียวกันหมด)
- Deep-link data ที่แนบไปกับทุก push ต้องตรงตาม schema ที่กำหนดใน ADR-006
  (`{ type: "entry" | "sos" | "announcement" | "chat", id: string }`) ให้
  mobile ใช้ navigate ไปหน้าที่ถูกต้องตอนผู้ใช้กด notification
- Push token ต้องรองรับหลายอุปกรณ์ต่อ user (resident เปลี่ยนเครื่อง/มีสอง
  เครื่อง) และต้องลบ/ทำ inactive token ที่ Expo รายงานว่าส่งไม่สำเร็จถาวร
  (`DeviceNotRegistered` receipt error) ไม่ให้ค้างส่งซ้ำไปเรื่อยๆ

**Implementation Tasks — Backend:**
- [ ] เพิ่ม dependency `expo-server-sdk-node` (เวอร์ชันล่าสุดที่รองรับ
  Node 20+ ตาม `apps/backend/package.json`'s `engines.node` — Dev agent
  ระบุ pin เวอร์ชันแบบเดียวกับที่ ADR-004 ทำกับ `socket.io`)
- [ ] สร้าง `src/common/push/` module:
  - `push-token.service.ts` — `registerToken(userId, expoPushToken, claims)`
    (upsert บน `@@unique([userId, expoPushToken])`),
    `removeToken(userId, expoPushToken)` (สำหรับ logout — ดู mobile task
    ด้านล่าง), `listTokensForUsers(userIds: string[])` (batch lookup ข้าม
    หลาย user ในครั้งเดียว สำหรับ SOS/announcement/chat ที่ resolve
    recipient list ไว้แล้วเป็น array)
  - `push-notification.service.ts` (`PushNotificationService`) — service
    กลางที่ entry-log/sos/announcement/chat เรียกใช้ร่วมกัน มีเมธอดเดียว
    `send(userIds: string[], payload: { title, body, data })` ที่ภายใน:
    resolve userIds → tokens ผ่าน `PushTokenService`, chunk ตาม
    `expo-server-sdk-node`'s `chunkPushNotifications()` (Expo's recommended
    batching — จำกัดจำนวน notification ต่อ HTTP request), ยิงผ่าน
    `sendPushNotificationsAsync()`, log แต่ไม่ throw เมื่อ error (ตาม
    ADR-006's error-handling decision), และ (Dev agent อนาคต) ประมวลผล
    push receipt เพื่อลบ token ที่ตายแล้ว
  - `push.module.ts` — `@Global()` เหมือน `AuditModule`/`FileStorageModule`
    (ทุก feature module เรียกใช้ได้โดยไม่ต้อง import ซ้ำ), wire เข้า
    `common.module.ts`
- [ ] `POST /push-tokens` (register — `@Roles("RESIDENT", "GUARD", "ADMIN")`,
  body `{ expoPushToken: string }`, `userId` มาจาก JWT claims เท่านั้น)
- [ ] `DELETE /push-tokens` (unregister เฉพาะ token ของตัวเอง — เรียกตอน
  logout ให้เครื่องที่ logout แล้วไม่ได้รับ push อีกถ้า login คนละบัญชีบน
  เครื่องเดิม)
- [ ] เพิ่มเรียก `PushNotificationService.send(...)` ที่ 4 จุด (นอก
  transaction เสมอ ตาม §3.3's trade-off note — ดู ADR-006 สำหรับตำแหน่ง
  เรียกที่แน่นอนในแต่ละไฟล์):
  - `entry-log.service.ts`'s `createFromQr()` — แทน TODO comment เดิม
  - `sos.service.ts`'s `trigger()` — แทน TODO comment เดิม (ไม่แตะ TODO
    ของ neighbor-radius notification — ยังเป็น schema gap เดิม ไม่ใช่ scope
    รอบนี้)
  - `announcement.service.ts`'s `create()` — แทน TODO comment เดิม (SMS
    fallback ยังไม่ทำ — คง TODO ไว้)
  - `chat.gateway.ts`'s `onSendMessage()` — เพิ่มใหม่ (ไม่มี TODO เดิม)
- [ ] แก้ `.env.example`: ลบ/แทนที่ `FCM_PROJECT_ID`/`FCM_SERVICE_ACCOUNT_JSON`
  (ค้างมาจากตอนที่ยังไม่ได้ตัดสินใจ transport) ด้วย `EXPO_ACCESS_TOKEN`
  (optional — enhanced security ของ Expo push service, ไม่บังคับสำหรับ
  Expo Go/dev)
- [ ] Unit test: `PushNotificationService.send()` ไม่ throw เมื่อ Expo API
  error/timeout (mock `expo-server-sdk-node`), chunking ทำงานถูกต้องเมื่อ
  recipient list ยาวเกิน 1 chunk, `PushTokenService` upsert ไม่สร้าง row
  ซ้ำเมื่อ register token เดิมซ้ำ
- [ ] Integration test: 1 เคสต่อ trigger (mock Expo SDK ที่ transport
  boundary) ยืนยันว่า payload/data ที่ส่งตรงตาม deep-link schema (ADR-006)
  และ recipient list ตรงกับ routing logic ที่มีอยู่แล้ว (เช่น SOS ต้องไม่ส่ง
  หา guard ที่ off-duty — routing เดิมยังถูกต้อง แค่เพิ่มการยืนยันว่า
  `send()` ถูกเรียกด้วย list เดียวกับที่ routing คืนมา)

**Implementation Tasks — mobile:**
- [ ] `lib/push.ts` (ใหม่) — `registerForPushNotificationsAsync()`:
  ขอ permission (`Notifications.requestPermissionsAsync()`), ดึง
  `expo-notifications`'s `getExpoPushTokenAsync()`, เรียก
  `POST /push-tokens` ผ่าน `lib/api.ts` เดิม (pattern เดียวกับทุก
  authenticated call อื่น)
- [ ] เรียก `registerForPushNotificationsAsync()` ใน `AuthContext.tsx`
  หลัง `setSession()` สำเร็จ (ทั้ง flow login และ flow restore-session ตอน
  app เปิดใหม่ — ดู `AuthContext.tsx`'s `useEffect` ที่เรียก `getSession()`
  ตอน mount) — **ไม่ใช่**ใน `RootNavigator` เพราะต้องมี JWT ก่อนเรียก
  `POST /push-tokens` ได้ และ context คือจุดที่ session state พร้อมใช้งาน
  ก่อนสุด
- [ ] เรียก `DELETE /push-tokens` ตอน logout (หาจุด logout handler ที่มีอยู่
  แล้ว — clear secure storage) ก่อนเคลียร์ session ไม่ใช่หลัง (ต้องมี JWT
  ตอนเรียก)
- [ ] `Notifications.addNotificationResponseReceivedListener()` — handler
  กลางที่ decode `data: { type, id }` ตาม deep-link schema (ADR-006) แล้ว
  `navigation.navigate(...)` ไปหน้าที่ถูกต้องตาม `type` (สแกน/SOS/
  ประกาศ/แชท) — วางใน `RootNavigator` หรือ root component ที่มี navigation
  ref อยู่แล้ว (Dev agent ตัดสินใจตำแหน่งที่แน่นอนตอน implement)
- [ ] Foreground notification handler (`Notifications.setNotificationHandler`)
  — ตั้งค่า `shouldShowAlert: true` ให้แสดง banner แม้แอปเปิดอยู่หน้าจอ
  (ต่างจาก background ที่ OS จัดการเอง)
- [ ] Unit/component test เมื่อเริ่ม implement (ยังไม่มี test setup สำหรับ
  push flow วันนี้)

**Priority:** P1 — **Dependency:** ทุก 4 trigger endpoint มีอยู่แล้ว (Epic
2/3/4 จาก MVP, Epic 8 จาก Phase 2 รอบนี้) จึงพัฒนาได้ทันที ไม่ต้องรอ epic
ไหนเพิ่ม — งานหลักคือเพิ่ม transport ใหม่เข้าไปแทนที่ TODO ที่มีอยู่แล้ว
ไม่ใช่งาน routing logic ใหม่

---

## 3. ลำดับความสำคัญและ Dependency

| Epic | Priority | Depends on | หมายเหตุ |
|---|---|---|---|
| 8. Chat | P1 | Epic 0, 1 | Complexity สูงสุด — ต้องวาง WebSocket + RLS pattern ใหม่ (ADR-004/005) ก่อน ไม่ผูกกับ Epic 2-7 |
| 9. Maintenance | P1 | Epic 0, 1 | Complexity กลาง (state machine + atomic ticket numbering) ไม่ผูกกับ Epic 2-7 |
| 10. Transport Directory | P1 | Epic 0, 1 | Complexity ต่ำสุด — CRUD ล้วน ไม่มี real-time/state machine ไม่ผูกกับ Epic 2-7 |
| 11. Push Notifications | P1 | Epic 2, 3, 4 (MVP), Epic 8 (Phase 2) | ไม่ใช่ routing logic ใหม่ — เติม transport ที่ 4 จุด TODO เดิม + 1 จุดใหม่ (chat) เข้าไปแทน ต้องรอทุก endpoint ที่จะ trigger push มีอยู่จริงก่อน (มีครบแล้ววันนี้) |

**แนวทางลำดับการทำงานจริง:** Epic 8-10 ไม่มี dependency ระหว่างกันเอง
(schema/module แยกกันคนละตาราง) จึง**พัฒนาขนานกันได้เต็มที่**ถ้ามีมากกว่า 1 คน/
ทีมย่อย ถ้าทำโดยทีมเดียวตามลำดับ แนะนำ **Epic 10 → Epic 9 → Epic 8**
(เรียงจาก complexity ต่ำไปสูง ให้ Epic 10 เป็น "quick win" ยืนยันว่า pattern
CRUD ใหม่ทำงานถูกต้องก่อน แล้วค่อยรับความซับซ้อนของ state machine ใน Epic 9
และ WebSocket infra ใหม่ทั้งหมดใน Epic 8 ซึ่งมีความเสี่ยงทางสถาปัตยกรรมสูงสุด
ควรมีเวลา buffer มากที่สุด) **Epic 11 ทำทีหลังสุด** (ตามลำดับที่ผู้ใช้ขอเพิ่ม
จริง) แต่ไม่มี dependency ทางเทคนิคที่บังคับให้ทำทีหลัง Epic 8-10 เสร็จ
ก่อน — Epic 11's 3 ใน 4 trigger point (entry-log/sos/announcement) พร้อมใช้
ตั้งแต่ MVP เสร็จแล้ว มีแค่ trigger ที่ 4 (chat) ที่ต้องรอ Epic 8's
`chat.gateway.ts` มีอยู่จริงก่อน

---

## 4. Definition of Done ของเฟส 2 รอบนี้

- Backend: endpoint ของ Chat (WS+REST)/Maintenance/Transport Directory ทำงานได้จริง ผ่าน RBAC + RLS (tenant isolation ใช้ได้ทั้ง HTTP และ WebSocket path) เหมือน MVP module เดิมทุกประการ
- Chat: 1:1 (นิติบุคคล/รปภ.) + กลุ่มหมู่บ้าน ส่ง/รับ real-time ผ่าน WebSocket ได้จริง, ประวัติค้นหาย้อนหลังผ่าน REST ได้, room-level authorization ทำงานถูกต้อง (ไม่ใช่แค่ tenant-level)
- Maintenance: full flow สร้าง (มีเลขที่ใบงาน) → assign → เปลี่ยนสถานะไปข้างหน้าเท่านั้น → resident ติดตามสถานะได้
- Transport Directory: admin CRUD + toggle active ครบ, resident เห็นเฉพาะ active พร้อมปุ่มโทรออกได้จริง
- Push Notifications (Epic 11): ทั้ง 4 trigger (entry-log scan-in, SOS, announcement, chat message) ส่ง push จริงผ่าน Expo Push Notification Service ได้, mobile ลงทะเบียน/ลบ push token ตาม session lifecycle (login/logout) ได้จริง, กดแตะ notification แล้ว deep-link ไปหน้าที่ถูกต้องตาม `{type, id}` schema (ADR-006)
- Automated test: unit test ครอบคลุม critical path ของทั้ง 4 epic (โดยเฉพาะ RLS-in-WebSocket, ticket-number concurrency, status transition guard, push send ไม่ throw เมื่อ Expo API ล้มเหลว), integration test อย่างน้อย 1 เคสต่อ epic
- `npm run build` (root, backend+admin-web) และ `npm run typecheck:mobile` ผ่านทั้งคู่
- Schema/migration: migration ของทั้ง 4 epic (8-11) apply สำเร็จกับ DB จริง (local Postgres) แล้ว — ตรวจสอบแล้วในรอบ planning ของแต่ละ epic (ดู ARCHITECTURE.md §8 "Validated" สำหรับ Epic 8-10, ADR-006 สำหรับ Epic 11's `push_tokens`)

**Out of scope ยืนยันอีกครั้ง (ห้ามทำในรอบ planning นี้ — เป็นงาน Dev รอบถัดไป):**
Controller/Service/DTO จริงของทั้ง 3 module (Epic 8-10 — schema เท่านั้นตอน
วางแผนรอบแรก), `PushNotificationService`/`PushTokenService` จริงและการเรียก
ใช้ที่ 4 trigger point ของ Epic 11 (schema เท่านั้นตอนวางแผนรอบนี้),
admin-web/mobile UI จริง (รวมถึง mobile push registration จริง),
WebSocket gateway implementation จริง (Epic 8 — implement แล้วในรอบถัดจาก
planning), Facility Booking/Payment/LPR (เฟส 3)

---

## 5. Epic 12 — Guard Patrol Log (ผู้ใช้ขอเพิ่มนอกสเปกเดิม)

**User Story:** ในฐานะ รปภ. ฉันต้องการถ่ายรูปพร้อมเวลาประทับตอนเดินตรวจรอบหมู่บ้าน
เพื่อเป็นหลักฐานว่าได้ตรวจจริง — ในฐานะแอดมิน ฉันต้องการดูประวัติการตรวจรอบย้อนหลัง
เพื่อตรวจสอบว่า รปภ. ปฏิบัติหน้าที่ตามรอบจริง

**Acceptance Criteria:**
- ถ่ายรูปแบบอิสระ **ไม่มีจุดตรวจ (checkpoint) ตายตัว** — ผู้ใช้เลือกทางเลือกนี้เอง
  (เร็ว/ง่ายกว่าระบบ checkpoint ที่ต้องตั้งค่าล่วงหน้า)
- แนบหมายเหตุ (note) และพิกัด GPS ได้ แต่ทั้งคู่เป็น optional
- บันทึกเวลาที่ถ่าย (`createdAt`) และ รปภ. ที่บันทึก (`guardUserId`) เสมอ — นี่คือ
  "หลักฐานตามเวลา" ที่ผู้ใช้ต้องการ
- ADMIN และ GUARD (ทุกคน ไม่จำกัดแค่คนที่บันทึก) ดูประวัติย้อนหลังได้ — RESIDENT ไม่เห็น
  (ไม่ใช่ข้อมูลที่ลูกบ้านต้องรู้โดยตรง)
- กรองตามวันที่ได้ (pattern เดียวกับ `GET /entry-logs?date=`)

**Schema (วางแล้ว — schema.prisma):** model `PatrolLog` (id, villageId, guardUserId,
photoUrl, note NULLABLE, latitude/longitude NULLABLE, createdAt) — bucket ใหม่
`"patrol-logs"` แยกจาก `"entry-logs"` โดยตั้งใจ (กัน authorization reverse-lookup
ของ `FilesService` ไม่ต้องเพิ่ม table ที่ 4 เข้า chain เดิม — ดู
`file-storage.service.ts` bucket comment)

**Implementation Tasks:**
- [ ] Migration: apply `PatrolLog` model + RLS policy (table `patrol_logs` เพิ่มใน
      `rls-policies.sql`'s array แล้ว ต้องสร้าง migration จริงตามขั้นตอนเดิม)
- [ ] Backend module `src/common/files/`'s `FilesService` — เพิ่ม authorization
      rule สำหรับ bucket `"patrol-logs"`: ADMIN หรือ GUARD เท่านั้น (เหมือน
      `"sensitive-id"` แต่ไม่ต้อง audit-log เพราะไม่ใช่ข้อมูลส่วนบุคคลอ่อนไหวระดับเดียวกัน)
- [ ] `src/modules/patrol-log/` — `POST /patrol-logs` (GUARD เท่านั้น, รับรูปผ่าน
      `FileStorageService` bucket `"patrol-logs"`), `GET /patrol-logs?date=`
      (ADMIN + GUARD, pagination เหมือน entry-logs)
- [ ] Admin-web: หน้าใหม่ "ประวัติตรวจรอบ" — list พร้อมรูป (ผ่าน `AuthedImage`/
      `useImageBlobUrl` pattern ที่มีอยู่แล้ว ไม่ใช่ token-in-URL แบบเก่าที่เคยพัง),
      กรองวันที่, แสดงชื่อ รปภ. + เวลา + หมายเหตุ
- [ ] Mobile (guard): หน้าใหม่ "บันทึกตรวจรอบ" — ถ่ายรูปด้วย `expo-camera` (pattern
      เดียวกับ ManualEntryScreen), หมายเหตุ (optional), แนบ GPS อัตโนมัติถ้ามีสิทธิ์
      (pattern เดียวกับ resident's SOS — เงียบๆ ถ้าไม่มีสิทธิ์ ไม่บังคับ), เพิ่ม
      เป็น tab ใหม่หรือ quick-link จาก Guard Home (ตัดสินใจตอน implement — tab bar
      ตอนนี้มี 7 อันแล้ว ถ้าแน่นเกินไปให้ทำเป็น quick-link แทนก็ได้)
- [ ] Unit + e2e test: RBAC (resident เห็นไม่ได้, guard คนอื่นเห็นได้), tenant
      isolation, ไม่มี checkpoint validation (ยืนยันว่ารับ note/GPS เป็น optional จริง)

**Priority:** P2 (นอก scope เดิมทั้งหมด ไม่มี dependency กับ Epic 8-11)
**Dependency:** Epic 0, Epic 1 (auth/RBAC พื้นฐาน) เท่านั้น
