# REST API contract

ตัวอย่าง implementation: `server/index.ts` · frontend adapter: `src/data/apiRepository.ts`

บน Vercel ใช้ api/router.ts → server/cloudApi.ts → server/postgresStore.ts เชื่อม PostgreSQL private schema leave_app ใช้ business commands เดิมและ session ฝั่ง server ไม่ใช้ไฟล์ JSON/session ใน memory ดู [SUPABASE.md](SUPABASE.md) API mode ไม่ fallback บันทึกลง IndexedDB เมื่อ backend ขัดข้อง

## Cloud transport เพิ่มเติม

| Method | Path | ข้อมูล |
| --- | --- | --- |
| GET | `/api/health` | cloud: status ok, mode cloud-postgres, documentTransport parts-v1, partCharacters 2097152; 503 เมื่อฐาน/migration ไม่พร้อม |
| POST | `/api/uploads` | `{fileName,fileType,fileSize,encodedLength}` → `{uploadId,partCharacters}`; Employee/session |
| PUT | `/api/uploads/:uploadId/parts/:part` | `{data}` base64; owner/session, idempotent replacement ของส่วนเดิม |
| DELETE | `/api/uploads/:uploadId` | ยกเลิก staging ของตนเอง |
| GET | `/api/documents/:id` | metadata + totalCharacters/partCharacters; ตรวจ canView |
| GET | `/api/documents/:id/parts/:part` | `{part,data}` ส่วน data URL ที่บันทึก; ตรวจ canView ใหม่ทุกครั้ง |

ทุก private response ใช้ no-store; cookie HttpOnly/SameSite=Lax/Secure เมื่อ HTTPS เซสชันเก็บ token hash อายุ 8 ชั่วโมงในฐานร่วมกัน บัญชี demo เปิดได้เฉพาะ ENABLE_DEMO_LOGIN=true และไม่ใช่ Supabase Auth

Cloud จำกัด body command/part 3 MiB, login/metadata 64 KiB; base64 ไม่เกิน 2 MiB ตัวอักษรต่อส่วน ต่ำกว่า Vercel 4.5 MB รองรับไฟล์เดิม 100 MiB ApiRepository ตรวจ health เพื่อเลือก transport; mock JSON ที่ไม่มี parts-v1 ส่ง dataUrl เดิม Cloud submit/edit อ้างอิง `{attachment:{uploadId}}` หลังตรวจส่วนครบ/owner server ขยายเป็น AttachmentInput แล้วใช้ validator/domain เดิม ตรวจเพศ/กรณีก่อนข้อผิดพลาดไฟล์ บันทึกคำขอ/เอกสารและ consume staging ใน transaction เดียว ไม่อนุญาตใช้ upload ของคนอื่น

Cloud snapshot คืน documents ตามสิทธิ์ด้วย remote:true/dataUrl:'' ไม่ส่งเอกสารใหญ่ตอน Login/ทุก 15 วินาที downloadDocument ของ adapter โหลด parts เมื่อกดดาวน์โหลดและตรวจขนาด Blob เทียบ fileSize ไฟล์เก็บ base64 ใน PostgreSQL ใช้พื้นที่ฐานร่วมกัน; ไม่ใช่ object storage การส่งออก JSON จาก HR ใน cloud จึงไม่รวมเนื้อไฟล์ remote

API คืน JSON ทุก response วันที่ของข้อมูลเป็น ISO **ค.ศ. `YYYY-MM-DD`** และ timestamp เป็น UTC ISO 8601 ช่องกรอก/ข้อความบนหน้าจอเป็น **พ.ศ. `d/m/yyyy`** โดยแปลงใน `src/domain/date.ts`

## Endpoints

| Method | Path | Input | Output |
| --- | --- | --- | --- |
| GET | `/api/health` | — | `{status:"ok", mode:"mock-json"}` |
| POST | `/api/session` | `{email, password}` | `{employee}` และ HttpOnly cookie |
| GET | `/api/session` | session cookie | `{employee}` หรือ 401 |
| DELETE | `/api/session` | — | `{message}` ล้าง session |
| GET | `/api/snapshot` | session cookie | `Database` ที่กรองตามบทบาท |
| GET | `/api/colleagues` | session cookie, `query`, `date` (ISO ค.ศ.) | `ColleagueStatus[]` ข้อมูลสถานะเพื่อนร่วมงาน |
| POST | `/api/commands` | `Command` | `{message, id?}` |
| POST | `/api/demo/reset` | `{}` + HR session | `{message}` |

