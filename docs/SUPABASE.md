# ใช้ฐานกลาง Supabase สำหรับ Vercel

มี PostgreSQL API ด้วย Go + Gin ใน `api/go.go` แล้ว ใช้ React + Vite และ ApiRepository เดิม หลังตั้ง environment/migration และ deploy โค้ดใหม่ทุกเครื่องใช้ฐานกลาง โค้ด Node เดิมเก็บไว้เทียบในช่วงย้าย ดู [GO_BACKEND.md](GO_BACKEND.md) การเปลี่ยนภาษา backend ไม่ต้องรัน setup ซ้ำ ไม่ย้ายข้อมูลจากอุปกรณ์/JSON ขึ้น Supabase อัตโนมัติ

## นำเข้าฐานใหม่

1. ใน Vercel Storage ตรวจฐาน `leave-management` ว่า Available และ Connected Projects เป็น `leave-app`
2. กด Open in Supabase → SQL Editor → New query
3. ฐานใหม่เท่านั้น: เปิด `database/supabase/setup-10-people.sql` ใน VS Code คัดลอก **ทั้งไฟล์** ไปวาง แล้วกด Run ด้วยบัญชีผู้ดูแลฐาน หากนำเข้าแล้วข้ามขั้นตอนนี้
4. ผลท้ายไฟล์ควรเป็น Employee 7, Manager 2 และ HR 1 รวม 10 คน
5. ใน Table Editor เปลี่ยน schema จาก `public` เป็น `leave_app` เพื่อดูตาราง

หลังนำเข้าชุด 10 คนแล้ว ให้รัน `database/supabase/002-cloud-api.sql` ใน New query ผลเป็น `cloud-api-ready` เพิ่ม App_Session/App_Upload/App_Upload_Part สำหรับ session และ staging โดยไม่ล้างข้อมูลเดิม รันซ้ำได้ ตารางรองรับเหล่านี้ไม่นับใน 9 ตารางธุรกิจหลัก

ไฟล์นี้ใช้ PostgreSQL 15 ขึ้นไป ไม่ใช้ไฟล์ SQLite ใน `src/data/` มารันกับ Supabase โดยตรง และไม่ต้องทำ Quickstart ตัวอย่าง Next.js/ตาราง notes เพราะโปรเจกต์เดิมเป็น React + Vite

สร้าง 9 ตารางหลักตาม `docs/DATABASE.md` พร้อม App_Notification/App_Holiday และ views สำหรับค่าคำนวณ ใช้วันที่ ISO ค.ศ., timestamp `TIMESTAMPTZ` และ timeline `JSONB` ชื่อ SQL ที่ไม่ใส่เครื่องหมายคำพูดจะเป็นตัวพิมพ์เล็ก เช่น `leave_app.employee`; mapping คอลัมน์เดิมยังใช้ได้ PK รับ id ชัดเจนตามข้อมูลเดิม ไม่เพิ่มลำดับเลขอัตโนมัติที่อาจชนกับ seed

ดำเนินการใน transaction เดียวและสร้างเฉพาะ schema ใหม่ `leave_app` หากมี schema นี้แล้วจะหยุดโดยไม่ล้าง/แทนข้อมูล ห้ามเติม DROP/TRUNCATE เพื่อรันซ้ำ ส่งข้อความผิดพลาดมาตรวจแทน ไม่ย้ายข้อมูลจาก IndexedDB ของโทรศัพท์/คอม หรือไฟล์ runtime หลังบ้านเดิม

## สิทธิ์และ session

ตารางอยู่ใน schema `leave_app` เปิด RLS และถอนสิทธิ์ schema/tables/views ของ PUBLIC/anon/authenticated ไม่มี policy ให้เบราว์เซอร์เข้าถึงโดยตรง API ฝั่ง server ตรวจ session, role, manager assignment และใช้กฎ `src/domain/service.js` ภายใน transaction ทุก mutation ใช้ advisory transaction lock ร่วมทุก instance และ SELECT FOR UPDATE ก่อนตรวจสิทธิ์/โควตา/version เขียนเฉพาะแถวที่เปลี่ยนด้วย connection เดียวตั้งแต่ BEGIN ถึง COMMIT; error rollback ทุกส่วน อ่าน snapshot ด้วย repeatable read ข้อมูลลาคลอด/วันที่/HR consultation ใช้ domain เดิม

API ใช้ HttpOnly, SameSite=Lax cookie (Secure เมื่อ HTTPS) token สุ่ม 256 บิต เก็บเฉพาะ SHA-256 ใน App_Session อายุ 8 ชั่วโมง คงอยู่ข้าม cold start ตรวจ session/บัญชี active ใหม่ทุก endpoint และ write transaction ปฏิเสธ mutation ข้าม origin logout ล้างเฉพาะ session ของเครื่องนั้น ไม่เชื่อ actorId/role/gender จาก body

