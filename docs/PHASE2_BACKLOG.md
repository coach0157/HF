# Phase 2 Backlog — ระบบความปลอดภัยและอำนวยความสะดวกหมู่บ้าน

อ้างอิง: `village-security-app-spec.md` ข้อ 2.3 (Chat), 2.4 (Maintenance), 2.7
(Transport Directory), ข้อ 4 (Roadmap — เฟส 2 = 4-6 สัปดาห์) — เอกสารนี้แปลง
scope เฟส 2 เป็น backlog ระดับ implementation ในรูปแบบเดียวกับ
[`MVP_BACKLOG.md`](./MVP_BACKLOG.md) ต่อจาก Epic 0-7 เดิม สถาปัตยกรรม/schema
ที่ตัดสินใจไว้สำหรับ 3 epic นี้ถูกบันทึกเป็น ADR/decision note ใน
[`ARCHITECTURE.md`](./ARCHITECTURE.md) §8

---

## 1. Scope สรุป

**อยู่ใน scope เฟส 2 รอบนี้ (backend API + admin-web + mobile):**
- **Epic 8 — Chat:** แชท 1:1 ลูกบ้าน-นิติบุคคล/รปภ. + แชทกลุ่มหมู่บ้าน (WebSocket จริง)
- **Epic 9 — Maintenance:** แจ้งซ่อม+รูป → ใบงาน (เลขที่ ticket) → มอบหมายช่าง → ติดตามสถานะ
- **Epic 10 — Transport Directory:** ทำเนียบรถรับจ้าง/แท็กซี่ที่แอดมินดูแล ลูกบ้านกดโทรออก (`tel:`) — **ไม่ใช่การเชื่อม API เรียกรถจริง** (แทนที่ "ทำเนียบลูกบ้าน" เดิมที่ถูกตัดออกตามข้อ 2.7 ของสเปก)

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

**ไม่อยู่ใน scope รอบนี้:** business logic/controller/service, UI จริงของทั้ง 3
โมดูล (backend module ยังไม่มี `src/modules/chat|maintenance|transport-provider/`
เลย — Dev agent รอบถัดไปเริ่มจากศูนย์โดยอิง schema/ADR ที่ทำไว้แล้วในรอบนี้),
Facility Booking/Payment/LPR (เฟส 3)

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

## 3. ลำดับความสำคัญและ Dependency

| Epic | Priority | Depends on | หมายเหตุ |
|---|---|---|---|
| 8. Chat | P1 | Epic 0, 1 | Complexity สูงสุด — ต้องวาง WebSocket + RLS pattern ใหม่ (ADR-004/005) ก่อน ไม่ผูกกับ Epic 2-7 |
| 9. Maintenance | P1 | Epic 0, 1 | Complexity กลาง (state machine + atomic ticket numbering) ไม่ผูกกับ Epic 2-7 |
| 10. Transport Directory | P1 | Epic 0, 1 | Complexity ต่ำสุด — CRUD ล้วน ไม่มี real-time/state machine ไม่ผูกกับ Epic 2-7 |

**แนวทางลำดับการทำงานจริง:** ทั้ง 3 epic ไม่มี dependency ระหว่างกันเอง
(schema/module แยกกันคนละตาราง) จึง**พัฒนาขนานกันได้เต็มที่**ถ้ามีมากกว่า 1 คน/
ทีมย่อย ถ้าทำโดยทีมเดียวตามลำดับ แนะนำ **Epic 10 → Epic 9 → Epic 8**
(เรียงจาก complexity ต่ำไปสูง ให้ Epic 10 เป็น "quick win" ยืนยันว่า pattern
CRUD ใหม่ทำงานถูกต้องก่อน แล้วค่อยรับความซับซ้อนของ state machine ใน Epic 9
และ WebSocket infra ใหม่ทั้งหมดใน Epic 8 ซึ่งมีความเสี่ยงทางสถาปัตยกรรมสูงสุด
ควรมีเวลา buffer มากที่สุด)

---

## 4. Definition of Done ของเฟส 2 รอบนี้

- Backend: endpoint ของ Chat (WS+REST)/Maintenance/Transport Directory ทำงานได้จริง ผ่าน RBAC + RLS (tenant isolation ใช้ได้ทั้ง HTTP และ WebSocket path) เหมือน MVP module เดิมทุกประการ
- Chat: 1:1 (นิติบุคคล/รปภ.) + กลุ่มหมู่บ้าน ส่ง/รับ real-time ผ่าน WebSocket ได้จริง, ประวัติค้นหาย้อนหลังผ่าน REST ได้, room-level authorization ทำงานถูกต้อง (ไม่ใช่แค่ tenant-level)
- Maintenance: full flow สร้าง (มีเลขที่ใบงาน) → assign → เปลี่ยนสถานะไปข้างหน้าเท่านั้น → resident ติดตามสถานะได้
- Transport Directory: admin CRUD + toggle active ครบ, resident เห็นเฉพาะ active พร้อมปุ่มโทรออกได้จริง
- Automated test: unit test ครอบคลุม critical path ของทั้ง 3 epic (โดยเฉพาะ RLS-in-WebSocket, ticket-number concurrency, status transition guard), integration test อย่างน้อย 1 เคสต่อ epic
- `npm run build` (root, backend+admin-web) และ `npm run typecheck:mobile` ผ่านทั้งคู่
- Schema/migration: migration ของทั้ง 3 epic apply สำเร็จกับ DB จริง (local Postgres) แล้ว — ตรวจสอบแล้วในรอบ planning นี้ (ดู ARCHITECTURE.md §8 "Validated")

**Out of scope ยืนยันอีกครั้ง (ห้ามทำในรอบ planning นี้ — เป็นงาน Dev รอบถัดไป):**
Controller/Service/DTO จริงของทั้ง 3 module, admin-web/mobile UI จริง,
WebSocket gateway implementation จริง, Facility Booking/Payment/LPR (เฟส 3)
