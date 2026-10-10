# Leave Management — ข้อกำหนดสำหรับพัฒนาต่อ

ไฟล์นี้เป็นแนวทางประจำโปรเจกต์สำหรับผู้พัฒนาและ coding agent ให้ใช้อ้างอิงทุกครั้งที่พัฒนาต่อจากโค้ดปัจจุบัน และรักษาข้อกำหนดด้านวันที่ โครงสร้างข้อมูล สิทธิ์ และขั้นตอนการลา เว้นแต่ผู้ใช้ระบุให้เปลี่ยนอย่างชัดเจน

## ก่อนเริ่มงาน

1. อ่าน `README.md`, `docs/DESIGN.md`, `docs/API.md`, `docs/DATABASE.md` และ `package.json` ก่อนแก้ไข
2. ตรวจโค้ดที่เกี่ยวข้องกับงานจริง รวมถึง domain, repository, server และ tests ตามขอบเขตของการเปลี่ยนแปลง
3. ตรวจ `AGENTS.md` เดิมก่อนปรับเอกสารนี้ และรักษาข้อกำหนดที่ยังใช้ได้
4. พัฒนาต่อจากโครงสร้างปัจจุบันตามงานที่ผู้ใช้ระบุ หากผู้ใช้ขอเพียงทำความเข้าใจหรือบันทึกข้อกำหนด ให้ทำเฉพาะงานนั้น
5. หากเอกสารกับโค้ดต่างกัน ให้ระบุความต่างและตรวจจาก implementation กับ `package.json` ก่อนรายงานหรือเปลี่ยนพฤติกรรม

## ภาพรวมและเทคโนโลยี

- ระบบจัดการการลาภาษาไทย ชื่อ **Leave Management** สำหรับ `Employee`, `Manager` และ `HR`
- ใช้ภาษาไทยกับเมนู ปุ่ม แบบฟอร์ม สถานะและคำแนะนำ; คงชื่อแบรนด์ `leave.`/`Leave Management`/`Space for your balance` เป็นอังกฤษพร้อม `lang="en"` และคงชื่อมาตรฐานไฟล์/คีย์ลัด คำย่อ HR/WFH ใช้คู่คำอธิบายไทย ใช้ `src/labels.ts` แปล enum เฉพาะการแสดงผล ห้ามเปลี่ยนค่าที่เก็บหรือแปลข้อความที่ผู้ใช้กรอก/ประวัติอัตโนมัติ ข้อผิดพลาดสำหรับผู้ใช้ไม่แสดงคำสั่ง server หรือชื่อตัวแปร environment แนวทางภาษาใน `docs/DESIGN.md`; UI ปัจจุบันยังไม่มีสวิตช์ภาษาอังกฤษทั้งระบบ
- Frontend: React + TypeScript + Vite; icons: Lucide React
- ฟอนต์ IBM Plex Sans Thai อยู่ใน `public/fonts/` พร้อมใบอนุญาต `OFL.txt` ให้รักษาไฟล์ฟอนต์และใบอนุญาต
- UI ตามความต้องการล่าสุด: ธีมสว่างมีพื้นมิ้นต์กับการ์ดขาว เมนูมิ้นต์อ่อนใช้ตัวอักษรเขียวเข้ม 14px/500 และไอคอน 20px เส้น 2; ธีมมืดใช้เทาชาร์โคล การ์ดเทาที่สว่างขึ้น ตัวอักษรขาวนวล ปุ่ม/ลิงก์ฟ้าอ่อน และเมนูที่เลือกน้ำเงิน ลดความเด่นของภาพประกอบและส่วนตกแต่ง ใช้สีแยกสถานะ มีค้นหาด่วน และ responsive layout
- สีและรูปแบบหลักอยู่ใน tokens ของ `src/styles.css` ตรวจความชัดของข้อความ ไอคอน ข้อความรอง hover, focus และ badge ในทั้งสองธีมเมื่อแก้ UI และคงชื่อสถานะไว้ ไม่ใช้สีสื่อสถานะเพียงอย่างเดียว
- ใช้ `LeaveRepository` ใน `src/domain/types.ts` เป็น interface เพื่อเปลี่ยนแหล่งข้อมูลได้ภายหลัง
- จังหวะ Login ต้องรอทั้งบัญชีและ snapshot ตามสิทธิ์ก่อนเปิด workspace; `src/motion.ts` กำหนดช่วง checking/ready/leaving และเวลาออก drawer ห้ามแสดงว่าข้อมูลพร้อมก่อนโหลดสำเร็จ รักษาการป้องกันส่งซ้ำ ข้อผิดพลาด โฟกัส `inert` และ timer cleanup รวมถึงข้ามแอนิเมชัน/เวลารอเมื่อเครื่องตั้ง Reduce Motion อย่าใส่ transform บน main/app-shell ที่ทำให้ fixed date picker เปลี่ยนจุดอ้างอิง
- หน้า Login ต้องเลือกบทบาทก่อนเปิดรายการบัญชีทดลอง และแสดงเฉพาะบัญชีของหมวดที่เลือก ไม่รวม Employee/Manager/HR ในรายการเดียว รักษาการเลือกครบ 10 คนและพิมพ์อีเมลเอง; หมวดที่เลือกเป็นเพียงตัวช่วยกรอก สิทธิ์ต้องมาจากบัญชีที่ repository ยืนยันตัวตน
- หน้าสถานะเพื่อนร่วมงานโหลดสถานะพนักงาน active ทุกคน (รวมเจ้าของบัญชี) ทันทีเมื่อเปิดหน้า ทุกบทบาทใช้ได้ `searchColleagues('', date)`/API ที่ไม่มี query หรือ query ว่างคืนรายชื่อทั้งหมดตามวันที่ เรียงตามชื่อ มีตัวกรองชื่อ/รหัสและปุ่มแสดงทุกคน รักษา minimal projection/การตรวจ session และขอบเขต private snapshot เดิม การแก้ draft ยังไม่เปลี่ยนรายการจนกดค้นหา; รีเฟรชใช้ตัวกรองที่ส่งล่าสุด

## โครงสร้างโค้ด

