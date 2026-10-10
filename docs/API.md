# REST API contract

ตัวอย่าง implementation: `server/index.ts` · frontend adapter: `src/data/apiRepository.ts`

API คืน JSON ทุก response วันที่ของข้อมูลเป็น ISO **ค.ศ. `YYYY-MM-DD`** และ timestamp เป็น UTC ISO 8601 ช่องกรอก/ข้อความบนหน้าจอเป็น **พ.ศ. `d/m/yyyy`** โดยแปลงใน `src/domain/date.ts`

## Endpoints

| Method | Path | Input | Output |
| --- | --- | --- | --- |
| GET | `/api/health` | — | `{status:"ok", mode:"mock-json"}` |
| POST | `/api/session` | `{email, password}` | `{employee}` และ HttpOnly cookie |
| GET | `/api/session` | session cookie | `{employee}` หรือ 401 |
| DELETE | `/api/session` | — | `{message}` ล้าง session |
| GET | `/api/snapshot` | session cookie | `Database` ที่กรองตามบทบาท |
| POST | `/api/commands` | `Command` | `{message, id?}` |
| POST | `/api/demo/reset` | `{}` + HR session | `{message}` |

API จะเลือกผู้กระทำจาก session **ไม่รับ actorId/role จาก body** พนักงานเห็นข้อมูลคำขอตัวเอง ผู้จัดการเห็นทีมที่เป็นผู้จัดการโดยตรง HR มองเห็นข้อมูลการลาเพื่อดูแลสิทธิ์ แต่ส่งความเห็นได้เฉพาะคำขอที่ได้รับมอบหมาย

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

`duration`: `Full`, `AM`, `PM` · เอกสาร: `{fileName,fileType,fileSize,dataUrl}` โดย mock ใช้ base64 สำหรับ PDF/PNG/JPEG ไม่เกิน 2 MiB หลังบ้านจริงควรเปลี่ยนเป็น multipart upload/object storage แล้วคืน document ID หรือ storage key โดยปรับ adapter และ contract พร้อมกัน

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
