# ระบบความปลอดภัยและอำนวยความสะดวกหมู่บ้าน (Village Security & Community App)
เอกสารสรุปสำหรับนำไปพัฒนาต่อ — ครอบคลุม (1) UI Mockup/โครงหน้าจอ (2) Feature Spec (3) System Architecture

---

## 0. ภาพรวมโครงการ

**เป้าหมาย:** แอปพลิเคชัน/ระบบสำหรับหมู่บ้านจัดสรร ที่ช่วยจัดการความปลอดภัย (เข้า-ออก, แจ้งเตือนฉุกเฉิน), การสื่อสาร (ประกาศ, แชท) และความสะดวกของลูกบ้าน (จองพื้นที่, แจ้งซ่อม, ชำระเงิน)

**กลุ่มผู้ใช้ (Roles):**
| Role | คำอธิบาย | สิทธิ์หลัก |
|---|---|---|
| Resident (ลูกบ้าน) | เจ้าของบ้าน/ผู้พักอาศัย | ดูประกาศ, สร้าง QR เชิญแขก, แชท, จอง, แจ้งซ่อม, ชำระเงิน |
| Guard (รปภ.) | เจ้าหน้าที่รักษาความปลอดภัยประจำป้อม | สแกน QR, บันทึกรถเข้า-ออก, รับแจ้งเหตุฉุกเฉิน |
| Admin (นิติบุคคล) | ผู้ดูแลระบบ/นิติบุคคลหมู่บ้าน | ออกประกาศ, จัดการสมาชิก, ดูรายงาน, ตั้งค่าสิทธิ์ |
| Visitor (แขก) | บุคคลภายนอกที่มาติดต่อ | สแกน QR เพื่อเข้า-ออก ไม่ต้องลงแอป |

**Roadmap 3 เฟส:**
1. **MVP:** เข้า-ออกด้วย QR, ประกาศ, แจ้งเตือนฉุกเฉิน/SOS
2. **เฟส 2:** แชท, ทำเนียบลูกบ้าน, แจ้งซ่อม
3. **เฟส 3:** จองพื้นที่ส่วนกลาง, ชำระเงินออนไลน์, เชื่อม CCTV/ป้ายทะเบียนอัตโนมัติ (LPR)

---

## 1. UI Mockup — โครงหน้าจอ (Wireframe Description)

> หมายเหตุ: ส่วนนี้อธิบายโครงสร้างหน้าจอ (screen flow + layout) เพื่อให้ทีมออกแบบ/ทีม dev นำไปสร้างเป็นดีไซน์จริงหรือ prototype ใน Figma ต่อได้

### 1.1 แอปฝั่งลูกบ้าน (Resident App)

**Bottom Navigation:** หน้าแรก | ประกาศ | แชท | เพิ่มเติม

- **หน้าแรก (Home)**
  - แถบบน: โลโก้หมู่บ้าน + ไอคอนกระดิ่งแจ้งเตือน (badge จำนวนที่ยังไม่อ่าน)
  - ปุ่ม SOS สีแดงขนาดใหญ่ (กดค้าง 2 วิเพื่อป้องกันกดพลาด)
  - การ์ดลัด 2x3: "เชิญแขก (QR)" / "แจ้งซ่อม" / "จองพื้นที่" / "ชำระค่าส่วนกลาง" / "ทำเนียบบ้าน" / "ประวัติเข้า-ออก"
  - ฟีดประกาศล่าสุด 3 รายการ

- **หน้าเชิญแขก / สร้าง QR**
  - ฟอร์ม: ชื่อแขก, เบอร์โทร, ทะเบียนรถ (ถ้ามี), วันที่-ช่วงเวลาที่อนุญาต, ประเภท (แขก/ไรเดอร์/ช่าง/แม่บ้าน)
  - ปุ่ม "สร้าง QR" → แสดง QR Code เต็มจอ + ปุ่มแชร์ (LINE/SMS)
  - รายการ QR ที่สร้างไว้ พร้อมสถานะ (ยังไม่ใช้ / ใช้แล้ว / หมดอายุ)

- **หน้าประวัติเข้า-ออก**
  - รายการแบบ timeline: รูปถ่ายหน้างาน, ชื่อแขก, เวลาเข้า, เวลาออก, ผู้บันทึก (รปภ.)
  - ค้นหา/กรองตามวันที่

