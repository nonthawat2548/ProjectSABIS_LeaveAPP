# REST API contract

Implementation ปัจจุบัน: `internal/httpapi/` (Go + Gin) · frontend adapter: `src/data/apiRepository.js` · สัญญา [OpenAPI](openapi.yaml) · วิธีรันและลำดับอ่านโค้ด [GO_BACKEND.md](GO_BACKEND.md)

บน Vercel ใช้ api/go.go → serverless/handler.go → internal/httpapi/ → internal/service/ และ internal/repository/postgres.go เชื่อม PostgreSQL private schema leave_app ใช้ business commands และ cookie contract เดิม ไม่ใช้ไฟล์ JSON/session ใน memory ดู [SUPABASE.md](SUPABASE.md) ไม่มี fallback ไป IndexedDB ส่วน Node ใน server/*.js เป็น reference/โหมด legacy สำหรับเทียบระหว่างย้ายระบบ

## Cloud transport เพิ่มเติม

ไฟล์ที่ส่งใหม่หรือแนบใหม่ขณะแก้ไขจำกัด 25 MiB (หน้าจอใช้ 25 MB) ใช้ 17 ส่วนที่ขนาดสูงสุด ส่วนดาวน์โหลดเอกสารเดิมยังรองรับถึง 100 MiB ตามนโยบายก่อนหน้า ไม่ลบหรือย่อไฟล์เก่า ตาราง staging จาก 002-cloud-api.sql คงขอบเขตเดิมสำหรับความเข้ากันได้ API ตรวจเพดานใหม่ก่อนสร้าง staging และ domain ตรวจขนาดจริงซ้ำเมื่อ submit/edit จึงไม่ต้องรัน SQL migration เพิ่ม

| Method | Path | ข้อมูล |
| --- | --- | --- |
| GET | `/api/health` | cloud: status ok, mode cloud-postgres, documentTransport parts-v1, partCharacters 2097152; 503 เมื่อฐาน/migration ไม่พร้อม |
| POST | `/api/uploads` | `{fileName,fileType,fileSize,encodedLength}` → `{uploadId,partCharacters}`; Employee/session |
| PUT | `/api/uploads/:uploadId/parts/:part` | `{data}` base64; owner/session, idempotent replacement ของส่วนเดิม |
| DELETE | `/api/uploads/:uploadId` | ยกเลิก staging ของตนเอง |
| GET | `/api/documents/:id` | metadata + totalCharacters/partCharacters; ตรวจ canView |
| GET | `/api/documents/:id/parts/:part` | `{part,data}` ส่วน data URL ที่บันทึก; ตรวจ canView ใหม่ทุกครั้ง |

ทุก private response ใช้ no-store; cookie HttpOnly/SameSite=Lax/Secure เมื่อ HTTPS เซสชันเก็บ token hash อายุ 8 ชั่วโมงในฐานร่วมกัน บัญชี demo เปิดได้เฉพาะ ENABLE_DEMO_LOGIN=true และไม่ใช่ Supabase Auth

Cloud จำกัด body command/part 3 MiB, login/metadata 64 KiB; base64 ไม่เกิน 2 MiB ตัวอักษรต่อส่วน ต่ำกว่า Vercel 4.5 MB รองรับไฟล์เดิม 25 MiB ApiRepository ตรวจ health เพื่อเลือก transport; mock JSON ที่ไม่มี parts-v1 ส่ง dataUrl เดิม Cloud submit/edit อ้างอิง `{attachment:{uploadId}}` หลังตรวจส่วนครบ/owner server ขยายเป็น AttachmentInput แล้วใช้ validator/domain เดิม ตรวจเพศ/กรณีก่อนข้อผิดพลาดไฟล์ บันทึกคำขอ/เอกสารและ consume staging ใน transaction เดียว ไม่อนุญาตใช้ upload ของคนอื่น

Cloud snapshot คืน documents ตามสิทธิ์ด้วย remote:true/dataUrl:'' ไม่ส่งเอกสารใหญ่ตอน Login/ทุก 15 วินาที downloadDocument ของ adapter โหลด parts เมื่อกดดาวน์โหลดและตรวจขนาด Blob เทียบ fileSize ไฟล์เก็บ base64 ใน PostgreSQL ใช้พื้นที่ฐานร่วมกัน; ไม่ใช่ object storage การส่งออก JSON จาก HR ใน cloud จึงไม่รวมเนื้อไฟล์ remote

API คืน JSON ทุก response วันที่ของข้อมูลเป็น ISO **ค.ศ. `YYYY-MM-DD`** และ timestamp เป็น UTC ISO 8601 ช่องกรอก/ข้อความบนหน้าจอเป็น **พ.ศ. `d/m/yyyy`** โดยแปลงใน `src/domain/date.js`

## Endpoints

| Method | Path | Input | Output |
| --- | --- | --- | --- |
| GET | `/api/health` | — | `{status:"ok", mode:"go-json", backend:"go-gin", documentTransport:"parts-v1", partCharacters:2097152}` |
| POST | `/api/session` | `{email, password}` | `{employee}` และ HttpOnly cookie |
| GET | `/api/session` | session cookie | `{employee}` หรือ 401 |
| DELETE | `/api/session` | — | `{message}` ล้าง session |
| GET | `/api/snapshot` | session cookie | `Database` ที่กรองตามบทบาท |
| GET | `/api/employee-profile` | session cookie, `employeeId` จำนวนเต็มบวก | `{employee, manager}` ประวัติพนักงานข้ามฝ่าย |
| GET | `/api/colleagues` | session cookie, `query`, `date` (ISO ค.ศ.) | `ColleagueStatus[]` ข้อมูลสถานะเพื่อนร่วมงาน |
| POST | `/api/commands` | `Command` | `{message, id?}` |
| POST | `/api/demo/reset` | `{}` + HR session | `{message}` |

API จะเลือกผู้กระทำจาก session **ไม่รับ actorId/role จาก body** พนักงานเห็นข้อมูลคำขอตัวเอง ผู้จัดการเห็นทีมที่เป็นผู้จัดการโดยตรง HR มองเห็นข้อมูลการลาเพื่อดูแลสิทธิ์ แต่ส่งความเห็นได้เฉพาะคำขอที่ได้รับมอบหมาย

Login ของชุดทดลองรับชื่อผู้ใช้หรืออีเมลผ่าน field `email` เดิม เช่น `{ "email": "pimchanok", "password": "1234" }` หรืออีเมลเต็ม ชื่อผู้ใช้ของทั้ง 10 คนเป็นชื่อเฉพาะบุคคลจาก mapping อีเมลเดิมใน `src/domain/auth.js` ไม่ใช้ role/position และไม่เพิ่มคอลัมน์หรือตาราง บัญชีนอกชุดทดลองที่ไม่อยู่ใน mapping ใช้ส่วนก่อน @ ของอีเมลเป็น alias ไม่แยกตัวพิมพ์เล็ก/ใหญ่และตัดช่องว่างหัวท้าย หากชื่อซ้ำกันต้องใช้อีเมลเต็ม; บัญชี inactive เข้าสู่ระบบไม่ได้ ใช้กฎร่วมทั้ง IndexedDB, mock JSON และ PostgreSQL ชื่อเดิม `employee`/`manager`/`hr`/`sales-manager`/`other` และรหัสเดิม `demo1234` ใช้ไม่ได้หลังเผยแพร่โค้ดใหม่ อีเมลเต็มยังใช้ได้ ไม่ต้องคืนค่าข้อมูลหรือรัน SQL migration

## ประวัติพนักงาน

`GET /api/employee-profile?employeeId=6` ตรวจ session และบัญชี active ทุกครั้ง Employee อ่านประวัติได้เฉพาะตนเอง Manager/HR อ่านประวัติพนักงาน active ได้ข้ามฝ่าย คืน `{employee: Employee, manager: {id, name} | null}` จากข้อมูลเดิมเท่านั้น บัญชี inactive อ่านได้เฉพาะ HR ไม่คืนคำขอ เอกสาร โควตา หรือแจ้งเตือน และไม่เปลี่ยน scope ของ snapshot/colleagues ไม่เชื่อ actorId/role จาก query ไม่มี session คืน 401 รหัสผิดคืน 400 พนักงานเปิดประวัติคนอื่นคืน 403 FORBIDDEN โดยไม่ส่งข้อมูล และไม่พบพนักงานคืน 404 ใช้ได้กับ Go JSON/PostgreSQL, Node legacy และ IndexedDB ผ่าน `LeaveRepository.getEmployeeProfile()` โดยไม่ต้อง migration หรือ reset ข้อมูล

## ค้นหาสถานะเพื่อนร่วมงาน

`GET /api/colleagues?query=EMP-00008&date=2026-12-05` ต้องมี session ของ Employee, Manager หรือ HR ที่ยังใช้งานอยู่ ผู้ใช้ทุกบทบาทค้นหาข้อมูลสถานะพื้นฐานของพนักงานที่ active ได้ข้ามฝ่าย ไม่เปลี่ยนขอบเขตคำขอ เอกสาร โควตา หรือข้อมูลส่วนตัวใน `/api/snapshot` ผู้กระทำมาจาก session เท่านั้น ไม่เชื่อ `actorId` หรือ role ใน query/body

`query` ยาวไม่เกิน 100 ตัวอักษร รองรับชื่อบางส่วนโดยไม่แยกตัวพิมพ์เล็ก/ใหญ่ เลข `Employee.id` แบบตรงตัว (เช่น `8`) และรหัสแสดงผล `EMP-00008`/`emp00008` หากเว้นว่าง มีเฉพาะช่องว่าง หรือไม่ส่ง query ให้แสดงพนักงาน active ทุกคน (รวมเจ้าของบัญชี) เรียงตามชื่อ เช่น `GET /api/colleagues?date=2026-12-05` รหัส EMP คำนวณจาก id ไม่ใช่ field ใหม่ในฐานข้อมูล `date` ต้องเป็นวันที่ ISO ค.ศ. ที่มีจริง ไม่มี session คืน 401; query/date ไม่ถูกต้องคืน 400 `VALIDATION`; ไม่พบคนคืน `[]`

ผลลัพธ์แต่ละรายการมีเฉพาะ `employeeId`, `name`, `position`, `department`, `date`, `workStatus`, `leaveDuration` และ `updatedAt` ไม่มีอีเมล เบอร์โทร เพศ บทบาท ผู้จัดการ เหตุผล ประเภทลา เอกสาร หรือเลขคำขอ:

```json
[{"employeeId":8,"name":"ชุติมา แสงทอง","position":"เจ้าหน้าที่ประสานงานขาย","department":"ฝ่ายขาย","date":"2026-12-05","workStatus":"WFH","leaveDuration":null,"updatedAt":"2026-12-05T02:00:00.000Z"}]
```

`workStatus` คือ `In-office`/`WFH`/`Outside` ที่บันทึกในวันที่เลือก หรือ `null` เมื่อยังไม่ได้ระบุ ไม่สมมติว่าอยู่สำนักงาน `leaveDuration` คำนวณจาก `Leave_Day` ของคำขอ Approved ในวันนั้น: `Full` เมื่อรวมอย่างน้อย 1 วัน (รวมสองครึ่งวัน), `AM`/`PM` สำหรับครึ่งวัน และ `null` เมื่อไม่มีวันลาอนุมัติ การลาเต็มวันให้ `workStatus`/`updatedAt` เป็น `null`; ครึ่งวันคงสถานะงานของช่วงที่เหลือไว้ ไม่ส่งรายละเอียดคำขอ

IndexedDB ใช้ `src/domain/colleagues.js` และ Go API ใช้ `internal/service/colleagues.go` โดยตรวจเทียบผลลัพธ์ร่วมกัน API ตรวจ session/สิทธิ์และคืน projection เดิมผ่าน `LeaveRepository.searchColleagues()`

## ข้อมูลจำลองที่ API ใช้งาน

Go JSON server เริ่มต้น/คืนค่าจาก JSON 10 คนเดียวกันผ่าน go:embed ใน src/data/seed.go บันทึกที่ server/data/leave-management-go.json หรือ GO_DATA_FILE ไม่ย้ายหรือเขียนทับไฟล์ Node เดิม PostgreSQL อ่าน schema leave_app เดิมและเก็บ session/upload ในฐาน ดูรายละเอียดใน GO_BACKEND.md ส่วนคำอธิบาย mock JSON/CLI ด้านล่างเป็นโหมด Node legacy ที่เก็บไว้เทียบระหว่างย้าย

`POST /api/demo/reset` ใช้ได้เฉพาะ HR และแทนที่ข้อมูลใน runtime ของโหมดที่กำลังใช้ด้วยชุดต้นทาง 10 คน การแก้ไขที่บันทึกอยู่จะถูกล้าง ส่วนคำสั่ง `npm run seed -- --confirm` คืนค่าเฉพาะไฟล์ Node legacy ผ่าน CLI

API และ IndexedDB ของโหมดเบราว์เซอร์เริ่มต้นจาก source เดียวกัน แต่บันทึกแยกกัน ไม่มีการซิงก์ระหว่างโหมดหรือกลับไปยัง source JSON ไฟล์ SQL/SQLite ใน `database/sqlite/` เป็นสำเนาส่งออกสำหรับอ้างอิง ไม่มีการเชื่อม SQLite อัตโนมัติ ดูรายละเอียดชุดข้อมูลและการสร้างไฟล์ใหม่ใน [คู่มือชุด 10 คน](../src/data/README.md)

## ยื่นคำขอ

```json
{
  "type": "submit",
  "input": {
    "leaveTypeId": 1,
    "maternityCaseId": null,
    "startDate": "2026-12-04",
    "endDate": "2026-12-04",
    "duration": "Full",
    "reason": "พักผ่อนประจำปี",
    "attachment": null
  }
}
```

`duration`: `Full`, `AM`, `PM` · เอกสาร: `{fileName,fileType,fileSize,dataUrl}` โดย mock ใช้ base64 สำหรับ PDF/PNG/JPEG ไม่เกิน **25 MiB ต่อไฟล์** (`26214400` bytes; หน้าจอแสดง 25 MB ตามหน่วยเดิมของโปรเจกต์) ค่ากลางอยู่ใน `src/domain/attachments.js` ฝั่งประมวลผลตรวจทั้งขนาดที่แจ้ง ขนาดที่คำนวณจาก base64 และ signature ของชนิดไฟล์ ไม่เชื่อ `fileSize` เพียงอย่างเดียว

`POST /api/commands` รับ body ไม่เกิน `4 × ceil(MAX_ATTACHMENT_BYTES / 3) + 1 MiB` หรือ `36001112` bytes เพื่อรองรับ base64 พร้อม metadata; `POST /api/session` จำกัด 64 KiB คำขอ HTTP เกินเพดานคืน 413 `PAYLOAD_TOO_LARGE` ส่วนไฟล์เกิน 25 MiB หรือข้อมูลเอกสารไม่ถูกต้องคืน 400 `VALIDATION` ตรวจ session ก่อนรับ command body และตรวจสิทธิ์ตามเดิม ต้องรีสตาร์ต mock server หลังปรับเพดาน หากใช้ reverse proxy ภายนอกให้ตั้ง body limit สอดคล้องกัน

การจัดเก็บและ snapshot ยังเป็น base64 แบบเดิม ไม่ได้เปลี่ยนเป็น multipart หรือแยก object storage ไฟล์ใหญ่ใช้พื้นที่และหน่วยความจำเพิ่มประมาณหนึ่งในสามสำหรับส่วน base64 และมีสำเนาระหว่างอ่าน/ส่ง/บันทึก หลังบ้านจริงควรใช้ multipart upload/object storage แล้วคืน document ID หรือ storage key โดยปรับ adapter และ contract พร้อมกัน

ลาคลอด (`quotaScope = Pregnancy`) ต้องส่ง `maternityCaseId` ที่ HR เปิดให้เจ้าของคำขอ และ `duration = Full` ระบบอ่าน `Employee.gender` จากฐานข้อมูลหลังตรวจสิทธิ์ แล้วตรวจกรณี ผู้จัดการ วันที่ เหตุผล/นโยบาย/เอกสาร วันลาซ้อน และโควตาตามลำดับ `gender`, `employeeId`, `actorId` หรือ role ที่แทรกใน body ไม่เปลี่ยนเจ้าของคำขอหรือสิทธิ์นี้ กฎเดียวกันทำงานเมื่อ submit/edit และตรวจข้อมูลเจ้าของคำขอล่าสุดเมื่อ approve

กรณีไม่ผ่านเพศ กรณี หรือเงื่อนไขยื่นคำขอคืน 400 `VALIDATION` พร้อมข้อความเฉพาะ; session/สิทธิ์ยังใช้ 401/403 ตามเดิม หากโควตากรณีไม่พอก่อนอนุมัติคืน 409 `CONFLICT` และไม่เปลี่ยนสถานะ/หักยอด ใช้ `maximumDays` ต่อกรณีรวมข้ามปี คำขอที่ Pending กันสิทธิ์ไว้แยกจากยอด Approved

## Commands อื่น

| type | Fields ที่ต้องส่งเพิ่มเติม | สิทธิ์ |
| --- | --- | --- |
| edit | id, version, input (เหมือน submit), input.keepDocument | เจ้าของคำขอ Pending |
| withdraw | id, version | เจ้าของคำขอ Pending |
| approve | id, version, comment (ว่างได้) | ผู้จัดการของผู้ยื่น |
| reject | id, version, comment (บังคับ) | ผู้จัดการของผู้ยื่น |
| refer | id, version, comment, hrId | ผู้จัดการของผู้ยื่น |
| consult | id, version, comment | HR ที่ได้รับมอบหมาย |
| work | date (ISO), statusType | ผู้ใช้บันทึกสถานะของตัวเอง |
| readNotifications | — | อ่านแจ้งเตือนของตัวเอง |
| entitlement | employeeId, leaveTypeId, year (ค.ศ.), grantedDays | HR |
| maternity | employeeId, maximumDays | HR |
| holiday | date (ISO), name, remove? | HR |
| policy | policy (`LeaveType`) | HR |

`version` ต้องตรงค่าล่าสุดของคำขอ หลังแก้ไข/ให้ความเห็น/เปลี่ยนสถานะจะเพิ่ม version เมื่อได้ 409 ให้โหลด snapshot ใหม่ก่อนทำรายการต่อ

## Errors

```json
{"message":"ข้อความสำหรับแสดงผู้ใช้", "code":"CONFLICT"}
```

| Status | code ตัวอย่าง |
| --- | --- |
| 400 | VALIDATION |
| 401 | UNAUTHENTICATED |
| 403 | FORBIDDEN |
| 404 | NOT_FOUND |
| 409 | CONFLICT |
| 413 | PAYLOAD_TOO_LARGE |
| 500 | SERVER |

## ต่อฐานข้อมูลจริง

ย้าย validation/authorization และ transaction ใน `domain/service.js` ไปใช้ server ของคุณ ตรวจ session และ manager assignment ที่ server ทุกครั้ง การอนุมัติต้อง lock/version-check และตรวจสิทธิ์ล่าสุดใน transaction เดียว การหักโควตาในตัวอย่างคำนวณจากวันลาที่ Approved เพื่อไม่ให้หักซ้ำ

คำสั่งใน mock JSON server ถูก serialize และเขียนไฟล์โดย rename แบบ atomic เหมาะกับกระบวนการเดียวสำหรับทดลองพัฒนา; multi-instance หลังบ้านต้องใช้ transaction ใน SQL database

สำหรับ external API ให้ใช้ cookie/session หรือ token จากระบบของคุณ ปรับ `ApiRepository` ตามนั้น ถ้าใช้ cookie ข้าม origin ต้องตั้ง CORS เป็น origin ที่อนุญาตพร้อม credentials; ถ้าข้าม site ต้องใช้ HTTPS และ SameSite/Secure ให้เหมาะสม