| ตำแหน่ง | หน้าที่ |
| --- | --- |
| `src/App.tsx` | Login, layout, เมนูตามบทบาท, hash routing, ธีม และโหลด/รีเฟรชข้อมูล |
| `src/Navigation.tsx` | เมนูพื้นที่ทำงาน และ drawer ทับหน้าบนโทรศัพท์พร้อมล็อก scroll/focus ของพื้นหลัง |
| `src/EntryTransition.tsx`, `src/motion.ts` | สถานะตรวจสอบ/ต้อนรับ/เปิดพื้นที่ทำงาน และ timer ที่ยกเลิกได้พร้อมรองรับ Reduce Motion |
| `src/Dashboard.tsx` | Dashboard และข้อมูลภาพรวมตามบทบาท |
| `src/ui.tsx` | องค์ประกอบ Dashboard, ค้นหาด่วน และขั้นตอนแบบฟอร์ม |
| `src/pages.tsx` | แบบฟอร์ม คำขอ ปฏิทิน สถานะทำงาน การแจ้งเตือน และหน้าจอ HR |
| `src/ColleaguesPage.tsx` | ค้นหาสถานะเพื่อนร่วมงานด้วยชื่อ/รหัสและวันที่ พ.ศ. สำหรับทุกบทบาท |
| `src/components.tsx` | ตาราง date picker, dialog และเอกสาร |
| `src/styles.css` | สี รูปแบบ ธีม และ responsive layout |
| `src/labels.ts` | คำแสดงผลกลางของบทบาท สถานะคำขอ ช่วงเวลา และสถานะงาน; ไม่เปลี่ยน enum ที่เก็บ |
| `src/domain/types.ts` | โครงสร้างข้อมูล คำสั่ง และ repository interface |
| `src/domain/date.ts` | แปลงวันที่ ตรวจวันที่ และคำนวณวันตามเขตเวลาไทย |
| `src/domain/attachments.ts` | ค่ากลางชนิด/ขนาดเอกสาร 100 MiB และเพดาน HTTP สำหรับ base64 |
| `src/domain/service.ts` | กฎการลา ตรวจสิทธิ์ กรองข้อมูล คำนวณโควตา และประมวลผลคำสั่ง |
| `src/domain/colleagues.ts` | projection สถานะพื้นฐานของพนักงาน active สำหรับผู้ใช้ที่เข้าสู่ระบบ และรหัสแสดงผลจาก Employee.id |
| `src/domain/seed.ts` | บัญชี ข้อมูลจำลอง และนโยบายตัวอย่าง |
| `src/data/index.ts` | เลือก repository ตามโหมดข้อมูล |
| `src/data/demoDatabase.ts` | `createDemoDatabase()` clone ชุด JSON 10 คนสำหรับเริ่มต้นและคืนค่า; `getDemoAccounts()` ให้รายการบัญชีทดลองบนหน้า Login จาก source เดียวกัน |
| `src/data/leave-management-10-people.json` | ชุดข้อมูลต้นทาง 10 คนที่แอปใช้ในทั้งสองโหมด |
| `src/data/browserRepository.ts` | IndexedDB และ session จำลองในเบราว์เซอร์ |
| `src/data/apiRepository.ts` | REST API adapter |
| `server/index.ts` | Mock REST API และ cookie session |
| `server/store.ts` | อ่าน/เขียน JSON แบบ serialized และ atomic rename |
| `api/router.ts`, `server/cloudApi.ts` | PostgreSQL REST API บน Vercel ตรวจ session/สิทธิ์และส่งเอกสารเป็น parts |
| `server/postgresStore.ts` | mapping PostgreSQL, transaction/lock และเขียนเฉพาะแถวที่เปลี่ยน |
| `database/supabase/` | SQL setup 10 คน และ migration ตาราง session/upload ของฐานกลาง |
| `server/seed.ts` | คืนค่าข้อมูลหลังบ้านจำลอง |
| `scripts/dev-api.mjs` | เปิด frontend พร้อม mock REST server |
| `database/` | schema SQL, seed, JSON และ SQLite ตัวอย่าง |
| `tests/` | ทดสอบวันที่ กฎ/สิทธิ์ หน้าจอ และ HTTP API |

## วันที่ — ข้อกำหนดที่ต้องรักษา

- วันที่บนหน้าจอและช่องกรอกต้องเป็น **วัน/เดือน/ปี พ.ศ.** เช่น `5/12/2569` ไม่ใช่เดือน/วัน/ปี
- API และฐานข้อมูลเก็บวันที่เป็น **ISO ค.ศ.** เช่น `2026-12-05`; ปีของสิทธิ์รายปีเก็บเป็น ค.ศ.
- ใช้ฟังก์ชันใน `src/domain/date.ts`: `formatDate`, `parseThaiDate`, `formatDateTime`, `today` และ helpers ที่เกี่ยวข้อง
- ห้ามบวก 543 แล้วนำวันที่หรือปี พ.ศ. ไปเก็บใน API/ฐานข้อมูล การแปลง พ.ศ. เป็นเรื่องของการแสดงผลและรับค่าจาก UI
- เวลาที่แสดงและวันที่ปัจจุบันใช้ `Asia/Bangkok`; timestamp ของข้อมูลใช้ UTC ISO 8601 ตาม API contract
- รักษาการตรวจวันที่ที่ไม่มีจริง ปีอธิกสุรทิน ข้ามปี และการเปลี่ยนวันตามเขตเวลาไทย

## แหล่งข้อมูลและข้อจำกัดปัจจุบัน