- **หน้าประกาศ (Announcement Feed)**
  - รายการประกาศเรียงเวลาล่าสุด แยก badge สี: ปกติ (เทา) / สำคัญ (เหลือง) / ฉุกเฉิน (แดง)
  - แตะเพื่อดูรายละเอียด + รูปแนบ

- **หน้าแชท**
  - แท็บ: "นิติบุคคล", "รปภ.", "กลุ่มหมู่บ้าน"
  - UI แชทมาตรฐาน (bubble, แนบรูป, timestamp)

- **หน้าเพิ่มเติม (Profile/Settings)**
  - ข้อมูลบ้าน/สมาชิกในบ้าน, ตั้งค่าแจ้งเตือน, ประวัติการชำระเงิน, ออกจากระบบ

### 1.2 แอปฝั่ง รปภ. (Guard App)

- **หน้าแรก:** ปุ่มใหญ่ "สแกน QR" กลางจอ, สรุปจำนวนรถเข้า-ออกวันนี้
- **หน้าสแกน:** กล้องสแกน QR → แสดงข้อมูลแขก/รถ → ปุ่ม "ยืนยันเข้า" / "ปฏิเสธ"
- **หน้าบันทึกด้วยมือ (กรณีไม่มี QR):** ถ่ายรูปบัตร ปชช./ทะเบียนรถ + กรอกข้อมูลเอง
- **หน้ารับแจ้งเหตุฉุกเฉิน:** รายการ SOS เข้ามาแบบ real-time พร้อมพิกัดบ้าน/แผนที่ + ปุ่มโทรกลับ

### 1.3 แอป/เว็บฝั่งแอดมิน (Admin Dashboard — เว็บ)

- **Dashboard:** กราฟสรุปรถเข้า-ออกวันนี้, จำนวนแจ้งเหตุ, ค้างชำระค่าส่วนกลาง
- **จัดการประกาศ:** สร้าง/แก้ไข/ลบ ประกาศ, เลือกระดับความสำคัญ, กำหนดกลุ่มเป้าหมาย
- **จัดการสมาชิก:** เพิ่ม/ลบลูกบ้าน, ผูกบ้านเลขที่, จัดการสิทธิ์ รปภ.
- **รายงาน:** export ประวัติเข้า-ออก, รายงานการเงิน

---

## 2. Feature Spec (รายละเอียดฟีเจอร์)

### 2.1 โมดูลเข้า-ออก (Access Control) — MVP

**User Stories:**
- ในฐานะลูกบ้าน ฉันต้องการสร้าง QR Code ให้แขก เพื่อให้เข้าหมู่บ้านได้โดยไม่ต้องโทรแจ้ง รปภ. ล่วงหน้า
- ในฐาน รปภ. ฉันต้องการสแกน QR แล้วเห็นข้อมูลแขกทันที เพื่อยืนยันตัวตนก่อนอนุญาตเข้า
- ในฐานะลูกบ้าน ฉันต้องการได้รับแจ้งเตือนทันทีเมื่อแขกของฉันมาถึงป้อมยาม

**Acceptance Criteria:**
- QR Code มีอายุการใช้งานตามที่กำหนด (วันเดียว/ช่วงเวลา) และใช้ซ้ำไม่ได้หลังหมดอายุ (ตั้งค่าได้ว่าใช้ครั้งเดียวหรือหลายครั้ง)
- เมื่อสแกนสำเร็จ ระบบส่ง push notification ไปยังเจ้าของบ้านภายใน 3 วินาที (soft target — ขึ้นกับความเสถียรของเครือข่าย/FCM ไม่ใช่ SLA เข้มงวด)
- ทุกการเข้า-ออกต้องบันทึก: เวลา, ผู้บันทึก/วิธีบันทึก (QR/manual), รูปถ่าย (ถ้ามี), สถานะ
- **Entry-Exit flow:** QR ใบเดียวใช้สแกนได้ทั้งตอนเข้าและตอนออก (สถานะ pass เปลี่ยน `unused` → `entered` → `exited`) แต่การบันทึก `exit_time` **ต้องมีขั้นตอนยืนยันชัดเจน ไม่ auto-close ทันทีที่สแกน** เพื่อกันกรณีสแกนผิด/สแกนซ้ำโดยไม่ตั้งใจ โดยยืนยันได้ 2 ทาง (เลือกได้ว่าจะเปิดใช้ทางใด หรือทั้งคู่ตามนโยบายหมู่บ้าน):
  1. รปภ. สแกน QR ที่จุดออก แล้วกดปุ่ม "ยืนยันแขกออก" อีกครั้ง (ไม่ใช่ auto)
  2. ส่ง push แจ้งเจ้าของบ้านให้กดยืนยันการออกในแอป (ใช้กับกรณีต้องการความรัดกุมสูง เช่น ผู้รับเหมา/ช่าง)