บัญชี Employee ใน seed ยังเป็นข้อมูลทดลอง รหัส `1234` เปิดใช้ผ่าน `ENABLE_DEMO_LOGIN=true` เท่านั้น Login รับชื่อผู้ใช้เฉพาะบุคคล เช่น `pimchanok.w`/`thanawat.k` จาก mapping ใน `src/domain/auth.js` หรืออีเมลเต็ม ไม่ต้องสร้างคอลัมน์เพิ่มหรือ reset ฐาน การเปลี่ยนชื่อผู้ใช้/รหัสทดลองมีผลเมื่อ deploy โค้ดใหม่ **ยังไม่ใช่ระบบยืนยันตัวตนสำหรับข้อมูลพนักงานจริง** ก่อนใช้จริงต้องเปลี่ยน login/session และการจัดการบัญชีเป็นระบบองค์กรหรือ Supabase Auth integration นี้ไม่ได้สร้าง Supabase Auth users และไม่บันทึกรหัส demo ลงฐาน

## เปิดใช้งานบน Vercel

ที่ leave-app → Settings → Environment Variables สำหรับ **Production**:

| ชื่อ | ค่า | หน้าที่ |
| --- | --- | --- |
| POSTGRES_URL | integration เพิ่มไว้แล้ว | PostgreSQL URL แบบ pooled ใช้ฝั่ง server |
| ENABLE_DEMO_LOGIN | `true` | เปิดบัญชีสมมติ 10 คน |
| VITE_DATA_MODE | `api` | ใช้ข้อมูลกลาง |
| VITE_API_BASE_URL | `/api` | API ใน deployment เดียวกัน |