- สำหรับ Supabase/Vercel มี PostgreSQL API แล้วใน `api/router.ts`/`server/cloudApi.ts` และ `server/postgresStore.ts` ใช้ schema `leave_app` จาก `database/supabase/setup-10-people.sql`; ฐานที่นำเข้าแล้วต้องรัน `002-cloud-api.sql` เพิ่ม App_Session/App_Upload/App_Upload_Part โดยไม่ล้างข้อมูลเดิม เปิด RLS ถอนสิทธิ์ PUBLIC/anon/authenticated รวม views ไม่มี browser policy ใช้ backend ตรวจ domain/session/สิทธิ์ภายใน transaction connection เดียวพร้อม advisory lock/SELECT FOR UPDATE และเขียน delta; snapshot ไม่โหลดเนื้อไฟล์และใช้ remote metadata ห้ามทำ data_url ของเอกสารเดิมหายจากการเขียน metadata
- Vercel build เลือก API อัตโนมัติเมื่อไม่ได้ตั้ง mock; ตั้ง VITE_DATA_MODE=api, VITE_API_BASE_URL=/api และ POSTGRES_URL ฝั่ง server พร้อม deploy โค้ดใหม่ ไม่มี fallback ไป IndexedDB ไม่มีการย้ายข้อมูลเก่าข้ามโหมด API ใช้ session token สุ่มเก็บเฉพาะ hash ใน PostgreSQL อายุ 8 ชั่วโมง ตรวจ active/session ใหม่ทุก endpoint และ cookie HttpOnly/SameSite/Secure บน HTTPS บัญชียังเป็น demo ต้อง ENABLE_DEMO_LOGIN=true และยังไม่มี Supabase Auth users ดู docs/SUPABASE.md; ห้ามใส่ secret ใน VITE_* และห้ามนำ SQLite SQL มารันหรือเติม DROP/TRUNCATE เพื่อรัน setup ซ้ำ
- Cloud รองรับ 100 MiB โดยส่ง base64 เป็น parts ขนาด 2 MiB ตัวอักษร (67 parts ที่ขนาดสูงสุด) body/response ต่ำกว่าเพดาน Vercel 4.5 MB ใช้ TEXT ใน PostgreSQL พร้อม upload staging ไม่ใช้ Supabase Storage ที่ Free จำกัด 50 MB/object พื้นที่ฐาน Free 500 MB ใช้ร่วมข้อมูล/เอกสารและ staging ชั่วคราว จึงเป็นทางเลือกสำหรับทดลอง ก่อนใช้งานจริงควรเปลี่ยนเป็น private object storage; ตรวจสิทธิ์ดาวน์โหลดทุก part ปุ่ม HR คืนค่าใน cloud มีผลทุกเครื่อง และ JSON export มีเฉพาะ metadata เอกสาร ไม่รวมไฟล์ remote
- โหมดเบราว์เซอร์ใช้ IndexedDB (`mock`) ชื่อ `leave-management-10-people-v1`; โหมด `api` ใช้ Node.js REST API บันทึกลง `server/data/leave-management-10-people.json` เป็นค่าเริ่มต้น หรือไฟล์จาก `MOCK_DATA_FILE`
- ทั้งสองโหมดเริ่มต้นและคืนค่าผ่าน `createDemoDatabase()` ใน `src/data/demoDatabase.ts` ซึ่ง clone `src/data/leave-management-10-people.json` ชุด 10 คน: Employee 7, Manager 2 และ HR 1
- เก็บฐานเดิม IndexedDB `leave-management-v1` และ `server/data/db.json` ไว้ ไม่ย้ายหรือเขียนทับอัตโนมัติ โหมดเบราว์เซอร์ใช้ session key `leave-10-people-demo-session` และ BroadcastChannel `leave-10-people-data` แยกจากเดิม
- เลือก API ด้วย `VITE_DATA_MODE=api` และตั้ง URL ผ่าน `VITE_API_BASE_URL` ตาม `docs/API.md`
- ข้อมูลสองโหมดเป็นคนละชุด ไม่มีการย้ายหรือซิงก์ข้อมูลระหว่างโหมดอัตโนมัติ
- `src/data/leave-management-10-people.sqlite`/`.sql` เป็นไฟล์ส่งออกของชุด 10 คน; `database/mock.sqlite`, `database/schema.sql` และ `database/seed.sql` เป็นตัวอย่างเดิม Mock server ปัจจุบันใช้ JSON **ยังไม่ได้เชื่อม SQLite อัตโนมัติ** และการทำรายการไม่ซิงก์กลับ source JSON หรือไฟล์ส่งออก
- Mock JSON server serialize คำสั่งและเขียนไฟล์แบบ atomic เหมาะสำหรับ process เดียว หลังบ้านหลาย instance ต้องใช้ database transaction และ concurrency control จริง
- บัญชีและการยืนยันตัวตนเป็น demo; session ของ mock server อยู่ใน memory อายุ 8 ชั่วโมงและหายเมื่อ restart ก่อนใช้ข้อมูลจริงต้องเปลี่ยนระบบ login/session และตรวจสิทธิ์ที่ server
- ห้ามใส่ secret หรือรหัสฐานข้อมูลใน frontend/ตัวแปร `VITE_*` เพราะค่าเหล่านี้อยู่ในไฟล์เว็บ
- เอกสารจำลองเก็บ base64/data URL รองรับ PDF/JPG/PNG ไม่เกิน 100 MiB ต่อไฟล์ (หน้าจอแสดง 100 MB ตามหน่วยเดิม) ใช้ค่ากลางใน `src/domain/attachments.ts`; ตรวจขนาดจริงจาก base64 กับ fileSize และ signature ทั้งสองโหมด Commands รับ HTTP body เผื่อ base64+metadata ส่วน Login จำกัด 64 KiB การเก็บ snapshot/JSON ยังใช้พื้นที่และหน่วยความจำตามขนาดเอกสาร พื้นที่/โควตาเบราว์เซอร์ยังมีผล หลังบ้านจริงควรใช้ upload/object storage โดยปรับ adapter และ contract ให้สอดคล้องกัน
- IndexedDB แบ่ง data URL ใหญ่เป็น string chunks ไม่เกิน 4 MiB ต่อ record ใน object store เดิมและ database version 1; inline ต่อเอกสารไม่เกิน 1 MiB รวมไม่เกิน 4 MiB อ่านกลับเป็น `Database` เดิม และบันทึกคำขอ/เอกสาร/ล้าง chunks เก่าใน transaction เดียว รักษาการอ่านข้อมูล inline เดิมและการแปลงเมื่อเขียนสำเร็จ โดยไม่รีเซ็ตข้อมูล อ่าน snapshot แบบ readonly และไม่เขียน chunks ที่ไม่เปลี่ยนซ้ำ; รายละเอียดใน `docs/DATABASE.md`
- วันหยุดต้องตั้งค่าเอง ไม่มีปฏิทินวันหยุดราชการอัตโนมัติ
- การแก้ source JSON ไม่เขียนทับข้อมูล runtime ที่ใช้อยู่ จะมีผลเมื่อเริ่มฐานใหม่หรือคืนค่าข้อมูลจำลอง หากแก้ตัวสร้างข้อมูลให้สร้าง source ใหม่ด้วย `node --import tsx src/data/generate.ts` และส่งออก SQL/SQLite ด้วย `python src/data/build-sqlite.py` คำสั่งเหล่านี้เขียนเฉพาะไฟล์ใน `src/data/` ไม่แก้ฐาน runtime
- Source JSON ถูก import เข้ามาในโปรแกรม หลังแก้ source ต้องรีสตาร์ต mock server/โหลด frontend ใหม่ (production ต้อง build และเผยแพร่ใหม่) ก่อนเรียกคืนค่าเพื่อใช้ source ที่เปลี่ยนแล้ว
- HR คืนค่าข้อมูลจำลองในโหมดที่ใช้งานอยู่เพื่อโหลด source 10 คนใหม่ได้; โหมด API มี CLI `npm run seed -- --confirm` การคืนค่าล้างการแก้ไขในฐาน runtime ที่เลือก อย่ารีเซ็ตข้อมูลที่มีอยู่เพื่อทดสอบโดยไม่อยู่ในขอบเขตงานที่ผู้ใช้สั่ง
- ชุด 10 คนจัดสรรสิทธิ์รายปี ค.ศ. 2026 และ 2027 ตาม source ตัวอย่างคงที่ ปีอื่นต้องให้ HR จัดสรร ส่วน `createSeed()` ใน `src/domain/seed.ts` ยังเป็นตัวสร้างพื้นฐานที่ใช้ปีปัจจุบัน/ถัดไป การเปลี่ยนโควตาตั้งต้นไม่แก้สิทธิ์ที่จัดสรรไปแล้ว
- หน้า policy ปรับชื่อ วันล่วงหน้า โควตาตั้งต้น และเกณฑ์เอกสารได้ ส่วน quota scope, วิธีนับวัน และเงื่อนไขเพศต้องแก้ seed/backend ตามขอบเขตงาน