API จะเลือกผู้กระทำจาก session **ไม่รับ actorId/role จาก body** พนักงานเห็นข้อมูลคำขอตัวเอง ผู้จัดการเห็นทีมที่เป็นผู้จัดการโดยตรง HR มองเห็นข้อมูลการลาเพื่อดูแลสิทธิ์ แต่ส่งความเห็นได้เฉพาะคำขอที่ได้รับมอบหมาย

## ค้นหาสถานะเพื่อนร่วมงาน

`GET /api/colleagues?query=EMP-00008&date=2026-12-05` ต้องมี session ของ Employee, Manager หรือ HR ที่ยังใช้งานอยู่ ผู้ใช้ทุกบทบาทค้นหาข้อมูลสถานะพื้นฐานของพนักงานที่ active ได้ข้ามฝ่าย ไม่เปลี่ยนขอบเขตคำขอ เอกสาร โควตา หรือข้อมูลส่วนตัวใน `/api/snapshot` ผู้กระทำมาจาก session เท่านั้น ไม่เชื่อ `actorId` หรือ role ใน query/body

`query` ยาวไม่เกิน 100 ตัวอักษร รองรับชื่อบางส่วนโดยไม่แยกตัวพิมพ์เล็ก/ใหญ่ เลข `Employee.id` แบบตรงตัว (เช่น `8`) และรหัสแสดงผล `EMP-00008`/`emp00008` หากเว้นว่าง มีเฉพาะช่องว่าง หรือไม่ส่ง query ให้แสดงพนักงาน active ทุกคน (รวมเจ้าของบัญชี) เรียงตามชื่อ เช่น `GET /api/colleagues?date=2026-12-05` รหัส EMP คำนวณจาก id ไม่ใช่ field ใหม่ในฐานข้อมูล `date` ต้องเป็นวันที่ ISO ค.ศ. ที่มีจริง ไม่มี session คืน 401; query/date ไม่ถูกต้องคืน 400 `VALIDATION`; ไม่พบคนคืน `[]`

ผลลัพธ์แต่ละรายการมีเฉพาะ `employeeId`, `name`, `position`, `department`, `date`, `workStatus`, `leaveDuration` และ `updatedAt` ไม่มีอีเมล เบอร์โทร เพศ บทบาท ผู้จัดการ เหตุผล ประเภทลา เอกสาร หรือเลขคำขอ:

```json
[{"employeeId":8,"name":"ชุติมา แสงทอง","position":"เจ้าหน้าที่ประสานงานขาย","department":"ฝ่ายขาย","date":"2026-12-05","workStatus":"WFH","leaveDuration":null,"updatedAt":"2026-12-05T02:00:00.000Z"}]
```

`workStatus` คือ `In-office`/`WFH`/`Outside` ที่บันทึกในวันที่เลือก หรือ `null` เมื่อยังไม่ได้ระบุ ไม่สมมติว่าอยู่สำนักงาน `leaveDuration` คำนวณจาก `Leave_Day` ของคำขอ Approved ในวันนั้น: `Full` เมื่อรวมอย่างน้อย 1 วัน (รวมสองครึ่งวัน), `AM`/`PM` สำหรับครึ่งวัน และ `null` เมื่อไม่มีวันลาอนุมัติ การลาเต็มวันให้ `workStatus`/`updatedAt` เป็น `null`; ครึ่งวันคงสถานะงานของช่วงที่เหลือไว้ ไม่ส่งรายละเอียดคำขอ

ทั้ง IndexedDB และ API ใช้ `src/domain/colleagues.ts` เป็นกฎร่วม เมื่อเปลี่ยนหลังบ้านจริงให้รองรับ `LeaveRepository.searchColleagues()` และตรวจ session/สิทธิ์ projection ที่ server เช่นเดียวกัน

## ข้อมูลจำลองที่ API ใช้งาน

