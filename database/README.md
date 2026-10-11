# ไฟล์ฐานข้อมูล

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
