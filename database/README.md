# ไฟล์ฐานข้อมูล

## ล้างประวัติคำขอเพื่อเริ่มทดสอบใหม่

`supabase/clear-leave-history.sql` เป็นคำสั่งล้างข้อมูลในฐานที่มีอยู่ ไม่ใช่ setup/migration ให้รันทั้งไฟล์ใน Supabase SQL Editor ของโปรเจกต์ Leave Management จะลบคำขอ วันลาที่ใช้ เอกสาร การอนุมัติ การแจ้งเตือน/สถานะงานที่ผูกกับการลา และ uploads ที่ค้าง โดยคงพนักงาน นโยบาย สิทธิ์ที่ได้รับ กรณีลาคลอด วันหยุด session และสถานะงานอื่น ใช้ transaction กับ advisory lock เดียวกับ API ไม่ใช้ DROP/TRUNCATE ผลท้ายไฟล์ทุกช่องต้องเป็น 0 จากนั้นรีเฟรชเว็บบนทุกเครื่อง

ในเครื่องที่ใช้ Go JSON ให้หยุด `npm run dev:api` ก่อน แล้วรัน `npm run history:clear -- --confirm` จากรากโปรเจกต์ คำสั่งสร้าง backup ข้างไฟล์ runtime และล้างเฉพาะ `server/data/leave-management-go.json` ก่อนเปิด `npm run dev:api` ใหม่ หากใช้ Node legacy JSON ให้ระบุ `--file server/data/leave-management-10-people.json` โดยหยุด server ก่อนเช่นกัน คำสั่งนี้ไม่เชื่อม Supabase และไม่แก้ IndexedDB ของเบราว์เซอร์

ชุด source JSON, SQL/SQLite ตัวอย่างและข้อมูลที่ tests ใช้คงเดิม การล้าง runtime ไม่ทำให้ฐานใหม่หรือปุ่ม “คืนค่าข้อมูลจำลอง” เริ่มว่าง ปุ่มนั้นยังคืนข้อมูลตัวอย่างเดิมตามหน้าที่ของมัน

หากแถบบนเว็บ local ระบุว่า “ข้อมูลบันทึกในเบราว์เซอร์” ข้อมูลอยู่ใน IndexedDB แยกตามเบราว์เซอร์และ origin (รวม port) ไม่ใช่ Go JSON ให้เปิด `/scripts/clear-browser-history.html` บน origin เดียวกับเว็บนั้น เช่น `http://localhost:5174/scripts/clear-browser-history.html` แล้วกด “ล้างประวัติคำขอลา” เครื่องมือนี้ใช้ได้เฉพาะ Vite development บน localhost ไม่รวมในเว็บ build และไม่ล้างอัตโนมัติ การล้าง state และ chunks ของเอกสารอยู่ใน transaction เดียว คงบัญชี สิทธิ์ และข้อมูลที่ไม่เกี่ยวกับคำขอไว้ เมื่อแสดงว่าเหลือ 0 คำขอ ให้กลับหน้าประวัติคำขอหรือโหลดแท็บเดิมใหม่ หากเปิดคนละ port หรือคนละเบราว์เซอร์จะเป็นคนละฐานข้อมูล

ข้อมูลบน Vercel อยู่ใน PostgreSQL ของ Supabase ส่วนไฟล์ในโฟลเดอร์นี้ใช้สร้างฐานหรือเปิดดูตัวอย่าง ไม่ใช่ข้อมูลที่เปลี่ยนทุกครั้งเมื่อผู้ใช้ยื่นลา

| ตำแหน่ง | ใช้ทำอะไร |
| --- | --- |
| `supabase/setup-10-people.sql` | สร้างฐาน PostgreSQL พร้อมชุดทดลอง 10 คน สำหรับฐานใหม่ |
| `supabase/002-cloud-api.sql` | เพิ่มตาราง session และไฟล์แนบในฐานที่สร้างแล้ว โดยรักษาข้อมูลเดิม |
| `schema.sql` | schema กลางสำหรับ SQLite และตัวสร้าง SQL; มีเพียงสำเนาเดียว |
| `sqlite/leave-management-10-people.sqlite` | เปิดดูชุด 10 คนด้วยโปรแกรม SQLite |
| `sqlite/leave-management-10-people.sql` | ส่งออก schema พร้อมชุด 10 คน เพื่อนำเข้า SQLite ฐานใหม่ |
| `legacy/` | ตัวอย่างชุดเก่าที่เก็บไว้เพื่ออ้างอิง แอปปัจจุบันไม่ได้ใช้ |

ต้นทางชุดทดลองที่แอปใช้คือ [src/data/leave-management-10-people.json](../src/data/leave-management-10-people.json) เพียงชุดเดียว SQL ของ PostgreSQL และไฟล์ SQL/SQLite ใน `sqlite/` สร้างจากต้นทางนี้ โครงสร้าง SQL ต่างกันตามชนิดฐานข้อมูล จึงใช้แทนกันไม่ได้

ตรวจว่าต้นทางและไฟล์ส่งออกตรงกัน โดยไม่เขียนทับข้อมูล:

```bash
npm run data:check
```

สร้างต้นทางและไฟล์ส่งออกใหม่จากตัวสร้างข้อมูลทดลอง:

```bash
npm run data:generate
```

คำสั่งสร้างใหม่เขียนเฉพาะ source JSON และไฟล์ส่งออก ไม่เปลี่ยน IndexedDB, mock runtime หรือ Supabase ที่ใช้งานอยู่ การนำ SQL setup ไปรันซ้ำในฐานเดิมไม่ใช่วิธีอัปเดตข้อมูล

Data Dictionary ต้นฉบับอยู่ที่ [docs/reference/data-dictionary.csv](../docs/reference/data-dictionary.csv) ส่วนคำอธิบายตารางอยู่ใน [docs/DATABASE.md](../docs/DATABASE.md)