- รองรับกรณีไม่มี QR: รปภ. บันทึกด้วยมือ + ถ่ายรูปบัตรประชาชน/ทะเบียนรถ
- ประวัติค้นหาย้อนหลังได้อย่างน้อย 6 เดือน

### 2.2 โมดูลประกาศ/แจ้งเตือน (Announcement & Alerts) — MVP

**User Stories:**
- ในฐานะแอดมิน ฉันต้องการส่งประกาศแบบเลือกระดับความสำคัญ เพื่อให้ลูกบ้านรับรู้ตามความเร่งด่วน
- ในฐานะลูกบ้าน ฉันต้องการกดปุ่ม SOS เมื่อเกิดเหตุฉุกเฉิน เพื่อแจ้ง รปภ./เพื่อนบ้านใกล้เคียงทันที

**Acceptance Criteria:**
- ประกาศแบ่ง 3 ระดับ: ปกติ / สำคัญ / ฉุกเฉิน — แต่ละระดับมีสีและเสียงแจ้งเตือนต่างกัน ระดับฉุกเฉินส่งแบบ push + SMS สำรอง
- ปุ่ม SOS: ต้องกดค้างอย่างน้อย 2 วินาที (กันกดพลาด), ส่งพิกัด GPS + เลขที่บ้าน ไปยัง รปภ.ที่กำลังปฏิบัติหน้าที่เท่านั้น (query จากตาราง `guard_shifts` ที่ `status = on_duty` ณ เวลานั้น ไม่ส่งไปหา รปภ. ที่เลิกกะแล้ว) + เพื่อนบ้านในระยะที่ตั้งค่าไว้ (optional, ใช้พิกัด `houses.latitude/longitude`)
- แอดมินกำหนดกลุ่มเป้าหมายประกาศได้ (ทั้งหมู่บ้าน / โซน / บ้านเฉพาะเลขที่)
- เก็บสถานะการอ่าน (read receipt) เพื่อยืนยันว่าลูกบ้านเห็นประกาศสำคัญแล้ว

### 2.3 โมดูลแชท (Messaging) — เฟส 2

**Acceptance Criteria:**
- แชท 1:1 ระหว่างลูกบ้าน-นิติบุคคล, ลูกบ้าน-รปภ.
- แชทกลุ่มหมู่บ้าน (broadcast แบบ read-only จากแอดมิน หรือเปิดให้คุยกันได้ตามตั้งค่า)
- รองรับแนบรูปภาพ, แจ้งเบาะแส/รายงานปัญหาพร้อมรูป
- ประวัติแชทเก็บถาวร ค้นหาย้อนหลังได้

### 2.4 โมดูลแจ้งซ่อม (Maintenance Request) — เฟส 2

**Acceptance Criteria:**
- ลูกบ้านแจ้งปัญหาพร้อมหมวดหมู่ (ไฟฟ้า/ประปา/ถนน/อื่นๆ) + รูปแนบ + คำอธิบาย
- ระบบสร้างเลขที่ใบงาน (ticket) และแจ้งสถานะ: รับเรื่อง → กำลังดำเนินการ → เสร็จสิ้น
- แอดมินมอบหมายงานให้ทีมช่างได้ พร้อมกำหนดวันนัดหมาย

### 2.5 โมดูลจองพื้นที่ส่วนกลาง (Facility Booking) — เฟส 3

