# ฐานข้อมูลจำลอง Leave Management — 10 คน

ชุดข้อมูลเริ่มต้นที่เชื่อมกับแอปทั้งโหมดเบราว์เซอร์และ mock REST API แล้ว อ้างอิง Data Dictionary ที่ผู้ใช้ส่งมาและโครงสร้างปัจจุบันของโปรเจกต์ ข้อมูลบุคคล อีเมล เบอร์โทร วันหยุด และเอกสารทั้งหมดเป็นข้อมูลสมมติ

## ไฟล์

| ไฟล์ | การใช้งาน |
| --- | --- |
| `leave-management-10-people.sqlite` | เปิดดูฐานข้อมูลด้วยเครื่องมือ SQLite ได้ทันที |
| `leave-management-10-people.sql` | schema พร้อมข้อมูลทั้งหมดสำหรับนำเข้า SQLite ฐานใหม่ที่ว่าง |
| `leave-management-10-people.json` | source snapshot โครงสร้าง `Database` สำหรับเริ่มต้นและคืนค่าข้อมูลทั้งสองโหมด |
| `demoDatabase.ts` | `createDemoDatabase()` คืนสำเนาของ source JSON เพื่อให้แต่ละฐาน runtime แก้ข้อมูลของตนได้ |
| `schema.sql` | สำเนา schema ปัจจุบันสำหรับดูโครงสร้าง |
| `data-dictionary.csv` | สำเนา CSV ต้นฉบับที่แนบมา เก็บไว้เป็นเอกสารอ้างอิง |
| `generate.ts` / `build-sqlite.py` | สร้างไฟล์ตัวอย่างในโฟลเดอร์นี้ใหม่ |

## การเชื่อมกับแอป

`npm run dev` ใช้ IndexedDB ชื่อ `leave-management-10-people-v1` และ `npm run dev:api` ใช้ mock REST server ซึ่งอ่าน/เขียน `server/data/leave-management-10-people.json` เป็นค่าเริ่มต้น ทั้งคู่เรียก `createDemoDatabase()` เพื่อ clone ชุด source JSON เมื่อยังไม่มีข้อมูล หรือเมื่อ HR คืนค่าข้อมูลจำลอง หากข้อมูล runtime มีอยู่แล้วจะใช้ข้อมูลนั้นต่อ

ฐานเดิม IndexedDB `leave-management-v1` และ `server/data/db.json` ถูกเก็บไว้ ไม่มีการนำมาทับชุด 10 คน ส่วน `MOCK_DATA_FILE` ยังใช้เลือกไฟล์ runtime ของ mock server ได้ การทำรายการของสองโหมดแยกกัน ไม่มีการซิงก์ข้ามโหมดหรือกลับไปยัง source JSON/SQL/SQLite; ไฟล์ SQLite/SQL เป็นสำเนาส่งออกสำหรับตรวจดูและนำไปใช้ต่อ ไม่ใช่ฐาน runtime ที่เชื่อมอัตโนมัติ

โหมดเบราว์เซอร์ใช้ session key `leave-10-people-demo-session` และ BroadcastChannel `leave-10-people-data` แยกจากฐานเดิม การคืนค่าข้อมูลผ่านบัญชี HR → การตั้งค่า → คืนค่าข้อมูลจำลอง จะโหลด source 10 คนใหม่และล้างการแก้ไขในโหมดที่ใช้งานอยู่ สำหรับโหมด API ใช้ `npm run seed -- --confirm` เพื่อคืนค่าไฟล์ runtime ที่เลือกได้ด้วย

## บัญชีตัวอย่าง

รวม 10 บัญชี: Employee 7 คน, Manager 2 คน และ HR 1 คน แบ่งเป็นฝ่ายไอที 4 พนักงาน/1 ผู้จัดการ และฝ่ายขาย 3 พนักงาน/1 ผู้จัดการ

| ID | ชื่อสมมติ | Role | ผู้จัดการ ID | Email |
| --- | --- | --- | --- | --- |
| 1 | พิมพ์ชนก วัฒนกุล | Employee | 4 | employee@demo.local |
| 2 | นัทธพงศ์ สุขใจ | Employee | 4 | nat@demo.local |
| 3 | อรทัย มั่นคง | Employee | 4 | orn@demo.local |
| 4 | ธนวัฒน์ กิตติวงศ์ | Manager | — | manager@demo.local |
| 5 | ศิริพร ใจดี | HR | — | hr@demo.local |
| 6 | กานต์ พรชัย | Employee | 7 | other@demo.local |
| 7 | ปกรณ์ รุ่งเรือง | Manager | — | sales-manager@demo.local |
| 8 | ชุติมา แสงทอง | Employee | 7 | chutima@demo.local |
| 9 | มาลินี สุขสวัสดิ์ | Employee | 7 | malinee@demo.local |
| 10 | วีรภัทร ตั้งใจ | Employee | 4 | weeraphat@demo.local |

SQLite/JSON ไม่เก็บรหัสผ่าน บัญชีทั้ง 10 คนเข้าสู่ระบบจำลองได้ด้วยรหัส demo `demo1234` ตาม `src/domain/seed.ts`

