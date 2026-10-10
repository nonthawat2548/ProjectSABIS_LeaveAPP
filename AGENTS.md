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
- Frontend: React + TypeScript + Vite; icons: Lucide React
- ฟอนต์ IBM Plex Sans Thai อยู่ใน `public/fonts/` พร้อมใบอนุญาต `OFL.txt` ให้รักษาไฟล์ฟอนต์และใบอนุญาต
- UI โทนเขียวเข้ม–มิ้นต์ มีธีมสว่าง/มืด ค้นหาด่วน และ responsive layout
- สีและรูปแบบหลักอยู่ใน tokens ของ `src/styles.css` ตรวจความชัดของข้อความ ไอคอน ข้อความรอง hover, focus และ badge ในทั้งสองธีมเมื่อแก้ UI และคงชื่อสถานะไว้ ไม่ใช้สีสื่อสถานะเพียงอย่างเดียว
- ใช้ `LeaveRepository` ใน `src/domain/types.ts` เป็น interface เพื่อเปลี่ยนแหล่งข้อมูลได้ภายหลัง

## โครงสร้างโค้ด

| ตำแหน่ง | หน้าที่ |
| --- | --- |
| `src/App.tsx` | Login, layout, เมนูตามบทบาท, hash routing, ธีม และโหลด/รีเฟรชข้อมูล |
| `src/Dashboard.tsx` | Dashboard และข้อมูลภาพรวมตามบทบาท |
| `src/ui.tsx` | องค์ประกอบ Dashboard, ค้นหาด่วน และขั้นตอนแบบฟอร์ม |
| `src/pages.tsx` | แบบฟอร์ม คำขอ ปฏิทิน สถานะทำงาน การแจ้งเตือน และหน้าจอ HR |
| `src/components.tsx` | ตาราง date picker, dialog และเอกสาร |
| `src/styles.css` | สี รูปแบบ ธีม และ responsive layout |
| `src/domain/types.ts` | โครงสร้างข้อมูล คำสั่ง และ repository interface |
| `src/domain/date.ts` | แปลงวันที่ ตรวจวันที่ และคำนวณวันตามเขตเวลาไทย |
| `src/domain/service.ts` | กฎการลา ตรวจสิทธิ์ กรองข้อมูล คำนวณโควตา และประมวลผลคำสั่ง |
| `src/domain/seed.ts` | บัญชี ข้อมูลจำลอง และนโยบายตัวอย่าง |
| `src/data/index.ts` | เลือก repository ตามโหมดข้อมูล |
| `src/data/demoDatabase.ts` | `createDemoDatabase()` clone ชุด JSON 10 คนสำหรับเริ่มต้นและคืนค่า; `getDemoAccounts()` ให้รายการบัญชีทดลองบนหน้า Login จาก source เดียวกัน |
| `src/data/leave-management-10-people.json` | ชุดข้อมูลต้นทาง 10 คนที่แอปใช้ในทั้งสองโหมด |
| `src/data/browserRepository.ts` | IndexedDB และ session จำลองในเบราว์เซอร์ |
| `src/data/apiRepository.ts` | REST API adapter |
| `server/index.ts` | Mock REST API และ cookie session |
| `server/store.ts` | อ่าน/เขียน JSON แบบ serialized และ atomic rename |
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

- โหมดเบราว์เซอร์ใช้ IndexedDB (`mock`) ชื่อ `leave-management-10-people-v1`; โหมด `api` ใช้ Node.js REST API บันทึกลง `server/data/leave-management-10-people.json` เป็นค่าเริ่มต้น หรือไฟล์จาก `MOCK_DATA_FILE`
- ทั้งสองโหมดเริ่มต้นและคืนค่าผ่าน `createDemoDatabase()` ใน `src/data/demoDatabase.ts` ซึ่ง clone `src/data/leave-management-10-people.json` ชุด 10 คน: Employee 7, Manager 2 และ HR 1
- เก็บฐานเดิม IndexedDB `leave-management-v1` และ `server/data/db.json` ไว้ ไม่ย้ายหรือเขียนทับอัตโนมัติ โหมดเบราว์เซอร์ใช้ session key `leave-10-people-demo-session` และ BroadcastChannel `leave-10-people-data` แยกจากเดิม
- เลือก API ด้วย `VITE_DATA_MODE=api` และตั้ง URL ผ่าน `VITE_API_BASE_URL` ตาม `docs/API.md`
- ข้อมูลสองโหมดเป็นคนละชุด ไม่มีการย้ายหรือซิงก์ข้อมูลระหว่างโหมดอัตโนมัติ
- `src/data/leave-management-10-people.sqlite`/`.sql` เป็นไฟล์ส่งออกของชุด 10 คน; `database/mock.sqlite`, `database/schema.sql` และ `database/seed.sql` เป็นตัวอย่างเดิม Mock server ปัจจุบันใช้ JSON **ยังไม่ได้เชื่อม SQLite อัตโนมัติ** และการทำรายการไม่ซิงก์กลับ source JSON หรือไฟล์ส่งออก
- Mock JSON server serialize คำสั่งและเขียนไฟล์แบบ atomic เหมาะสำหรับ process เดียว หลังบ้านหลาย instance ต้องใช้ database transaction และ concurrency control จริง
- บัญชีและการยืนยันตัวตนเป็น demo; session ของ mock server อยู่ใน memory อายุ 8 ชั่วโมงและหายเมื่อ restart ก่อนใช้ข้อมูลจริงต้องเปลี่ยนระบบ login/session และตรวจสิทธิ์ที่ server
- ห้ามใส่ secret หรือรหัสฐานข้อมูลใน frontend/ตัวแปร `VITE_*` เพราะค่าเหล่านี้อยู่ในไฟล์เว็บ
- เอกสารจำลองเก็บ base64/data URL รองรับ PDF/JPG/PNG ไม่เกิน 2 MiB หลังบ้านจริงควรใช้ upload/object storage โดยปรับ adapter และ contract ให้สอดคล้องกัน
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