## โครงสร้างฐานข้อมูล

ยึด **9 ตารางหลัก** และ mapping ใน `docs/DATABASE.md`:

| ตารางหลัก | Array ในแอป |
| --- | --- |
| `Employee` | `employees` |
| `Leave_Type` | `leaveTypes` |
| `Leave_Entitlement` | `entitlements` |
| `Maternity_Case` | `maternityCases` |
| `Leave_Request` | `requests` |
| `Leave_Day` | `days` |
| `Leave_Document` | `documents` |
| `Leave_Approval` | `approvals` |
| `Work_Status` | `workStatuses` |

ส่วนเพิ่มที่มีอยู่เพื่อให้แอปทำงานครบ ได้แก่ department/active, `Withdrawn`, `Full`/`AM`/`PM`, units และโควตาแบบ 0.5 วัน, request version, timeline, ยกเลิกการพิจารณาเดิม, `Consultation` สถานะ `Completed`, document data URL และ `schemaVersion` รวมถึงตารางสนับสนุน `App_Notification`/`notifications` และ `App_Holiday`/`holidays` ซึ่งไม่นับรวมใน 9 ตารางหลัก

ค่ารวมวันลา ใช้แล้ว คงเหลือ และรออนุมัติเป็นค่าคำนวณจากข้อมูลคำขอ/วันลา อย่าเพิ่มการบันทึกค่าซ้ำที่ทำให้ยอดไม่สอดคล้องกัน หากแก้ schema, types หรือ API contract ให้ปรับ mapping และเอกสารที่เกี่ยวข้องพร้อมกัน

## สิทธิ์และขั้นตอนการลา