บนหน้าเข้าสู่ระบบ เปิดรายการ **เลือกบัญชีทดลอง (10 คน)** เพื่อเลือกได้ครบทุกบัญชี รายการแสดงชื่อเต็มและอีเมล แบ่งกลุ่มพนักงาน 7 คน, ผู้จัดการ 2 คน และฝ่ายบุคคล 1 คน ระบบจะกรอกอีเมลและรหัสผ่านให้เมื่อเลือก แล้วกด **เข้าสู่พื้นที่ทำงาน** ปุ่มบทบาทด้านบนแสดงจำนวนบัญชีและเลือกบัญชีแรกของบทบาทนั้น ออกจากระบบก่อนเลือกคนใหม่เพื่อสลับบัญชี ทั้งโหมดเบราว์เซอร์และ API ใช้ตัวเลือกเดียวกัน

## ตารางและสถานการณ์

รักษา 9 ตารางหลัก: `Employee`, `Leave_Type`, `Leave_Entitlement`, `Maternity_Case`, `Leave_Request`, `Leave_Day`, `Leave_Document`, `Leave_Approval`, `Work_Status` พร้อมตารางสนับสนุน `App_Notification` และ `App_Holiday` ตาม `docs/DATABASE.md`

- ประเภทลา 4 ประเภท สิทธิ์รายปี ค.ศ. 2026 และ 2027 รวม 60 รายการ และกรณีลาคลอด 2 กรณี
- คำขอ 14 รายการ: รอพิจารณา 6, อนุมัติ 6, ไม่อนุมัติ 1 และยกเลิก 1
- มีครึ่งวันเช้าอนุมัติ/ครึ่งวันบ่ายรอพิจารณาในวันเดียวกัน, วันลาข้ามปี, วันหยุดบริษัทสมมติ, ลาคลอด และคำขอแก้ไขที่ยกเลิกการพิจารณาเดิม
- มีกรณีรอความเห็น HR, HR ส่งความเห็นแล้วแต่ผู้จัดการยังไม่ตัดสิน และผู้จัดการอนุมัติหลังได้รับความเห็น HR
- เอกสารแนบ 3 รายการเป็น PNG ขนาดเล็กสำหรับทดสอบการจัดเก็บเท่านั้น **ไม่ใช่ใบรับรองแพทย์จริง** และชื่อไฟล์ระบุ `DEMO_PLACEHOLDER_NOT_A_MEDICAL_CERTIFICATE`
- สถานะทำงาน 20 รายการและการแจ้งเตือนจากขั้นตอนที่สร้างผ่าน domain service

วันที่ในไฟล์เป็น ISO ค.ศ. เช่น `2026-12-05`; เมื่อแสดงใน UI ให้ใช้ `src/domain/date.ts` เป็น `5/12/2569` ปีสิทธิ์เก็บ ค.ศ. และ timestamp ใช้ UTC ISO คงที่ ณ `2026-10-10T05:00:00Z` เพื่อสร้างซ้ำได้

ยอด `Total_days`, `Used_days`, `Remaining_days` และ `Pending_days` คำนวณผ่าน SQL views ไม่เก็บซ้ำ หักโควตาเฉพาะ Approved และ HR ไม่ใช่ผู้อนุมัติผลสุดท้าย

CSV ต้นฉบับบางช่องมีอักขระหรือข้อความ `??` อยู่แล้ว จึงเก็บสำเนาเดิมไว้ ส่วนความต่างที่แอปเพิ่ม เช่น NUMERIC/Units สำหรับครึ่งวัน, `Withdrawn`, consultation `Completed`, version, timeline, data URL และสถานะ Leave ที่คำนวณจากคำขออนุมัติ อ้างอิง `docs/DATABASE.md` ไม่ตีความช่องที่เสียใน CSV เป็นกฎใหม่ นโยบายและโควตาเป็นตัวอย่างที่ปรับได้

## สร้างชุดตัวอย่างใหม่

รันจากรากโปรเจกต์ หลังติดตั้ง dependencies แล้ว ต้องมี Python 3 สำหรับส่งออก SQLite:

```bash
node --import tsx src/data/generate.ts
python src/data/build-sqlite.py
```

คำสั่งเขียนทับเฉพาะไฟล์ source/ส่งออกที่สร้างใน `src/data/` โดยใช้วันที่ตัวอย่างคงที่ ไม่เขียนทับ IndexedDB หรือไฟล์ runtime ของ mock server ทั้งฐานเดิมและฐานชุด 10 คน หลังแก้ source ให้รีสตาร์ต mock server และโหลดหน้า frontend ใหม่เพื่ออ่าน JSON ที่เปลี่ยนแล้ว; ถ้าใช้ production build ให้ build และเผยแพร่ไฟล์เว็บใหม่ก่อน จากนั้นให้ HR คืนค่าข้อมูลจำลองในโหมดที่ต้องการเพื่อนำ source ใหม่เข้าสู่ฐาน runtime ที่มีอยู่แล้ว ซึ่งจะล้างการแก้ไขในฐานนั้น

## ตัวอย่างตรวจฐานข้อมูล

```sql
SELECT Role, COUNT(*) FROM Employee GROUP BY Role;
SELECT * FROM Leave_Entitlement_Balance;
SELECT Leave_id, Status, Total_days FROM Leave_Request_Summary;
SELECT * FROM Maternity_Case_Balance;
PRAGMA foreign_key_check;
PRAGMA integrity_check;
```
