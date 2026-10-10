# เตรียมฐานกลาง Supabase สำหรับ Vercel

สถานะ: เตรียม schema PostgreSQL และชุดข้อมูล 10 คนสำหรับนำเข้าแล้ว **ยังไม่ได้เชื่อมแอปกับ Supabase** ตัวเลือกข้อมูลใน `src/data/index.ts` ยังมี IndexedDB (`mock`) และ mock REST API (`api`) ตามเดิม การเชื่อม Supabase กับ Vercel อย่างเดียวไม่เปลี่ยนแหล่งข้อมูลของแอป

## นำเข้าฐานใหม่

1. ใน Vercel Storage ตรวจฐาน `leave-management` ว่า Available และ Connected Projects เป็น `leave-app`
2. กด Open in Supabase → SQL Editor → New query
3. เปิด `database/supabase/setup-10-people.sql` ใน VS Code คัดลอก **ทั้งไฟล์** ไปวาง แล้วกด Run ด้วยบัญชีผู้ดูแลฐาน
4. ผลท้ายไฟล์ควรเป็น Employee 7, Manager 2 และ HR 1 รวม 10 คน
5. ใน Table Editor เปลี่ยน schema จาก `public` เป็น `leave_app` เพื่อดูตาราง

ไฟล์นี้ใช้ PostgreSQL 15 ขึ้นไป ไม่ใช้ไฟล์ SQLite ใน `src/data/` มารันกับ Supabase โดยตรง และไม่ต้องทำ Quickstart ตัวอย่าง Next.js/ตาราง notes เพราะโปรเจกต์เดิมเป็น React + Vite

สร้าง 9 ตารางหลักตาม `docs/DATABASE.md` พร้อม App_Notification/App_Holiday และ views สำหรับค่าคำนวณ ใช้วันที่ ISO ค.ศ., timestamp `TIMESTAMPTZ` และ timeline `JSONB` ชื่อ SQL ที่ไม่ใส่เครื่องหมายคำพูดจะเป็นตัวพิมพ์เล็ก เช่น `leave_app.employee`; mapping คอลัมน์เดิมยังใช้ได้ PK รับ id ชัดเจนตามข้อมูลเดิม ไม่เพิ่มลำดับเลขอัตโนมัติที่อาจชนกับ seed

ดำเนินการใน transaction เดียวและสร้างเฉพาะ schema ใหม่ `leave_app` หากมี schema นี้แล้วจะหยุดโดยไม่ล้าง/แทนข้อมูล ห้ามเติม DROP/TRUNCATE เพื่อรันซ้ำ ส่งข้อความผิดพลาดมาตรวจแทน ไม่ย้ายข้อมูลจาก IndexedDB ของโทรศัพท์/คอม หรือไฟล์ runtime หลังบ้านเดิม

## สิทธิ์และขั้นตอนที่ยังต้องทำ

ตารางอยู่ใน schema `leave_app` เปิด RLS และถอนสิทธิ์ schema/tables/views ของ PUBLIC/anon/authenticated ไม่มี policy ให้เบราว์เซอร์เข้าถึงโดยตรง แนวทางคือเชื่อมผ่าน API ฝั่ง server ที่ตรวจ session, role, manager assignment และใช้กฎใน `src/domain/service.ts` ภายใน transaction พร้อม concurrency control การเปิด RLS นี้ **ยังไม่ใช่การติดตั้งระบบสิทธิ์รายบทบาทที่ใช้งานได้**

บัญชี Employee ใน seed เป็นข้อมูลทดลอง ไม่ได้สร้าง Supabase Auth users และไม่บันทึกรหัสผ่าน demo ลงฐาน ขั้นต่อไปต้องจัดการ login/session สำหรับ backend ที่ deploy, สร้าง API ตาม `docs/API.md`, ปรับ repository และทดสอบการยื่น/อนุมัติจากสองอุปกรณ์ จึงค่อยตั้ง `VITE_DATA_MODE=api` พร้อม URL ของ API ที่พร้อมใช้งาน และ redeploy อย่าเปิด api mode ไปที่ `/api` ของเว็บ static ก่อนมี backend

ไม่ใส่ POSTGRES_PASSWORD, POSTGRES_URL, service-role/secret key ใน `VITE_*` หรือ source code ตัวแปรจาก Vercel integration ใช้ฝั่ง server; prefix สาธารณะ `VITE_` ใช้ได้เฉพาะ URL/publishable key ที่ออกแบบไว้ให้เปิดเผย ชื่อจริงของตัวแปรอาจขึ้นกับ integration ให้ตรวจชื่อโดยไม่เผยแพร่ค่า

## เอกสาร 100 MB

รักษาข้อกำหนด 100 MiB ของแอปไว้ แต่ Supabase Storage Free จำกัด 50 MB ต่อไฟล์ และ Vercel Functions จำกัด request/response 4.5 MB จึงส่ง base64 ของไฟล์ใหญ่ผ่าน `/api/commands` หรือ snapshot แบบ mock เดิมไม่ได้ ต้องเตรียม object storage ที่รองรับ 100 MiB, upload โดยตรงจาก client และ download ด้วย URL ที่ตรวจสิทธิ์ พร้อมปรับ contract/adapter ก่อนเปิดใช้งานจริง ไม่ลดเพดานในแอปโดยอัตโนมัติ

## สร้างไฟล์ใหม่และตรวจสอบ

```bash
node scripts/generate-supabase.mjs
```

อ่าน schema อ้างอิงและ source JSON ปัจจุบันเพื่อสร้าง SQL เท่านั้น ไม่เชื่อม network หรือแตะ runtime database หลังแก้ source ให้สร้างไฟล์นี้ใหม่ แต่การสร้างไฟล์ไม่อัปเดตข้อมูลบน Supabase ที่นำเข้าแล้ว

ผลตรวจวันที่ 10/10/2569: `npm test` ผ่าน 153 รายการ, `npm run typecheck` และ `npm run build` ผ่าน เพิ่ม `tests/supabase-schema.test.ts` 6 รายการ ใช้ PGlite (PostgreSQL แบบฝังตัว เป็น dev dependency สำหรับ tests เท่านั้น) ตรวจ SQL ทั้งไฟล์จริง ตาราง/seed/วันที่/timeline/เอกสาร/นโยบาย ยอดสิทธิ์เทียบ domain การปิดสิทธิ์ tables/views รวมกรณีให้ SELECT โดยพลาด การรันซ้ำไม่ทับข้อมูล และอักขระ quote/backslash ใช้ฐานในหน่วยความจำแยก ไม่ได้รัน SQL บน Supabase ของผู้ใช้หรือยืนยันการซิงก์ข้ามอุปกรณ์

แหล่งอ้างอิง: [Supabase/Vercel integration](https://supabase.com/docs/guides/integrations/vercel-marketplace), [grants และ RLS](https://supabase.com/docs/guides/api/securing-your-api), [Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits), [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