**Acceptance Criteria:**
- ปฏิทินแสดงช่วงเวลาว่าง/ไม่ว่างของแต่ละพื้นที่ (สระว่ายน้ำ/คลับเฮาส์/สนามกีฬา)
- จองล่วงหน้าได้ตามกฎที่ตั้งค่า (เช่น จองได้สูงสุด 2 ชม./ครั้ง, ไม่เกิน 1 ครั้ง/สัปดาห์)
- ยกเลิก/แก้ไขการจองได้ก่อนเวลาที่กำหนด

### 2.6 โมดูลชำระค่าส่วนกลาง (Payment) — เฟส 3

**Acceptance Criteria:**
- แจ้งยอดค้างชำระอัตโนมัติทุกรอบบิล พร้อมแจ้งเตือนก่อนครบกำหนด
- ชำระผ่าน QR PromptPay / บัตรเครดิต เชื่อม payment gateway (เช่น Omise, 2C2P)
- ออกใบเสร็จอิเล็กทรอนิกส์อัตโนมัติหลังชำระสำเร็จ

### 2.7 ทำเนียบลูกบ้าน (Resident Directory) — เฟส 2

**Acceptance Criteria:**
- ค้นหาเบอร์ติดต่อฉุกเฉินของบ้านอื่นได้ (ตามสิทธิ์ความเป็นส่วนตัวที่ลูกบ้านยินยอมเปิดเผย)
- แอดมินจัดการข้อมูลสมาชิกในแต่ละบ้านได้

---

## 3. System Architecture

### 3.1 Tech Stack แนะนำ

| ส่วน | เทคโนโลยี | เหตุผล |
|---|---|---|
| Mobile App (ลูกบ้าน/รปภ.) | React Native หรือ Flutter | โค้ดชุดเดียวรันได้ทั้ง iOS/Android |
| Admin Dashboard | React.js (Web) | จัดการง่าย ใช้บนคอมได้สะดวกกว่า |
| Backend API | Node.js (NestJS/Express) หรือ Laravel | พัฒนาเร็ว รองรับ real-time ได้ดี (Node.js) |
| Database | PostgreSQL | รองรับ relational data + JSON field ยืดหยุ่น |
| Real-time (แชท/แจ้งเตือน) | Socket.io / Firebase Realtime DB | ส่งข้อมูลทันที เหมาะกับ SOS/แชท |
| Push Notification | Firebase Cloud Messaging (FCM) | ฟรี รองรับทั้ง iOS/Android |
| ช่องทางเสริม | LINE Messaging API + LINE Official Account (OA) | คนไทยคุ้นเคย ลดแรงต้านการโหลดแอปใหม่ — *หมายเหตุ: LINE Notify ปิดบริการแล้วตั้งแต่ 31 มี.ค. 2025 ห้ามใช้ ต้องสมัคร LINE OA + Messaging API แทน โดยผู้ใช้ต้อง add OA เป็นเพื่อนก่อนจึงจะรับแจ้งเตือนผ่านช่องทางนี้ได้ (ผูก line user id ตอนสมัคร/login)* |
| File/Image Storage | AWS S3 หรือ Cloudflare R2 | เก็บรูปถ่ายหน้างาน/บัตรประชาชน |
| Payment Gateway | Omise / 2C2P / PromptPay QR | รองรับเฟส 3 |
| Hosting | AWS / GCP / DigitalOcean | scale ได้ตามขนาดหมู่บ้าน |

### 3.2 โครงสร้างฐานข้อมูล (ER Overview)

> **Multi-tenant (SaaS):** ระบบออกแบบให้รองรับหลายหมู่บ้านตั้งแต่เริ่มต้น จึงมีตาราง `villages` เป็น tenant หลัก และตารางระดับบนของแต่ละหมวด (users, houses, announcements, facilities, chat_rooms, bills) มีคอลัมน์ `village_id` โดยตรง ส่วนตารางลูกที่อ้างอิง house_id/facility_id อยู่แล้ว (visitor_passes, entry_logs, sos_alerts, maintenance_tickets, bookings, payments) แนะนำให้ denormalize `village_id` ซ้ำไว้ด้วย เพื่อให้ทำ Row-Level Security (RLS) ใน PostgreSQL ระดับ query ได้ตรงไปตรงมาและกัน tenant data รั่วข้ามหมู่บ้านได้ตั้งแต่ชั้น database ไม่ต้องพึ่ง application logic อย่างเดียว

