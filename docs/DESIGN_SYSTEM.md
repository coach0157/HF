# Design System — สีสัน/UI มาตรฐาน

ใช้เป็น source of truth สำหรับทั้ง `apps/admin-web` (เว็บ) และ `apps/mobile` (แอปมือถือ) — ต้องใช้ค่าเดียวกันทั้งสองฝั่งเพื่อให้ brand สอดคล้องกัน

**Direction จากผู้ใช้:** เขียวอ่อน + ฟ้า, สไตล์ Bold/Vibrant แต่ต้องดูสะอาด (clean layout, สีสด แต่ไม่รก), จัดปุ่ม/องค์ประกอบให้เป็นระเบียบ

## Color Tokens

```
Primary (เขียว — ปุ่มหลัก, active state, success):
  primary        #10B981   (emerald-500)
  primaryDark    #059669   (emerald-600 — hover/pressed)
  primaryLight   #D1FAE5   (emerald-100 — background tint/chip)

Secondary (ฟ้า — ปุ่มรอง, ลิงก์, info, header accent):
  secondary      #0EA5E9   (sky-500)
  secondaryDark  #0284C7   (sky-600)
  secondaryLight #E0F2FE   (sky-100)

Neutral (พื้นหลัง/ตัวหนังสือ — เน้นความสะอาด):
  background     #F9FAFB   (พื้นหลังทั้งหน้า)
  surface        #FFFFFF   (การ์ด/พื้นผิวที่ยกขึ้นมา)
  border         #E5E7EB
  textPrimary    #111827
  textSecondary  #6B7280
  textMuted      #9CA3AF

Semantic:
  danger         #EF4444   (red-500 — revoke/delete/logout/SOS ปุ่มอันตราย)
  dangerLight    #FEE2E2
  warning        #F59E0B   (amber-500 — สถานะ pending/สำคัญ)
  warningLight   #FEF3C7
  success        = primary
  info           = secondary
```

## Spacing scale
`4 / 8 / 12 / 16 / 24 / 32 / 48` px — ใช้ scale นี้แทนตัวเลขสุ่มที่มีอยู่เดิม

## Border radius
- ปุ่ม: `10px`
- การ์ด/input: `12px`
- badge/chip: `999px` (pill)

## Button variants (ต้องมีทั้ง 2 แพลตฟอร์ม)
- **Primary** — พื้นเขียว `primary`, ตัวหนังสือขาว — ใช้กับ action หลักของหน้า (บันทึก/ยืนยัน/สร้าง)
- **Secondary** — ขอบ `secondary` พื้นโปร่ง/ฟ้าอ่อน ตัวหนังสือ `secondary` — action รอง (ยกเลิก/ดูรายละเอียด)
- **Danger** — พื้นแดง `danger` ตัวหนังสือขาว — revoke/ลบ/logout/SOS
- ทุกปุ่มต้องมี disabled state (opacity ลด + ไม่รับ touch/click)

## หมายเหตุการใช้งาน
- แทนที่ inline hex สุ่ม (`#ddd`, `#666`, `#c0392b` ฯลฯ) ที่กระจายอยู่ทั่วโค้ดปัจจุบันด้วย token ชุดนี้ทั้งหมด
- Badge สถานะ (ระดับประกาศ, สถานะใบงานซ่อม, สถานะ entry/exit) ควร map ไปยัง semantic token ให้สอดคล้องกัน (เช่น "ฉุกเฉิน" → danger, "สำคัญ" → warning, "ปกติ"/"เสร็จสิ้น" → primary/success)
- ห้ามเปลี่ยน business logic ระหว่างทำ — เป็นงาน styling/visual ล้วนๆ
