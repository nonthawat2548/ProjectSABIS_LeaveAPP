# ข้อมูลที่แอปใช้

โฟลเดอร์นี้มีโค้ดเชื่อมแหล่งข้อมูลและ JSON ต้นทางชุดทดลอง 10 คน ส่วนไฟล์ส่งออกสำหรับเปิดด้วยโปรแกรมฐานข้อมูลอยู่ใน [database/](../../database/README.md)

| ไฟล์ | หน้าที่ |
| --- | --- |
| `leave-management-10-people.json` | ต้นทางชุดทดลอง 10 คน ใช้เมื่อเริ่มฐานใหม่หรือคืนค่าข้อมูล |
| `demoDatabase.ts` | คืนสำเนาชุดทดลองและรายชื่อบัญชีบนหน้าเข้าสู่ระบบ |
| `index.ts` | เลือกโหมดเบราว์เซอร์หรือ REST API |
| `browserRepository.ts` | อ่าน/บันทึก IndexedDB ในเบราว์เซอร์ |
| `apiRepository.ts` | อ่าน/บันทึกผ่าน REST API รวม PostgreSQL บน Vercel |

## ข้อมูลที่เปลี่ยนเมื่อใช้งานแอป

| โหมด | ข้อมูลเก็บที่ไหน |
| --- | --- |
| Vercel / cloud API | PostgreSQL บน Supabase ใช้ร่วมกันทุกเครื่อง |
| `npm run dev` | IndexedDB ของเบราว์เซอร์นั้น |
| `npm run dev:api` | `server/data/leave-management-10-people.json` หรือไฟล์จาก `MOCK_DATA_FILE` |

การยื่นลาไม่เขียนกลับ JSON ต้นทางหรือไฟล์ SQL/SQLite ทั้งสามโหมดใช้ข้อมูล runtime ของตน ไม่มีการย้ายหรือซิงก์ระหว่างโหมดอัตโนมัติ ฐานเดิม IndexedDB `leave-management-v1` และ `server/data/db.json` ถูกเก็บไว้

โหมดเบราว์เซอร์ปัจจุบันใช้ IndexedDB `leave-management-10-people-v1`, session key `leave-10-people-demo-session` และ BroadcastChannel `leave-10-people-data`

## ชุดทดลอง

รวม Employee 7 คน, Manager 2 คน และ HR 1 คน เลือกบทบาทแล้วเลือกบัญชีได้จากหน้าเข้าสู่ระบบ ทุกบัญชีใช้รหัสทดลอง `demo1234` บุคคล อีเมล เบอร์โทร เอกสาร และนโยบายในชุดนี้เป็นข้อมูลสมมติ

- ประเภทลา 4 ประเภท สิทธิ์รายปี ค.ศ. 2026/2027 รวม 60 รายการ และกรณีลาคลอด 2 กรณี
- คำขอ 14 รายการ: รอพิจารณา 6, อนุมัติ 6, ไม่อนุมัติ 1 และยกเลิก 1
- ครอบคลุมครึ่งวัน วันหยุด ข้ามปี ลาคลอด การแก้ไขคำขอ และการปรึกษา HR
- เอกสาร 3 รายการเป็น PNG สำหรับทดสอบ ไม่ใช่ใบรับรองแพทย์จริง

วันที่ในข้อมูลเป็น ISO ค.ศ.; บนหน้าจอใช้ วัน/เดือน/ปี พ.ศ. ผ่าน `src/domain/date.ts` รักษา 9 ตารางหลักและยอดวันลาที่คำนวณ ตาม [docs/DATABASE.md](../../docs/DATABASE.md)

## สร้างและตรวจไฟล์

ตัวสร้างอยู่ใน `scripts/generate-demo.ts`, `scripts/build-sqlite.py` และ `scripts/generate-supabase.mjs` ใช้ `src/domain/seed.ts` เป็นส่วนตั้งต้นด้านบัญชี/นโยบาย ไม่ใช่ฐาน runtime อีกชุดหนึ่ง

```bash
npm run data:check     # ตรวจว่าต้นทางและไฟล์ส่งออกตรงกัน ไม่เขียนข้อมูล
npm run data:generate  # สร้าง JSON ต้นทางและไฟล์ส่งออกใหม่ ต้องมี Python 3
```

ไฟล์ SQL/SQLite ชุด 10 คนอยู่ใน `database/sqlite/`; SQL สำหรับ Supabase อยู่ใน `database/supabase/`; ตัวอย่างเก่าอยู่ใน `database/legacy/`; Data Dictionary เดิมอยู่ใน `docs/reference/data-dictionary.csv` ไม่มี schema ซ้ำในโฟลเดอร์นี้ ใช้ `database/schema.sql` เป็นไฟล์กลาง

การสร้างไฟล์ใหม่ไม่เปลี่ยนข้อมูล runtime ที่มีอยู่ หลังแก้ source ต้องโหลด frontend/รีสตาร์ต server หรือ build และเผยแพร่ใหม่ก่อนใช้ การคืนค่าข้อมูลผ่าน HR → การตั้งค่า หรือ `npm run seed -- --confirm` ของ mock server จะล้างการแก้ไขใน runtime ที่เลือก ไม่ต้องคืนค่าเพียงเพราะย้ายไฟล์อ้างอิงในรอบนี้