Mock server เริ่มต้นและคืนค่าด้วย `createDemoDatabase()` ใน `src/data/demoDatabase.ts` ซึ่ง clone ข้อมูล 10 คนจาก `src/data/leave-management-10-people.json` การทำรายการบันทึกลง `server/data/leave-management-10-people.json` โดยค่าเริ่มต้น หรือไฟล์ที่กำหนดด้วย `MOCK_DATA_FILE` หากไฟล์ runtime มีอยู่แล้วจะอ่านข้อมูลนั้นต่อ ไม่เขียนทับเมื่อ restart และเก็บ `server/data/db.json` เดิมไว้

`POST /api/demo/reset` ใช้ได้เฉพาะ HR และแทนที่ข้อมูลในไฟล์ runtime ที่เลือกด้วยชุดต้นทาง 10 คน การแก้ไขที่บันทึกอยู่ในไฟล์นั้นจะถูกล้าง ส่วนคำสั่ง `npm run seed -- --confirm` ทำการคืนค่าเดียวกันผ่าน CLI

API และ IndexedDB ของโหมดเบราว์เซอร์เริ่มต้นจาก source เดียวกัน แต่บันทึกแยกกัน ไม่มีการซิงก์ระหว่างโหมดหรือกลับไปยัง source JSON ไฟล์ SQL/SQLite ใน `src/data/` เป็นสำเนาส่งออกสำหรับอ้างอิง ไม่มีการเชื่อม SQLite อัตโนมัติ ดูรายละเอียดชุดข้อมูลและการสร้างไฟล์ใหม่ใน [คู่มือชุด 10 คน](../src/data/README.md)

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

`duration`: `Full`, `AM`, `PM` · เอกสาร: `{fileName,fileType,fileSize,dataUrl}` โดย mock ใช้ base64 สำหรับ PDF/PNG/JPEG ไม่เกิน **100 MiB ต่อไฟล์** (`104857600` bytes; หน้าจอแสดง 100 MB ตามหน่วยเดิมของโปรเจกต์) ค่ากลางอยู่ใน `src/domain/attachments.ts` ฝั่งประมวลผลตรวจทั้งขนาดที่แจ้ง ขนาดที่คำนวณจาก base64 และ signature ของชนิดไฟล์ ไม่เชื่อ `fileSize` เพียงอย่างเดียว

`POST /api/commands` รับ body ไม่เกิน `4 × ceil(MAX_ATTACHMENT_BYTES / 3) + 1 MiB` หรือ `140858712` bytes เพื่อรองรับ base64 พร้อม metadata; `POST /api/session` จำกัด 64 KiB คำขอ HTTP เกินเพดานคืน 413 `PAYLOAD_TOO_LARGE` ส่วนไฟล์เกิน 100 MiB หรือข้อมูลเอกสารไม่ถูกต้องคืน 400 `VALIDATION` ตรวจ session ก่อนรับ command body และตรวจสิทธิ์ตามเดิม ต้องรีสตาร์ต mock server หลังปรับเพดาน หากใช้ reverse proxy ภายนอกให้ตั้ง body limit สอดคล้องกัน

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

ย้าย validation/authorization และ transaction ใน `domain/service.ts` ไปใช้ server ของคุณ ตรวจ session และ manager assignment ที่ server ทุกครั้ง การอนุมัติต้อง lock/version-check และตรวจสิทธิ์ล่าสุดใน transaction เดียว การหักโควตาในตัวอย่างคำนวณจากวันลาที่ Approved เพื่อไม่ให้หักซ้ำ

คำสั่งใน mock JSON server ถูก serialize และเขียนไฟล์โดย rename แบบ atomic เหมาะกับกระบวนการเดียวสำหรับทดลองพัฒนา; multi-instance หลังบ้านต้องใช้ transaction ใน SQL database

สำหรับ external API ให้ใช้ cookie/session หรือ token จากระบบของคุณ ปรับ `ApiRepository` ตามนั้น ถ้าใช้ cookie ข้าม origin ต้องตั้ง CORS เป็น origin ที่อนุญาตพร้อม credentials; ถ้าข้าม site ต้องใช้ HTTPS และ SameSite/Secure ให้เหมาะสม