- ตรวจสิทธิ์ทั้ง **การอ่านข้อมูล** และ **การทำรายการ** ไม่อาศัยเพียงการซ่อนเมนูหรือปุ่ม
- พนักงานเห็นคำขอตัวเอง ผู้จัดการเห็นทีมที่ได้รับมอบหมายตาม `managerId` HR อ่านข้อมูลเพื่อดูแลสิทธิ์ได้ แต่ให้ความเห็นได้เฉพาะคำขอที่ได้รับมอบหมาย
- รักษา snapshot ที่กรองตามบทบาท รวมถึงผลค้นหาด่วน เอกสาร โควตา และการแจ้งเตือนตามสิทธิ์
- เมนูสถานะเพื่อนร่วมงานเป็นสิทธิ์อ่านสถานะพื้นฐานข้ามฝ่ายสำหรับผู้ใช้ Employee/Manager/HR ที่เข้าสู่ระบบและ active ผ่าน `LeaveRepository.searchColleagues()`/`GET /api/colleagues`; ส่งเฉพาะ employeeId/name/position/department/date/workStatus/leaveDuration/updatedAt ไม่ขยาย private snapshot หรือเปิดอีเมล/เบอร์โทร/เพศ/รายละเอียดคำขอ ตรวจ session ที่ server รหัส EMP-00001 คำนวณจาก Employee.id ไม่เพิ่ม field/tables; ไม่มี Work_Status ให้แสดง “ยังไม่ได้ระบุสถานะ” ใช้วันลา Approved เท่านั้นและแยก Full/AM/PM
- ในโหมด API ผู้กระทำต้องมาจาก session ฝั่ง server ไม่รับ `actorId` หรือ role จาก request body เป็นหลักฐานสิทธิ์ เมื่อเชื่อมหลังบ้านจริงต้องตรวจ session, role และ manager assignment ที่ server ทุกครั้ง
- Employee ยื่นลา แนบเอกสาร ตรวจสอบก่อนส่ง และติดตามสถานะได้
- แก้ไขหรือยกเลิกได้เฉพาะคำขอของตนที่ยัง `Pending` การแก้ไขยกเลิกการพิจารณาเดิมและเริ่มพิจารณาใหม่ โดยรักษาประวัติ
- Manager อนุมัติ ไม่อนุมัติพร้อมเหตุผล หรือส่งปรึกษา HR ได้
- HR ส่งความเห็นในรายการที่ได้รับมอบหมาย ความเห็น HR ไม่อนุมัติคำขอและไม่หักโควตา Manager เป็นผู้ตัดสินผลสุดท้าย
- ระหว่างมี consultation ที่ยังรอความเห็น HR ต้องไม่ให้ Manager ตัดสินผล
- หักโควตาเฉพาะคำขอ `Approved` แยกยอด `Pending` เพื่อกันยื่นเกินสิทธิ์ และป้องกันอนุมัติซ้ำ
- คำสั่งที่แก้คำขอต้องตรวจ `version` ล่าสุด เมื่อได้ conflict/HTTP 409 ให้โหลดข้อมูลใหม่ก่อนทำรายการต่อ
- ก่อนอนุมัติต้องตรวจโควตาล่าสุด เมื่อใช้ฐานข้อมูลจริงให้ตรวจ version/lock และโควตาใน transaction เดียวกัน
- รองรับครึ่งวันเช้า/บ่ายเฉพาะวันเดียว ตรวจวันลาซ้อน แบ่งโควตาคำขอข้ามปีตามแต่ละวัน ยกเว้นวันหยุดตามนโยบาย และใช้สิทธิ์ลาคลอดต่อกรณี
- วันทำงานไม่นับเสาร์–อาทิตย์และวันหยุดที่ตั้งไว้ ลาคลอดนับตามปฏิทิน การเปลี่ยนวันหยุดไม่คำนวณคำขอเดิมย้อนหลังจนกว่าจะมีการแก้ไขคำขอ
- สถานะทำงาน `Leave` มาจากคำขอที่อนุมัติ ไม่ใช่สถานะที่ผู้ใช้เลือกเพื่อหักโควตาเอง
- เงื่อนไขและโควตาใน seed เป็น **นโยบายตัวอย่างที่ปรับได้** ไม่ใช่การรับรองนโยบายองค์กรหรือกฎหมาย อย่านำค่าตัวอย่างไป hardcode เป็นข้อกำหนดถาวร
- ลาคลอดตรวจเพศจาก `Employee` ของเจ้าของคำขอล่าสุดหลัง session/สิทธิ์: Female ผ่านเบื้องต้น, Male แจ้งไม่มีสิทธิ์ตามนโยบายโปรเจกต์, Other/เพศไม่มีหรือไม่ถูกต้องแจ้งติดต่อ HR ไม่เชื่อ gender ใน body ลำดับตรวจคือเพศ → กรณีของตน → ผู้จัดการ → วันที่/Full → เหตุผล/นโยบาย/เอกสาร → ซ้อน → โควตา → หน้าตรวจสอบก่อนส่ง รักษาการตรวจซ้ำที่ submit/edit/approve และ HR เปิดกรณีจากเพศของพนักงานที่เลือก
- สิทธิ์ลาคลอดมาจาก maximumDays ต่อกรณี รวมวันปฏิทินและข้ามปี แสดง Pending แยกและตัดคำขอเดิมออกเมื่อแก้ไข/ตรวจอนุมัติ; ก่อนอนุมัติตรวจกรณีและโควตาล่าสุดร่วมกับ version ใน transaction เดียว ยอดไม่พอเป็น CONFLICT การตรวจล่วงหน้าก่อนอนุมัติอ้างอิงเวลายื่น/แก้ไขล่าสุด ไม่ใช้วันตัดสินผล

## คำสั่งใช้งาน

ต้องใช้ Node.js >= 22.12.0 ตาม `package.json`:

```bash
npm install
npm run dev          # frontend; ค่าเริ่มต้นใช้ IndexedDB
npm run dev:api      # frontend พร้อม mock REST server
npm run dev:cloud    # frontend พร้อม PostgreSQL API; ตั้ง POSTGRES_URL/ENABLE_DEMO_LOGIN ใน .env
npm run cloud:server # PostgreSQL API แยกสำหรับพัฒนา
npm run mock:server  # เปิด mock server แยกต่างหาก
npm test
npm run typecheck
npm run build
npm run preview
```

`npm run dev` ไม่เปิด mock server เอง หากเปิดสอง terminal ให้ตั้ง `VITE_DATA_MODE=api` แล้วใช้ `npm run mock:server` ร่วมกับ `npm run dev` ดู proxy/port ใน `vite.config.ts` และ README

## การตรวจสอบและรายงานผล

- สถานะเชื่อม PostgreSQL API (11/10/2569): npm test ผ่าน 161 รายการ npm run typecheck และ npm run build ผ่าน (build ตั้ง VERCEL=1 ตรวจค่าเริ่มต้น API) ตรวจ migration ซ้ำ/session ข้าม handler/สิทธิ์ตามบทบาท/ลาคลอดล่าสุด/โควตาพร้อมกัน/rollback/ไฟล์ multipart ผ่าน PGlite แยกจากข้อมูลผู้ใช้ ตรวจ Edge headless 154 ด้วย production bundle แบบ Vercel, viewport 320/390/1440px และสองธีม ผ่าน 11 กรณี รวมยื่นไฟล์ 100 MiB 67 parts เห็นจากอีกเซสชัน ผู้จัดการอนุมัติ และดาวน์โหลดกลับขนาด/hash ตรงกัน ไม่พบ page error หรือ horizontal overflow ตรวจภาพแล้ว ยังไม่ได้เชื่อม Supabase ของผู้ใช้หรือ deploy บน Vercel จริง และไม่ได้ตรวจบนโทรศัพท์จริง