อัปเดตโค้ดใน repository/ช่องทาง deploy เดิมแล้วสร้าง deployment ใหม่หลังตั้งค่า ต้องมี API ใน deployment ใหม่ด้วย การ Redeploy โค้ดเก่าที่ไม่มี API ไม่ทำให้เชื่อมฐานได้ `vercel.json` ส่ง /api/* ไป function เดียว region sin1 ตรวจ `/api/health` ควรคืน status ok, mode cloud-postgres, documentTransport parts-v1; 503 ให้ตรวจ migration/การเชื่อมต่อใน server logs โดยไม่เผยแพร่ secret

Vercel build เลือก `api` โดยอัตโนมัติเมื่อไม่ได้ระบุโหมด สามารถตั้ง `mock` อย่างชัดเจนเพื่อเว็บทดลองแยกข้อมูลในเบราว์เซอร์ API ไม่ fallback ลง IndexedDB เมื่อระบบขัดข้อง จึงไม่บันทึกผิดที่ โทรศัพท์/คอมต้องเปิด deployment ใหม่และเข้าสู่ระบบอีกครั้ง รีเฟรช/รออัปเดตทุก 15 วินาทีเพื่อดูข้อมูลใหม่

ใช้ Supabase transaction pooler (รองรับ IPv4/เหมาะกับ serverless) สำหรับ POSTGRES_URL ไม่มี prepared statement แบบตั้งชื่อ มี DATABASE_URL เป็นชื่อสำรอง SDK ตรวจ TLS certificate ไม่ปิด verification หากฐานใช้ CA เฉพาะให้ตั้ง POSTGRES_SSL_CA เป็น PEM ที่เชื่อถือได้จาก Supabase ไม่ต้องใช้ service-role key หรือ Auth key สำหรับ adapter นี้

ไม่ใส่ POSTGRES_PASSWORD, POSTGRES_URL, service-role/secret key ใน `VITE_*` หรือ source code ตัวแปรจาก Vercel integration ใช้ฝั่ง server; prefix สาธารณะ `VITE_` ใช้ได้เฉพาะ URL/publishable key ที่ออกแบบไว้ให้เปิดเผย ชื่อจริงของตัวแปรอาจขึ้นกับ integration ให้ตรวจชื่อโดยไม่เผยแพร่ค่า

## เอกสาร 25 MB

เพดานนี้ใช้กับไฟล์ที่แนบใหม่เท่านั้น เอกสารเดิมถึง 100 MiB ยังดาวน์โหลดได้ตามสิทธิ์ การแก้ไขที่เก็บเอกสารเดิมและการอนุมัติยังทำได้ ไม่ลบหรือย่อไฟล์เก่า ไม่ต้องรัน SQL เพิ่ม เพียง deploy โค้ดใหม่ให้เพดานหน้าเว็บและ API ตรงกัน

ผลตรวจเพดานใหม่ 11/10/2569: npm test ผ่าน 165 รายการ typecheck/build ผ่าน (VERCEL=1) รวมไฟล์ 25 MiB พอดี/เกิน 1 ไบต์ การส่ง API โดยตรง และ legacy download/edit/approve เกิน 25 MiB ตรวจ Edge headless สองธีม 320/390/1440px ผ่าน 14 กรณี ส่งไฟล์จริง 25 MiB 17 parts เห็นจากอีกเซสชัน ผู้จัดการอนุมัติ และดาวน์โหลดขนาด/SHA-256 ตรงต้นฉบับ ตรวจภาพแล้ว ไม่พบ page error/overflow ใช้ฐานทดสอบแยก ไม่แก้ฐาน Supabase ของผู้ใช้และยังไม่ได้ deploy เพดานใหม่

รักษาข้อกำหนด **25 MiB** ไว้ โดยแบ่ง base64 เป็นส่วนละ 2 MiB ตัวอักษร (17 ส่วนสำหรับไฟล์ 25 MiB) ทุก request/response ต่ำกว่าเพดาน Vercel 4.5 MB โหมด cloud นี้ **ไม่ใช้ Supabase Storage** จึงไม่ติดเพดาน 50 MB ต่อ object ของ Storage Free

ApiRepository ขอ upload ID ส่ง parts แล้วส่งคำสั่งอ้างอิง upload ID; server ตรวจ owner/session/อายุไฟล์/จำนวนส่วน/ขนาดจริง/ชนิดและ signature ใช้ metadata จาก staging ที่ server ตรวจ ไม่เชื่อ metadata ใน command ลำดับเพศ/กรณีลาคลอดตรวจใน domain ก่อนข้อความไฟล์ผิดเงื่อนไข บันทึกคำขอ/เอกสารและ consume staging ใน transaction เดียว Error รักษาคำขอเดิมและ rollback ทั้งชุด upload หมดอายุ 1 ชั่วโมง ล้างเมื่อเริ่ม upload ใหม่ จำกัด staging 3 ไฟล์ต่อคน client ล้างหลัง error แบบ best effort

เนื้อไฟล์ยังเก็บ base64 ใน Leave_Document.Data_url สำหรับชุดทดลอง ใช้โควตาฐาน Free **500 MB ร่วมกับข้อมูลธุรกิจ** Base64 เพิ่มพื้นที่ประมาณหนึ่งในสาม staging ใช้พื้นที่ชั่วคราวก่อน commit เหมาะกับชุดทดลอง สำหรับข้อมูลจริง/เอกสารจำนวนมากควรใช้ private object storage ที่รองรับ 25 MiB แล้วปรับ contract/adapter/สิทธิ์ร่วมกัน

Cloud snapshot คืน metadata เอกสาร `remote:true,dataUrl:''` (remote ไม่ใช่คอลัมน์ SQL) ไม่โหลดไฟล์ใหญ่ตอน Login/รีเฟรช ดาวน์โหลดเมื่อกดปุ่มเท่านั้นผ่าน endpoints ที่ตรวจ canView ใหม่ทุกส่วน รวมเป็น Blob และตรวจขนาดในเบราว์เซอร์ มีสถานะกำลังดาวน์โหลด/ลองใหม่ และป้องกันกดซ้ำ การส่งออก JSON ในหน้า HR จาก cloud จึงส่ง metadata เอกสารไม่รวมเนื้อไฟล์ ขนาด 25 MB ยังขึ้นกับพื้นที่ฐาน/ความเร็วเครือข่าย/หน่วยความจำของอุปกรณ์

## สร้างไฟล์ใหม่และตรวจสอบ

```bash
node scripts/generate-supabase.mjs
npm run dev:cloud
```

อ่าน schema อ้างอิงและ source JSON ปัจจุบันเพื่อสร้าง SQL เท่านั้น ไม่เชื่อม network หรือแตะ runtime database หลังแก้ source ให้สร้างไฟล์นี้ใหม่ แต่การสร้างไฟล์ไม่อัปเดตข้อมูลบน Supabase ที่นำเข้าแล้ว

`dev:cloud` เปิด frontend และ Go PostgreSQL API โดยอ่าน POSTGRES_URL/ENABLE_DEMO_LOGIN จาก `.env` ที่ git ignore; เปิด Go API แยกด้วย `npm run go:server` และตั้ง `GO_DATA_MODE=postgres` ใน `.env` Vite proxy รักษา Host เดิมเพื่อให้ตรวจ same-origin ใน localhost ส่วน production ใช้ `net/http` ของ Go function บน Vercel `cloud:server` เป็น Node เดิมสำหรับอ้างอิง CLI seed เดิมยังคืนค่าเฉพาะ Node mock JSON; ปุ่มคืนค่าของ HR ใน cloud ล้างข้อมูลธุรกิจฐานกลางเป็น source 10 คน **มีผลทุกเครื่อง** ต้องใช้ตามขอบเขตที่ผู้ใช้สั่งเท่านั้น

ผลตรวจวันที่ 10/10/2569: `npm test` ผ่าน 153 รายการ, `npm run typecheck` และ `npm run build` ผ่าน เพิ่ม `tests/supabase-schema.test.ts` 6 รายการ ใช้ PGlite (PostgreSQL แบบฝังตัว เป็น dev dependency สำหรับ tests เท่านั้น) ตรวจ SQL ทั้งไฟล์จริง ตาราง/seed/วันที่/timeline/เอกสาร/นโยบาย ยอดสิทธิ์เทียบ domain การปิดสิทธิ์ tables/views รวมกรณีให้ SELECT โดยพลาด การรันซ้ำไม่ทับข้อมูล และอักขระ quote/backslash ใช้ฐานในหน่วยความจำแยก ไม่ได้รัน SQL บน Supabase ของผู้ใช้หรือยืนยันการซิงก์ข้ามอุปกรณ์

ผลตรวจ API วันที่ 11/10/2569: `npm test` ผ่าน 161 รายการ, `npm run typecheck` และ `npm run build` ผ่าน (build ตั้ง VERCEL=1 เพื่อตรวจค่าเริ่มต้น API) เพิ่ม cloud API/adapter/UI tests บน PGlite แยก ตรวจ session ข้าม handler, role projection, actor/gender spoofing, ลำดับลาคลอด/ข้อมูลสิทธิ์ล่าสุด, concurrent quota/approval, rollback, staging/document ownership, body bounds และ multipart codec ตรวจ Edge headless 154 บน bundle เดียวกันกับ HTTP backend ทดสอบ ผ่าน 11 กรณี: ส่งคำขอพร้อมไฟล์ 100 MiB จาก viewport โทรศัพท์ เห็นจากอีกเซสชัน ผู้จัดการอนุมัติ ดาวน์โหลดกลับ 67 parts ขนาดและ SHA-256 ตรงต้นฉบับ และรายชื่อเพื่อนครบ 10 คน ตรวจ 320/390/1440px สองธีม ไม่พบ page error หรือ horizontal overflow และตรวจ screenshot แล้ว การตรวจนี้ยังไม่ยืนยัน credentials/TLS/routing/deployment บน Supabase/Vercel จริง และไม่ใช่โทรศัพท์จริง

แหล่งอ้างอิง: [Supabase/Vercel integration](https://supabase.com/docs/guides/integrations/vercel-marketplace), [grants และ RLS](https://supabase.com/docs/guides/api/securing-your-api), [Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits), [Vercel Functions limits](https://vercel.com/docs/functions/limitations)

## เมื่อ API ตอบ FUNCTION_INVOCATION_FAILED

หาก /api/health และ /api/session ตอบ HTTP 500 เป็น text/plain พร้อม FUNCTION_INVOCATION_FAILED ให้ดู Runtime Logs ของ deployment เพื่อยืนยันสาเหตุ API อาจเปิดโมดูลไม่สำเร็จก่อนเข้า error handler ไม่ใช่หลักฐานว่ารหัสบัญชีหรือข้อมูลในฐานผิด หาก logs ระบุ ERR_MODULE_NOT_FOUND หรือ ERR_IMPORT_ATTRIBUTE_MISSING ให้ใช้โค้ดล่าสุดที่มีนามสกุล .js ใน relative runtime imports และ `with { type: 'json' }` ใน JSON import การทดสอบด้วย tsx หรือ Vite อย่างเดียวไม่ยืนยันการเปิด API แบบ native Node

ตรวจวันที่ 11/10/2569: เว็บ leave-app-coral.vercel.app ตอบ 500 FUNCTION_INVOCATION_FAILED ทั้ง /api/health, /api/router?endpoint=health และ /api/session ส่วนหน้าเว็บตอบ 200 พบ import ในโค้ดเดิมไม่ครบตาม native ESM ปรับเส้นทาง runtime และ JSON import แล้ว พร้อม API adapter แสดงข้อความไทยเมื่อ platform ตอบข้อมูลที่ไม่ใช่ JSON เพิ่ม tests/cloud-boot.test.ts สองรายการ ทดสอบ compile API แล้วเปิด JavaScript ด้วย Node โดยไม่ใช้ tsx/bundler และการรับ platform error; npm test ผ่าน 163 รายการ, typecheck/build ผ่าน (VERCEL=1) ชุดแก้ยังไม่ได้ deploy และไม่มี Runtime Logs จึงยังไม่ยืนยันสาเหตุเฉพาะของ deployment หรือผลเชื่อมฐานจริง
