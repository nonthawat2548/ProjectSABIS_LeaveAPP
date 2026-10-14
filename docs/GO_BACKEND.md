# Backend: Go + Gin

หลังบ้านใช้ Go + Gin ตามแนวที่เรียน หน้าเว็บใช้ React + JavaScript + Vite พร้อม React Router, Tailwind และ Jest + React Testing Library ตาม [FRONTEND.md](FRONTEND.md) หน้าตาเดิมและ API รับ/ส่ง JSON รูปแบบเดิม PostgreSQL บน Supabase ใช้ schema `leave_app` เดิม ไม่ต้องล้างข้อมูลหรือรัน setup ซ้ำ

## เปิดแอปเพื่อทดลอง

ติดตั้ง Node.js 22.12 ขึ้นไป และ Go 1.26 ขึ้นไป จากนั้นรันที่รากโปรเจกต์:

```bash
npm install
npm run dev:api
```

คำสั่งนี้ build Go server ก่อน แล้วเปิด Vite ที่ `http://localhost:5173` และ API ที่ `http://127.0.0.1:3001/api` หน้าเว็บเรียก `/api` ผ่าน Vite proxy ไม่ต้องตั้ง CORS สำหรับการเปิดแบบนี้ กด Ctrl+C เพื่อปิดทั้งสอง process

โหมดทดลองบันทึกใน `server/data/leave-management-go.json` แยกจาก IndexedDB และไฟล์ Node เดิม ไม่ย้ายข้อมูลให้อัตโนมัติ ไฟล์ไม่มีอยู่จะเริ่มจาก JSON 10 คนต้นทางเดียวกันใน `src/data/leave-management-10-people.json` การเริ่มใหม่ไม่เขียนทับไฟล์ runtime ที่มีอยู่ บัญชีทดลองและรหัส `1234` คงเดิม เซสชัน/ไฟล์ที่ยังอัปโหลดไม่เสร็จในโหมด JSON อยู่ใน memory และหมดเมื่อ restart

`npm run dev` ยังเปิดโหมด IndexedDB เดิม ส่วน `npm run dev:legacy` เปิด Node JSON server สำหรับเทียบระหว่างย้ายระบบ ไม่มีการ fallback อัตโนมัติเมื่อ Go มีปัญหา

## ต่อ PostgreSQL เดิม

ตั้ง `POSTGRES_URL`, `POSTGRES_SSL_CA` เมื่อฐานใช้ CA เฉพาะ และ `ENABLE_DEMO_LOGIN=true` ใน `.env` ฝั่ง server แล้วรัน:

```bash
npm run dev:cloud
```

หากเปิดเฉพาะ Go ด้วย `go run ./cmd/server` หรือ `npm run go:server` ให้ตั้ง `GO_DATA_MODE=postgres` ด้วย ค่าเริ่มต้นของ CLI คือ JSON เพื่อให้ทดลองได้โดยไม่ทำรายการกับฐานกลางโดยไม่ตั้งใจ

บน Vercel ใช้ `api/go.go` และ rewrite ใน `vercel.json` ซึ่งชี้ `/api/*` ไป Go function ใช้ PostgreSQL เท่านั้น ค่า environment เดิมยังใช้ได้ และตรวจ TLS certificate ตามเดิม `POSTGRES_LOCAL=true` ยอมปิด TLS ได้เฉพาะฐาน loopback ที่ไม่ได้รันบน Vercel เพื่อทดสอบในเครื่อง ห้ามใช้กับฐาน cloud