```
villages (id, name, address, subscription_plan, status[active/suspended], created_at)

users (id, village_id, name, phone, role, house_id, line_user_id, password_hash, created_at)
houses (id, village_id, house_no, zone, latitude, longitude, owner_user_id)
house_members (id, house_id, user_id, relation)

visitor_passes (id, village_id, created_by_user_id, visitor_name, visitor_phone,
                vehicle_plate, qr_token, valid_from, valid_to,
                usage_type[single/multi], status[unused/entered/exited/expired/revoked], created_at)

entry_logs (id, village_id, pass_id NULLABLE, house_id, recorded_by_guard_id,
            visitor_name, vehicle_plate, photo_url, entry_time,
            exit_time, exit_confirmed_by_user_id NULLABLE,
            exit_confirmation_method[guard/resident] NULLABLE,
            method[qr/manual], created_at)

announcements (id, village_id, created_by_admin_id, title, content, level[normal/important/emergency],
               target_scope[all/zone/house], image_url, created_at)

announcement_reads (id, announcement_id, user_id, read_at)

sos_alerts (id, village_id, triggered_by_user_id, house_id, latitude, longitude,
            status[pending/acknowledged/resolved], acknowledged_by_guard_id,
            created_at, resolved_at)

guard_shifts (id, village_id, guard_user_id, shift_start, shift_end, status[on_duty/off_duty])

chat_rooms (id, village_id, type[direct/group], name)
chat_participants (id, chat_room_id, user_id)
chat_messages (id, chat_room_id, sender_id, message, image_url, created_at)

maintenance_tickets (id, village_id, house_id, created_by_user_id, category, description,
                      image_url, status[open/in_progress/done], assigned_to,
                      scheduled_date, created_at)

facilities (id, village_id, name, description, open_time, close_time, rules)
bookings (id, facility_id, user_id, house_id, start_time, end_time, status)

bills (id, village_id, house_id, period, amount, due_date, status[unpaid/paid], paid_at)
payments (id, bill_id, amount, method, transaction_ref, paid_at)

audit_logs (id, village_id, actor_user_id, action, resource_type, resource_id NULLABLE,
            metadata JSON NULLABLE, ip_address, created_at)
```

> `audit_logs` รองรับข้อกำหนดข้อ 3.4 "Log การเข้าถึงข้อมูลอ่อนไหว (audit trail) สำหรับแอดมิน" — เป็น append-only ห้ามมี endpoint แก้ไข/ลบ บันทึกทุกครั้งที่แอดมินเข้าถึงข้อมูลอ่อนไหว (เช่น ดูรูปบัตร ปชช., export ประวัติเข้า-ออก, revoke QR ของคนอื่น)

### 3.3 โครงสร้าง API หลัก (REST ตัวอย่าง)

> ทุก endpoint (ยกเว้น `/auth/*` และ path สแกน QR ของแขก) ต้องมี `village_id` แนบอยู่ใน JWT payload หลัง login และใช้กรองข้อมูลทุก query โดยอัตโนมัติ ห้าม trust `village_id` ที่ส่งมาจาก client เอง

```
Auth
POST   /auth/login                  # เบอร์โทร + OTP (แนะนำ) — คืน JWT ที่มี village_id, role
POST   /auth/refresh

Visitor Pass
POST   /visitor-passes              # ลูกบ้านสร้าง QR
GET    /visitor-passes/:token       # รปภ.สแกน ดึงข้อมูล
PATCH  /visitor-passes/:id/revoke   # ลูกบ้านยกเลิก QR ก่อนหมดอายุ
POST   /entry-logs                  # รปภ.บันทึกเข้า (scan/manual)
PATCH  /entry-logs/:id/confirm-exit # รปภ. หรือลูกบ้าน ยืนยันแขกออก (ไม่ auto จากการสแกนอย่างเดียว)
GET    /entry-logs?house_id=&date=  # ค้นประวัติ

Announcements
POST   /announcements               # แอดมินสร้างประกาศ
GET    /announcements               # ดึงฟีดประกาศ
POST   /announcements/:id/read

SOS
POST   /sos-alerts                  # ลูกบ้านกด SOS
PATCH  /sos-alerts/:id/acknowledge  # รปภ.รับเรื่อง

Chat (WebSocket)
WS     /chat/:room_id
POST   /chat-rooms
GET    /chat-rooms/:id/messages

Maintenance
POST   /maintenance-tickets
PATCH  /maintenance-tickets/:id/status

Booking
GET    /facilities/:id/availability
POST   /bookings

Billing
GET    /bills?house_id=
POST   /payments
```