- การเตรียม Supabase/PostgreSQL (10/10/2569): เพิ่ม SQL setup/ตัวสร้าง/คู่มือและ tests/supabase-schema.test.ts 6 รายการผ่าน PGlite dev dependency บนฐานแยก ตรวจ schema/seed/ISO/timeline/เอกสาร/นโยบาย/ยอดเทียบ domain, RLS+grants รวม views, import ซ้ำไม่เขียนทับ และ escape ตัวอักษร; npm test ผ่าน 153 รายการ typecheck/build ผ่าน ยังไม่ได้รันกับ Supabase จริงหรือเชื่อม frontend/API และยังไม่ยืนยันการซิงก์ข้ามเครื่อง
- เลือกตรวจให้ตรงกับสิ่งที่เปลี่ยน หากแก้วันที่ กฎการลา โควตา หรือสิทธิ์ ให้ตรวจกรณีที่เกี่ยวข้องใน `tests/date.test.ts`, `tests/workflow.test.ts` และ `tests/api.test.ts`
- หากแก้หน้าจอ ให้ตรวจการ render ใน `tests/screens.test.ts`; หากแก้สีให้ตรวจ `tests/theme.test.ts` (คู่สีข้อความ ≥4.5:1 และขอบช่องกรอก/focus ≥3:1) และตรวจหน้าตา/การคลิกด้วยเบราว์เซอร์จริงเมื่อทำได้ โดยครอบคลุมบทบาท ธีม และขนาดหน้าจอที่ได้รับผลกระทบ การผ่านคู่สีไม่ใช่การรับรองทุกองค์ประกอบหรือความสบายตาบนอุปกรณ์จริง
- การ render ด้วย `react-dom/server` ไม่ยืนยัน layout หรือการคลิกในเบราว์เซอร์จริง อย่ารายงานว่า browser/E2E ผ่านหากไม่ได้ตรวจ
- ตรวจ TypeScript และ production build ตามขอบเขตงาน `npm run build` รัน `tsc --noEmit` ก่อน Vite build อยู่แล้ว
- เมื่อเพิ่มหรือแก้พฤติกรรม ให้มีการทดสอบกรณีสำคัญและข้อผิดพลาดที่เกี่ยวข้อง ใช้ฐานข้อมูลทดสอบแยกจากข้อมูลที่ใช้งาน
- รายงานว่า **เปลี่ยนอะไร เพราะอะไร ทดสอบอย่างไร ผลเป็นอย่างไร และมีข้อจำกัดใดที่ยังไม่ได้ตรวจ**
- สถานะที่ยืนยันเมื่อบันทึกไฟล์นี้ (10/10/2569): `npm test` ผ่าน 17 รายการ และ `npm run build` ผ่านรวม TypeScript แล้ว ยังไม่ได้ตรวจหน้าตาและการคลิกด้วยเบราว์เซอร์จริงในรอบนี้ จำนวน tests นี้เป็นสถานะอ้างอิง ไม่ใช่ข้อกำหนดให้คงจำนวนไว้
- สถานะล่าสุดหลังเชื่อมชุดข้อมูล 10 คน (10/10/2569): `npm test` ผ่าน 25 รายการ รวม repository ผ่าน fake IndexedDB, HTTP API และการ render หน้าจอจากชุดใหม่; `npm run build` ผ่านรวม TypeScript และตรวจ CLI seed บนไฟล์ชั่วคราวแล้ว การคลิกด้วยเบราว์เซอร์จริงยังไม่ได้ตรวจเพราะเซสชันนี้ไม่มี browser ให้ควบคุม
- สถานะล่าสุดหลังเพิ่มตัวเลือก Login ครบ 10 คน (10/10/2569): `npm test` ผ่าน 31 รายการ รวมทดสอบ React DOM ผ่าน jsdom ว่าเลือกแต่ละบัญชีแล้วเข้าสู่ repository ได้ถูกคน ตรวจปุ่มบทบาท การพิมพ์อีเมลเอง การแก้ login error และการปิดช่องกรอกระหว่างเข้าสู่ระบบ; `npm run build` ผ่านรวม TypeScript การทดสอบ jsdom ไม่ยืนยัน layout ในเบราว์เซอร์จริง ซึ่งยังไม่ได้ตรวจเพราะเซสชันนี้ไม่มี browser ให้ควบคุม
- สถานะล่าสุดหลังปรับโทรศัพท์จากคลิปผู้ใช้ (10/10/2569): `npm test` ผ่าน 38 รายการ รวม `tests/mobile.test.ts` ตรวจรายการมือถือเทียบกับตารางตามสิทธิ์ Employee/Manager/HR และการเปิด–ปิด drawer, focus/scroll, inert ของพื้นหลัง และเปลี่ยนกลับจอกว้าง; `npm run build` ผ่านรวม TypeScript ยังไม่ได้ตรวจ layout บนเบราว์เซอร์/โทรศัพท์จริง เพราะเซสชันนี้ไม่มี browser ให้ควบคุม
- สถานะล่าสุดหลังเพิ่มจังหวะเข้าสู่ระบบและเคลื่อนไหว (10/10/2569): `npm test` ผ่าน 52 รายการ รวม `tests/entry.test.ts` ตรวจ checking/ready/leaving, ข้อมูลช้า, ข้อผิดพลาด/rollback, ป้องกันส่งซ้ำ, inert/focus, ค้นหาด่วนระหว่างเข้า, Reduce Motion และ unmount; `tests/drawer-motion.test.ts` ตรวจช่วงปิด เปิดซ้ำ เปลี่ยนเป็นจอกว้าง และ Reduce Motion; `npm run build` ผ่านรวม TypeScript ทดสอบผ่าน jsdom/เวลาจำลอง ยังไม่ได้ตรวจภาพหรือความลื่นในเบราว์เซอร์/โทรศัพท์จริง เพราะเครื่องมือไม่พบ browser ที่พร้อมใช้
- สถานะล่าสุดหลังปรับลาคลอด (10/10/2569): `npm test` ผ่าน 84 รายการ, `npm run typecheck` และ `npm run build` ผ่าน เพิ่ม `tests/maternity.test.ts`, `tests/maternity-ui.test.ts` และ `tests/maternity-repositories.test.ts` ครอบคลุมลำดับเพศ/กรณี/ผู้จัดการ/วันที่/นโยบาย/ซ้อน/โควตา, เพศผิด/ไม่มี, กรณีคนอื่น, วันหยุด/ข้ามปี, แก้ไขไม่นับซ้ำ, ผู้จัดการชาย, HR จากเพศเป้าหมาย, สิทธิ์เปลี่ยน, ส่ง API โดยตรงพร้อม gender ปลอม และอนุมัติพร้อมกัน ทดสอบผ่าน jsdom, fake IndexedDB และ mock HTTP server บนไฟล์ชั่วคราวที่แยกจากข้อมูลใช้งาน ไม่พบ browser พร้อมใช้ จึงยังไม่ได้ตรวจขั้นตอน/layout ด้วยเบราว์เซอร์จริง
- สถานะล่าสุดหลังแยกบัญชี Login ตามบทบาท (10/10/2569): `npm test` ผ่าน 85 รายการ, `npm run typecheck` และ `npm run build` ผ่าน ตรวจเริ่มโดยยังไม่เลือกหมวด การสลับหมวดและรายชื่อเฉพาะบทบาทในสองธีม การเข้าสู่ repository ครบ 10 คน อีเมลที่พิมพ์เอง ข้อผิดพลาด และการปิดตัวเลือกระหว่างเข้าสู่ระบบผ่าน jsdom; ไม่พบ browser พร้อมใช้ จึงยังไม่ได้ตรวจ layout หรือการกดด้วยเบราว์เซอร์จริง
- สถานะล่าสุดหลังปรับสีทั้งสองธีม (10/10/2569): `npm test` ผ่าน 97 รายการ รวม `tests/theme.test.ts` 12 รายการ, `npm run typecheck` และ `npm run build` ผ่าน ใช้พื้นกลางและคู่สีตาม tokens เพิ่มข้อความเล็กเป็น 12px และข้อความสำคัญ 13px ตรวจ Edge headless 154 ผ่าน Playwright บน context ทดสอบใหม่ในโหมด IndexedDB ที่แยกจากข้อมูลใช้งาน ครอบคลุม Employee/Manager/HR สองธีม 56 สถานะ ที่ viewport 1440×1000 และมือถือจำลอง 390×844 รวม Login, Dashboard, คำขอ, แบบฟอร์ม, โควตา, สถานะทำงาน, HR, ปฏิทิน, drawer, ค้นหาด่วน, hover และ date picker คู่ข้อความที่วัด computed style 1,740 ตัวอย่างมี contrast ต่ำสุด 5.22:1 ไม่พบ page error หรือหน้า overflow แนวนอน และตรวจภาพ screenshot ประกอบแล้ว ยังไม่ได้ลองบนโทรศัพท์จริงหรือประเมินบนจอของผู้ใช้
- สถานะล่าสุดหลังเพิ่มความสดใสตามคำขอผู้ใช้ (10/10/2569): `npm test` ผ่าน 97 รายการ, `npm run typecheck` และ `npm run build` ผ่าน ธีมสว่างเปลี่ยน sidebar เป็นมิ้นต์สว่าง ธีมมืดเพิ่มความสว่างพื้นฟ้า–เขียว Hero/Login ไล่สีและสีตกแต่งสถิติอิ่มขึ้น ภาพประกอบมืดคงความสว่างต้นฉบับ ขยาย `tests/theme.test.ts` ให้ตรวจปลาย gradient, sidebar logo/badge/focus และข้อความบนทุกสีตกแต่ง ตรวจ Edge headless ทั้ง 3 บทบาท 2 ธีมที่ขนาดคอมและมือถือจำลอง 56 สถานะซ้ำหลังแก้ วัดคู่ข้อความ 1,740 ตัวอย่างต่ำสุด 4.74:1 ไม่พบ page error หรือหน้า overflow แนวนอน พร้อมตรวจภาพจริงจาก screenshot; ยังไม่ได้ทดสอบบนโทรศัพท์จริง
- สถานะล่าสุดหลังเพิ่มความชัดเมนูและลดแสงธีมมืด (10/10/2569): `npm test` ผ่าน 98 รายการ รวม palette 13 รายการ, `npm run typecheck` และ `npm run build` ผ่าน เมนูสว่างเพิ่มความเข้ม/ขนาด/น้ำหนักข้อความและเส้นไอคอน ธีมมืดลดความสว่างของพื้นใหญ่ ใช้ขาวนวล/มิ้นต์นุ่ม ลดภาพและส่วนตกแต่ง แยก `--sidebar-accent-ink` จากข้อความเมนูที่เลือก ตรวจ Edge headless ทั้ง 3 บทบาท 2 ธีม 56 สถานะที่ 1440×1000 และมือถือจำลอง 390×844 พร้อมดูภาพเมนูมือถือและ date picker คู่ข้อความ computed style 1,740 ตัวอย่างต่ำสุด 5.00:1 ไม่พบ page error หรือหน้า overflow แนวนอน ยังไม่ได้ทดสอบบนโทรศัพท์จริงหรือประเมินความสบายตาบนจอของผู้ใช้
- สถานะล่าสุดหลังเปลี่ยนโหมดมืดเป็นเทา–ฟ้า (10/10/2569): เปลี่ยน tokens ธีมมืดทั้งชุดเป็นเทาชาร์โคล/ขาวนวลกับปุ่มและลิงก์ฟ้าอ่อน เมนูที่เลือกน้ำเงิน และรักษาสีแยกสถานะ `npm test` ผ่าน 98 รายการ, `npm run typecheck` และ `npm run build` ผ่าน ตรวจ Edge headless ซ้ำทั้ง 3 บทบาท 2 ธีม 56 สถานะบนขนาดคอม/มือถือจำลอง ตรวจภาพ Dashboard, Login และเมนูมือถือแล้ว คู่ข้อความธีมมืดที่วัดต่ำสุด 5.72:1 ไม่พบ page error หรือหน้า overflow แนวนอน ยังไม่ได้ทดสอบบนโทรศัพท์จริง
- สถานะล่าสุดหลังเพิ่มเอกสารเป็น 100 MB (10/10/2569): `npm test` ผ่าน 125 รายการ, `npm run typecheck` และ `npm run build` ผ่าน เพิ่ม `tests/upload.test.ts`, `tests/upload-ui.test.ts`, `tests/upload-api.test.ts` และ `tests/browser-large-documents.test.ts` ครอบคลุมไฟล์ 100 MiB/เกิน 1 ไบต์จริง, metadata ปลอม/ไม่ตรง, signature/base64/ข้อมูลเดิม, HTTP body limit 413/สิทธิ์, อ่าน/แก้ไข/ดาวน์โหลด, record limit/atomic rollback/chunk cleanup/อนุมัติซ้ำ/HR reset ตรวจ Edge headless 154 บน context ใหม่แยกจากข้อมูลใช้งาน เลือก PDF 100 MiB ตรวจสอบ ส่ง รีโหลด และดาวน์โหลดกลับโดยขนาดและ SHA-256 ตรงกับต้นฉบับ ปฏิเสธไฟล์ 100 MiB+1 ไบต์ ตรวจภาพฟอร์มสองธีมที่มือถือจำลอง 390×844 ไม่พบ page error หรือ overflow แนวนอน ยังไม่ได้ทดสอบบนโทรศัพท์จริง พื้นที่/โควตาและหน่วยความจำของอุปกรณ์ยังมีผลต่อไฟล์ใหญ่
- สถานะล่าสุดหลังจัดภาษา UI (10/10/2569): `npm test` ผ่าน 128 รายการ, `npm run typecheck` และ `npm run build` ผ่าน เพิ่ม `tests/language.test.ts` ตรวจสถานะไทยตรงกันใน Dashboard/ทีม/ตาราง/รายการมือถือ ทั้งเต็มวันและครึ่งวันของ 3 บทบาท การเลือกคำไทยส่ง enum อังกฤษและวันที่ ISO เดิม และ metadata ภาษาอังกฤษของแบรนด์; ปรับ `tests/upload-ui.test.ts` ตรวจปุ่มเลือกไฟล์ไทยและการปิดระหว่างอ่าน ใช้ “รอพิจารณา” สำหรับ Pending ใน badge/สรุปสิทธิ์/ข้อความตรวจโควตา โดยรักษาประวัติเดิม ตรวจ Edge headless 154 ผ่าน 56 สถานะทั้ง 3 บทบาท 2 ธีมที่ขนาดคอม/มือถือจำลอง และสถานะงานเพิ่ม 18 กรณีที่กว้าง 320/390/1440px ว่าข้อความอยู่ในการ์ดและ enum ที่บันทึกไม่เปลี่ยน กด native file picker แนบเอกสาร ตรวจสอบและส่งคำขอได้ รักษาชื่อไฟล์เดิม ไม่พบ page error หรือหน้าล้นแนวนอน ตรวจภาพประกอบแล้ว ใช้ context ทดสอบแยกจากข้อมูลใช้งาน ยังไม่ได้ลองบนโทรศัพท์จริง UI ใช้ภาษาไทยเป็นหลัก ยังไม่มีสวิตช์ภาษาอังกฤษทั้งระบบ
- สถานะล่าสุดหลังเพิ่มสถานะเพื่อนร่วมงาน (10/10/2569): เพิ่มเมนู #/colleagues ทุกบทบาท ค้นหาชื่อบางส่วน/Employee.id/รหัส EMP-00001 และวันที่ พ.ศ. ผ่าน projection พื้นฐานข้ามฝ่ายที่ตรวจ session ไม่ขยาย private snapshot ไม่เปิดรายละเอียดคำขอ ไม่มีสถานะให้แสดงว่ายังไม่ได้ระบุ แยกวันลา Approved เต็มวัน/เช้า/บ่าย และรีเฟรชผลค้นหาจากข้อมูลล่าสุด เพิ่ม tests/colleagues.test.ts, tests/colleagues-repositories.test.ts และ tests/colleagues-ui.test.ts; npm test ผ่าน 144 รายการ, npm run typecheck และ npm run build ผ่าน ตรวจ Edge headless 154 ผ่าน Playwright 74 กรณี ทั้ง IndexedDB/REST API, Employee/Manager/HR, สองธีม และกว้าง 1440/390/320px รวมค้นหา วันลา ข้ามปี วันไม่มีข้อมูล ค่าผิด/ไม่พบคน เมนูมือถือ ค้นหาด่วน date picker ที่ไม่ล้างผลเมื่อวันที่เดิม และเพื่อนบันทึกสถานะใหม่แล้วอีกบัญชีรีเฟรชเห็นตรงกัน ไม่พบ page error หรือหน้าล้นแนวนอน ตรวจภาพ screenshot แล้ว ใช้ context/ไฟล์ทดสอบแยกจากข้อมูลใช้งาน ยังไม่ได้ทดสอบบนโทรศัพท์จริง
- สถานะล่าสุดหลังแสดงสถานะทุกคนทันที (10/10/2569): หน้าเพื่อนร่วมงานโหลดพนักงาน active ทุกคนเมื่อเปิด รวมเจ้าของบัญชี เรียงตามชื่อ รองรับ query ว่าง/ไม่ส่ง query ทั้งสองโหมด กรองรายคนแล้วกดแสดงทุกคนได้โดยรักษาวันที่เลือก และคงรายการเดิมขณะแก้ draft จนกดค้นหา ปรับ src/ColleaguesPage.tsx, src/domain/colleagues.ts, src/styles.css, tests เพื่อนร่วมงานและเอกสาร; npm test ผ่าน 147 รายการ, npm run typecheck และ npm run build ผ่าน ตรวจ Edge headless 154 ทั้ง IndexedDB/REST API, 3 บทบาท, 2 ธีม และกว้าง 1440/390/320px ผ่าน 110 กรณี รวมรายชื่อครบ 10 คน ตัวกรอง/ปุ่มแสดงทุกคน date picker เมนูมือถือ และสถานะที่เพื่อนเพิ่งบันทึก ไม่พบ page error หรือหน้าล้นแนวนอน ตรวจภาพ screenshot แล้ว ใช้ฐาน/context ทดสอบแยกจากข้อมูลใช้งาน ไม่แก้ source/runtime ของผู้ใช้ ยังไม่ได้ทดสอบบนโทรศัพท์จริง