## คำสั่งใช้งาน

ต้องใช้ Node.js >= 22.12.0 ตาม `package.json`:

```bash
npm install
npm run dev          # frontend; ค่าเริ่มต้นใช้ IndexedDB
npm run dev:api      # frontend พร้อม mock REST server
npm run mock:server  # เปิด mock server แยกต่างหาก
npm test
npm run typecheck
npm run build
npm run preview
```

`npm run dev` ไม่เปิด mock server เอง หากเปิดสอง terminal ให้ตั้ง `VITE_DATA_MODE=api` แล้วใช้ `npm run mock:server` ร่วมกับ `npm run dev` ดู proxy/port ใน `vite.config.ts` และ README

## การตรวจสอบและรายงานผล

- เลือกตรวจให้ตรงกับสิ่งที่เปลี่ยน หากแก้วันที่ กฎการลา โควตา หรือสิทธิ์ ให้ตรวจกรณีที่เกี่ยวข้องใน `tests/date.test.ts`, `tests/workflow.test.ts` และ `tests/api.test.ts`
- หากแก้หน้าจอ ให้ตรวจการ render ใน `tests/screens.test.ts` และตรวจหน้าตา/การคลิกด้วยเบราว์เซอร์จริงเมื่อทำได้ โดยครอบคลุมบทบาท ธีม และขนาดหน้าจอที่ได้รับผลกระทบ
- การ render ด้วย `react-dom/server` ไม่ยืนยัน layout หรือการคลิกในเบราว์เซอร์จริง อย่ารายงานว่า browser/E2E ผ่านหากไม่ได้ตรวจ
- ตรวจ TypeScript และ production build ตามขอบเขตงาน `npm run build` รัน `tsc --noEmit` ก่อน Vite build อยู่แล้ว
- เมื่อเพิ่มหรือแก้พฤติกรรม ให้มีการทดสอบกรณีสำคัญและข้อผิดพลาดที่เกี่ยวข้อง ใช้ฐานข้อมูลทดสอบแยกจากข้อมูลที่ใช้งาน
- รายงานว่า **เปลี่ยนอะไร เพราะอะไร ทดสอบอย่างไร ผลเป็นอย่างไร และมีข้อจำกัดใดที่ยังไม่ได้ตรวจ**
- สถานะที่ยืนยันเมื่อบันทึกไฟล์นี้ (10/10/2569): `npm test` ผ่าน 17 รายการ และ `npm run build` ผ่านรวม TypeScript แล้ว ยังไม่ได้ตรวจหน้าตาและการคลิกด้วยเบราว์เซอร์จริงในรอบนี้ จำนวน tests นี้เป็นสถานะอ้างอิง ไม่ใช่ข้อกำหนดให้คงจำนวนไว้
- สถานะล่าสุดหลังเชื่อมชุดข้อมูล 10 คน (10/10/2569): `npm test` ผ่าน 25 รายการ รวม repository ผ่าน fake IndexedDB, HTTP API และการ render หน้าจอจากชุดใหม่; `npm run build` ผ่านรวม TypeScript และตรวจ CLI seed บนไฟล์ชั่วคราวแล้ว การคลิกด้วยเบราว์เซอร์จริงยังไม่ได้ตรวจเพราะเซสชันนี้ไม่มี browser ให้ควบคุม
- สถานะล่าสุดหลังเพิ่มตัวเลือก Login ครบ 10 คน (10/10/2569): `npm test` ผ่าน 31 รายการ รวมทดสอบ React DOM ผ่าน jsdom ว่าเลือกแต่ละบัญชีแล้วเข้าสู่ repository ได้ถูกคน ตรวจปุ่มบทบาท การพิมพ์อีเมลเอง การแก้ login error และการปิดช่องกรอกระหว่างเข้าสู่ระบบ; `npm run build` ผ่านรวม TypeScript การทดสอบ jsdom ไม่ยืนยัน layout ในเบราว์เซอร์จริง ซึ่งยังไม่ได้ตรวจเพราะเซสชันนี้ไม่มี browser ให้ควบคุม