### 3.4 แนวทางความปลอดภัยของระบบ (Security Considerations)

- เข้ารหัส QR token แบบ signed JWT ที่มีวันหมดอายุ ป้องกันการปลอมแปลง
- จำกัดสิทธิ์ตาม Role-Based Access Control (RBAC) ทุก endpoint
- เก็บภาพถ่าย/ข้อมูลส่วนบุคคลตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) — ต้องมีนโยบายความยินยอมและระยะเวลาเก็บข้อมูลที่ชัดเจน
- SOS/emergency endpoint ต้องมี rate-limit ป้องกันการกดสแปม แต่ไม่บล็อกจนทำให้เหตุฉุกเฉินจริงส่งไม่ทัน
- Log การเข้าถึงข้อมูลอ่อนไหว (audit trail) สำหรับแอดมิน
- **QR revocation:** ต้องเพิ่ม endpoint `PATCH /visitor-passes/:id/revoke` ให้ลูกบ้านยกเลิก QR ที่สร้างไว้ได้ทันที (กรณีส่งผิดคน/สงสัยรั่วไหล) โดยเปลี่ยน `status` เป็น `revoked` — QR ที่ revoked ต้องสแกนไม่ผ่านแม้ยังไม่หมดอายุ
- **Offline scan กับ revocation:** ถ้า Guard app ตรวจสอบลายเซ็น JWT แบบ local (ไม่ query server ทุกครั้งเพื่อรองรับเน็ตไม่เสถียรที่ป้อมยาม) ต้อง sync รายการ revoked/blacklist token ลงเครื่องอย่างน้อยทุก 1-5 นาทีเมื่อมีสัญญาณ และแสดงเตือน "ยืนยันแบบออฟไลน์ ยังไม่เช็ค revocation ล่าสุด" ให้ รปภ. เห็น เพื่อไม่ให้ QR ที่ถูก revoke ไปแล้วหลุดเข้าได้โดยไม่รู้ตัว
- **แยกนโยบายเก็บข้อมูลภาพบัตรประชาชน/ทะเบียนรถออกจากประวัติเข้า-ออกทั่วไป:** รูปบัตร ปชช. เป็นข้อมูลอ่อนไหวกว่า entry log ทั่วไป ควรเข้ารหัสไฟล์แบบ at-rest แยก bucket/permission เฉพาะ และตั้งอายุการเก็บสั้นกว่า (เช่น ลบอัตโนมัติหลัง 90 วัน) ต่างจาก entry_logs ที่เก็บ 6 เดือนตามข้อ 2.1
- **จำกัดอัตราการสร้าง QR และการบันทึกเข้า-ออกแบบ manual:** ป้องกันการสร้าง QR จำนวนมากผิดปกติจากบัญชีเดียว (บ่งชี้บัญชีถูกขโมย) และป้องกัน รปภ. บัญชีถูกยึด สร้าง entry log ปลอมจำนวนมาก — ควร alert แอดมินเมื่อเกิน threshold
- **แนะนำ Auth ด้วยเบอร์โทร + OTP แทน/เสริม password:** ลดความเสี่ยง credential stuffing และตรงกับพฤติกรรมผู้ใช้ไทยที่คุ้นเคยกับ OTP มากกว่า จำ password

---

## 4. สรุป Roadmap การพัฒนา

| เฟส | ระยะเวลาโดยประมาณ | ขอบเขต |
|---|---|---|
| MVP | 6-8 สัปดาห์ | Auth, Visitor QR + Entry Log, Announcement, SOS |
| เฟส 2 | 4-6 สัปดาห์ | Chat, Directory, Maintenance Ticket |
| เฟส 3 | 6-8 สัปดาห์ | Booking, Payment, CCTV/LPR Integration |

---

*เอกสารนี้จัดทำเพื่อใช้เป็นจุดเริ่มต้นสำหรับทีมพัฒนา สามารถปรับขอบเขตและลำดับความสำคัญได้ตามงบประมาณและขนาดหมู่บ้านจริง*