`api/go.go` เรียก public package `serverless/handler.go` ซึ่งเริ่ม cloud handler จาก `internal/app` อีกที ต้องไม่ import `leave-management/internal/...` โดยตรงจากไฟล์ API เพราะ [ตัว build ของ Vercel](https://github.com/vercel/vercel/blob/main/packages/go/src/index.js) เขียน module wrapper ตามชื่อ package ของ handler ทำให้ Go ปฏิเสธการนำเข้า internal จากขอบเขตนั้น กฎ สิทธิ์และ repository ยังคงอยู่ใน `internal/` เดิม

รอบนี้เตรียมโค้ดและ config สำหรับ deploy แต่ยังไม่ได้เผยแพร่ไป Vercel หรือทำรายการกับ Supabase ที่ใช้อยู่ หากต้องการกลับ Node ชั่วคราวต้องเปลี่ยน config อย่างชัดเจน ไม่มีการสลับ backend หรือรีเซ็ตข้อมูลเอง

## โครงสร้างที่ควรเริ่มอ่าน

| ไฟล์/โฟลเดอร์ | หน้าที่ | เทียบกับแนวที่เรียน |
| --- | --- | --- |
| `cmd/server/main.go` | เปิดเซิร์ฟเวอร์ รับ PORT และปิดเมื่อ Ctrl+C | จุดเริ่มโปรแกรม |
| `internal/app/app.go` | เลือก repository และประกอบ API | การตั้งค่าระบบ |
| `internal/httpapi/api.go` | เส้นทาง Gin, JSON, session, error และเรียก service | Handler / Controller |
| `internal/httpapi/documents.go` | อัปโหลดและดาวน์โหลดเป็นส่วนตามสิทธิ์ | Handler ไฟล์แนบ |
| `internal/model/model.go` | struct และชื่อ JSON fields | Model / DTO |
| `internal/service/requests.go` | ตรวจเงื่อนไขก่อนยื่นและแก้ไขคำขอ | Service / validation |
| `internal/service/commands.go` | ยื่น แก้ไข ยกเลิก พิจารณาและส่งความเห็น | Business logic |
| `internal/service/admin.go` | สิทธิ์ นโยบาย วันหยุดและกรณีลาคลอดของ HR | Service ฝั่ง HR |
| `internal/service/scope.go` | จำกัดข้อมูลตามสิทธิ์และคำนวณโควตา | Authorization / calculation |
| `internal/repository/` | Transaction และอ่าน/เขียน JSON หรือ PostgreSQL | Repository |
| `api/go.go` | ใช้ Handler เดียวกันบน Vercel | Deployment entrypoint |
| `serverless/handler.go` | เริ่ม cloud handler ครั้งเดียวผ่าน public package | จุดเชื่อม Vercel กับ internal application |
| `docs/openapi.yaml` | สัญญา API ที่ frontend ใช้ | OpenAPI |

ตัวอย่างเมื่อกด **ยื่นคำขอลา**:

1. React ใน `src/pages/LeaveForm.jsx` ส่งคำสั่งผ่าน `src/data/apiRepository.js`
2. Gin รับ `POST /api/commands` และตรวจ cookie/session
3. `service.Apply()` เลือกคำสั่ง `submit` แล้ว `CheckRequest()` ตรวจเจ้าของคำขอและนโยบาย
4. Repository บันทึกคำขอ วันลา เอกสาร การพิจารณาและการแจ้งเตือนใน transaction เดียว
5. API คืน `{id, message}` ให้ React โหลดข้อมูลใหม่

Service ไม่รับ role/actorId/gender จาก body มาเป็นสิทธิ์ ต้องอ่าน Employee ของเจ้าของคำขอจากข้อมูลล่าสุด วันที่ API/ฐานยังเป็น ISO ค.ศ. การแสดง พ.ศ. คงอยู่ใน `src/domain/date.js` ของ frontend โควตาลาคลอดยังเป็นรายกรณีและตรวจเพศก่อนกรณี/วันที่/โควตา ไม่มีการเปลี่ยนนโยบายตัวอย่าง

ทุกบทบาทยื่น/แก้ไข/ถอนคำขอของตนได้ขณะ Pending ผู้พิจารณาใน `Leave_Approval` แบบ Decision ต้องเป็นคนอื่น: Employee ส่งผู้จัดการ, Manager ส่ง HR active และ HR ส่งผู้จัดการที่กำหนด ใช้ `approval_routing.go` ตรวจทั้งตอนยื่นและตอนตัดสิน การปรึกษา HR สำหรับคำขอพนักงานยังเป็น Consultation และไม่ให้อำนาจอนุมัติ ผู้จัดการอ่านคำขอ HR ได้เฉพาะที่มอบหมาย Decision โดยไม่รวมในยอดทีม/รายงาน/ปฏิทินหรือเปิดโควตาของ HR ดู [FIXES_AUDIT.md](FIXES_AUDIT.md)

## ทดสอบ

คำสั่ง `sendLeaveReport` อยู่ใน `internal/service/leave_report.go` ตรวจ Manager จาก session, พนักงานตามทีมและ HR ที่ active ก่อนคำนวณจากวันที่/units ที่บันทึกไว้ แล้วบันทึก notification ให้ผู้รับกับผู้ส่งใน transaction เดิม ตรวจ parity ข้อความรายงานกับ `src/domain/leaveReport.js`; ไม่เพิ่ม endpoint/schema และไม่รับรายงานหรือยอดรวมจาก request body ค่า `employeeId=0/month=0/leaveTypeId=0` เป็นตัวกรองทั้งหมดตามสิทธิ์ รายงานและยอดทีมไม่รวม HR แม้ HR มี managerId ชี้มาที่ผู้จัดการ ข้อยกเว้นสำหรับพิจารณาคำขอ HR ที่มอบหมาย Decision ไม่ขยายสิทธิ์รายงานหรือโควตา สิทธิ์อ่านโปรไฟล์พื้นฐานยังคงเดิม

```bash
npm test
npm run typecheck
npm run build
npm run test:go
npm run test:go:vercel
npm run vet:go
npm run test:parity
npm run test:go:postgres
npm run build:go
```

Go tests ใช้ `testing` และ `httptest` ตามมาตรฐาน Go เทียบกับ JavaScript domain ผ่าน test-only stdin/stdout bridge โดยไม่ทำสำเนาข้อมูล seed อีกชุด PostgreSQL integration ใช้ PGlite ผ่าน PostgreSQL wire protocol ใน memory สร้าง schema ในฐานทดสอบใหม่ทุกครั้ง ไม่อ่าน `.env` และไม่แตะ Supabase จริง GitHub Actions รันตรวจทั้งสองฝั่ง

`test:go:postgres` ตรวจทั้ง HTTP flow และการจำลอง pooler ทิ้ง prepared statements ระหว่าง transaction: driver mode เดิมต้องเกิด SQLSTATE `26000` ส่วนโหมดแอปต้องอ่านได้ต่อเนื่อง รวมถึงพารามิเตอร์ที่มีเครื่องหมายคำพูด Go ใช้ simple protocol ผ่าน pgx เพื่อรักษาการแปลงค่า ISO date/JSON เดิมและไม่พึ่ง statement cache ของ connection ฝั่งฐาน ข้อผิดพลาดที่ไม่ใช่ domain error ส่งข้อความทั่วไปให้หน้าเว็บ และบันทึกเฉพาะชนิด error, SQLSTATE และ route ฝั่ง server

`test:go:vercel` จำลองการเขียน module wrapper และเปลี่ยนชื่อ Handler ของ `@vercel/go` ในโฟลเดอร์ชั่วคราว ตรวจว่า fixture ที่ import internal โดยตรงเกิด `use of internal package ... not allowed` ตาม log ก่อน แล้วตรวจว่า entrypoint ปัจจุบัน compile เป็น Linux/amd64 ได้ เพื่อให้แน่ใจว่าชุดทดสอบจับข้อผิดพลาดนี้ได้ การ build Go ปกติไม่พบปัญหานี้ ไม่คัดลอก `.env` หรือฐาน runtime และไม่เชื่อม Supabase การตรวจนี้ตรวจการ compile ของ wrapper ไม่ใช่การ deploy หรือทดสอบ Lambda บน Vercel จริง

ผลตรวจในเครื่อง 11/10/2569: ชุดทดสอบเดิม 174 รายการ, Go tests, vet, typecheck, build ทั้ง frontend/Go, format และ data:check ผ่าน ตรวจเทียบ Go/TypeScript ผ่าน 94 กรณี และ PostgreSQL integration ผ่าน OpenAPI ผ่านการตรวจ schema และ references ตรวจ Edge headless 122 สถานะ ครอบคลุมสามบทบาท สองธีม และจอ 390/1440px โดยข้อความ/โครงสร้างหน้าจอตรงกับเดิม ภาพ 114 ภาพตรงทุกพิกเซล อีก 8 ภาพต่างเฉพาะจุดเล็กน้อยไม่เกิน 0.028% ของพิกเซลและค่าสีต่างสูงสุด 4/255 ทดสอบยื่นลาพร้อม PDF บนมือถือ แก้ไข อนุมัติจากเซสชันผู้จัดการ ดาวน์โหลดเอกสารเดิม และตรวจสถานะผ่าน HR สำเร็จ ไม่พบ page error การตรวจทั้งหมดใช้ฐานทดสอบแยก ยังไม่ได้ตรวจ deployment Go บน Vercel

JavaScript domain ยังจำเป็นสำหรับ preview ในแบบฟอร์มและ IndexedDB ส่วน `server/*.js` เก็บไว้สำหรับเทียบกฎ/โหมด Node ระหว่างย้าย ไม่ใช่ backend ที่ Vercel ใช้แล้ว สัญญาข้อมูลอยู่ใน JSDoc ของ `src/domain/types.js` และคำอธิบายฟังก์ชันอยู่ข้าง implementation ไม่ใช่ runtime อีกชุด

## ขอบเขตที่ยังคงเดิม

ระบบยังเป็นบัญชีจำลองตามคำขอเดิม กระดิ่งยังดึงข้อมูลทุก 15 วินาที การเปลี่ยน frontend เป็น JavaScript/React Router/Tailwind และเพิ่ม Jest ไม่เปลี่ยนสิทธิ์ นโยบาย โควตา หรือฐานข้อมูล ดูรายละเอียด frontend ใน [FRONTEND.md](FRONTEND.md)

แหล่งอ้างอิง: [Gin documentation](https://gin-gonic.com/en/docs/), [Vercel Go runtime](https://vercel.com/docs/functions/runtimes/go)
