# Data Dictionary → โครงสร้างในแอป

Backend หลักปัจจุบันเป็น Go + Gin ใช้ structs ใน internal/model/model.go และ SQL mapping ใน internal/repository/postgres.go โดยรักษา schema leave_app, 9 ตาราง, session/upload, ISO dates, advisory lock/transaction และ delta เดิม ไม่ต้อง migration หรือ reset เพียงเพราะเปลี่ยนภาษา โหมด Go JSON ทดลองใช้ server/data/leave-management-go.json แยกจากฐานเดิม ดู [GO_BACKEND.md](GO_BACKEND.md) ข้อความที่กล่าวถึง server/*.ts ด้านล่างเป็น implementation Node เดิมที่เก็บไว้เทียบระหว่างย้าย

ใช้ตารางหลัก **9 ตาราง** ตามไฟล์ Data Dictionary เดิม มีส่วนเพิ่มสำหรับฟังก์ชันจาก Navigation Flow ตารางนี้แสดงชื่อฐานข้อมูลกับ array ใน snapshot / mock JSON database

ชื่อผู้ใช้ Login ของทั้ง 10 คนกำหนดเป็นชื่อเฉพาะบุคคล เช่น `pimchanok`/`thanawat` ผ่าน mapping อีเมลเดิมใน `src/domain/auth.js` ไม่ใช้ role/position ไม่เขียนทับ Employee.email และไม่บันทึก field ซ้ำ รองรับอีเมลเต็มด้วย หากชื่อผู้ใช้ซ้ำต้องใช้อีเมลเต็ม การตรวจบัญชี active/สิทธิ์ยังใช้ข้อมูล runtime รหัสทดลอง `1234` อยู่ในโค้ด ไม่ได้เก็บเป็นรหัสพนักงานในตาราง ไม่ต้อง reset ฐานหรือรัน migration เพื่อเปลี่ยนชื่อผู้ใช้/รหัสทดลอง บัญชีนอกชุดทดลองที่ไม่อยู่ใน mapping ใช้ส่วนก่อน @ ของอีเมลเป็น alias

| Table Name เดิม | Array ในแอป | หน้าที่ |
| --- | --- | --- |
| Employee | employees | บัญชีพนักงาน บทบาท ผู้จัดการ |
| Leave_Type | leaveTypes | ประเภทลา นโยบาย เกณฑ์เอกสาร |
| Leave_Entitlement | entitlements | สิทธิ์รายปี |
| Maternity_Case | maternityCases | สิทธิ์ต่อกรณีลาคลอด |
| Leave_Request | requests | คำขอลา วันที่ เหตุผล สถานะ |
| Leave_Day | days | แต่ละวันที่นับเป็นวันลาและปีของสิทธิ์ |
| Leave_Document | documents | เอกสารประกอบ |
| Leave_Approval | approvals | การตัดสินของผู้จัดการและการปรึกษา HR |
| Work_Status | workStatuses | สถานะการทำงานที่ผู้ใช้บันทึก |

`src/domain/types.d.ts` เป็นสัญญาโครงสร้างข้อมูลของ frontend JavaScript และ tools/tests ที่ยังใช้ TypeScript; `database/schema.sql` เป็น SQL สำหรับ SQLite ชุด 10 คนที่แอปใช้เริ่มต้นอยู่ใน `src/data/leave-management-10-people.json` โดย `createDemoDatabase()` ใน `src/data/demoDatabase.js` clone ข้อมูลสำหรับ repository ทั้งสองโหมด `database/legacy/mock.sqlite` และ `database/legacy/mock-db.json` เป็นข้อมูลตัวอย่างเดิม **โหมด JSON ไม่ได้เชื่อม SQLite โดยอัตโนมัติ** ส่วน Go/PostgreSQL ใช้ schema `leave_app` ตามหัวข้อฐานกลางด้านบน

`Leave_Document.fileSize` เก็บขนาดไฟล์ต้นฉบับเป็น bytes รองรับ PDF/JPG/PNG ถึง 25 MiB ต่อไฟล์ตาม `src/domain/attachments.js`; `dataUrl` ยังเป็น base64 ใน snapshot/JSON และ IndexedDB ซึ่งใช้พื้นที่มากกว่าไฟล์ต้นฉบับประมาณหนึ่งในสาม ไม่เพิ่มตารางหรือเปลี่ยน schema การบันทึกในเบราว์เซอร์ยังขึ้นกับพื้นที่ว่างและโควตาของอุปกรณ์

ภายใน IndexedDB เอกสารที่มี data URL เกิน 1 MiB หรือทำให้เอกสาร inline รวมเกิน 4 MiB แบ่งเป็น string chunks ไม่เกิน 4 MiB ต่อ record เพื่อรองรับข้อจำกัดขนาด record ของ Chromium เก็บ manifest และ chunks ใน object store `database` เดิม โดยคง database version 1 และคืน `dataUrl` เต็มตาม `Database` เดิมเมื่ออ่าน snapshot การแก้คำขอ การเขียนเอกสาร และการล้าง chunks เก่าอยู่ใน transaction เดียวกัน ข้อมูล inline เดิมอ่านได้ทันทีและแปลงเมื่อมีการเขียนสำเร็จครั้งถัดไป โดยไม่รีเซ็ตฐาน การแบ่งส่วนนี้เป็นรายละเอียดของ browser repository; รูปแบบ API, source JSON และ 9 ตารางหลักยังเหมือนเดิม

## แหล่งข้อมูลที่ใช้งานจริงในโหมดจำลอง

แผนผังไฟล์อยู่ใน [database/README.md](../database/README.md): `src/data/` มี source JSON และ repository; `database/supabase/` มี PostgreSQL setup/migration; `database/sqlite/` มีชุดส่งออก; `database/legacy/` เก็บตัวอย่างเก่า; `docs/reference/data-dictionary.csv` เป็นเอกสารอ้างอิง ใช้ schema กลาง `database/schema.sql` เพียงไฟล์เดียว ตรวจความตรงกันด้วย `npm run data:check` การย้ายไฟล์ในรอบนี้ไม่เปลี่ยนตำแหน่ง runtime หรือจำเป็นต้องคืนค่าข้อมูล

หลังลดเพดานแนบใหม่เหลือ 25 MiB เอกสารที่เก็บไว้ตามเพดานเดิมถึง 100 MiB ยังอ่าน/ดาวน์โหลดและเก็บไว้ขณะแก้ไขหรืออนุมัติได้ ไม่ย้าย ลบ หรือย่อไฟล์เดิม และไม่ต้องแก้ schema

- โหมดเบราว์เซอร์: IndexedDB `leave-management-10-people-v1` เริ่มต้นด้วยชุด 10 คนและเก็บการทำรายการต่อในเบราว์เซอร์ ฐานเดิม `leave-management-v1` ถูกเก็บไว้
- โหมด Go JSON (`dev:api`): อ่าน/เขียน `server/data/leave-management-go.json` หรือพาธจาก `GO_DATA_FILE` หากยังไม่มีไฟล์ให้เริ่มจากชุด JSON ต้นทางเดียวกัน
- โหมด Node legacy (`dev:legacy`): อ่าน/เขียน `server/data/leave-management-10-people.json` หรือพาธจาก `MOCK_DATA_FILE` เก็บฐาน runtime เดิมทั้งหมดไว้
- แต่ละโหมดเก็บข้อมูลแยกกัน ไม่ซิงก์กัน และไม่เขียนการทำรายการกลับไปยัง `src/data/leave-management-10-people.json`, SQL หรือ SQLite
- HR คืนค่าข้อมูลจำลองเป็นชุดต้นทาง 10 คนได้ในโหมดที่ใช้งานอยู่ การคืนค่าล้างการแก้ไขในฐาน runtime ของโหมดนั้น CLI `npm run seed -- --confirm` คืนค่าเฉพาะไฟล์ Node legacy
- ตัวสร้าง `scripts/generate-demo.ts` และ `scripts/build-sqlite.py` สร้าง JSON ต้นทางใน `src/data/` และไฟล์ส่งออกใน `database/sqlite/` ไม่แก้ฐาน runtime หากต้องการใช้ source ใหม่กับข้อมูลที่มีอยู่แล้ว ต้องเรียกการคืนค่าของ HR

ชุด 10 คนมีสิทธิ์รายปี ค.ศ. 2026 และ 2027; ปีอื่นต้องให้ HR จัดสรร รายละเอียดบัญชีและสถานการณ์ตัวอย่างอยู่ใน [src/data/README.md](../src/data/README.md)

## Field mapping

| Table | SQL / Data Dictionary | Frontend / JSON |
| --- | --- | --- |
| Employee | Employee_id, Name, Gender, Email, Phone, Position, Role, Manager_id | id, name, gender, email, phone, position, role, managerId |
| Leave_Type | Leave_type_id, Leave_type_name, Quota_scope, Default_quota_days, Day_count_basis | id, name, quotaScope, defaultQuotaDays, dayCountBasis |
| Leave_Type | Advance_notice_days, Document_required_from_days, Required_document_type, Eligible_gender | advanceNoticeDays, documentRequiredFromDays, requiredDocumentType, eligibleGender |
| Leave_Entitlement | Entitlement_id, Employee_id, Leave_type_id, Entitlement_year, Granted_days | id, employeeId, leaveTypeId, year, grantedDays |
| Maternity_Case | Maternity_case_id, Employee_id, Case_no, Maximum_days | id, employeeId, caseNo, maximumDays |
| Leave_Request | Leave_id, Employee_id, Leave_type_id, Maternity_case_id, Start_date, End_date, Reason, Request_date, Status | id, employeeId, leaveTypeId, maternityCaseId, startDate, endDate, reason, requestDate, status |
| Leave_Day | Leave_day_id, Leave_id, Leave_date, Entitlement_id | id, leaveId, date, entitlementId |
| Leave_Document | Document_id, Leave_id, Document_type, File_name, Storage_key, File_type, File_size, Uploaded_at | id, leaveId, documentType, fileName, storageKey, fileType, fileSize, uploadedAt |
| Leave_Approval | Approval_id, Leave_id, Approver_id, Step_no, Review_role, Review_type, Status, Comment, Assigned_at, Reviewed_at | id, leaveId, approverId, stepNo, reviewRole, reviewType, status, comment, assignedAt, reviewedAt |
| Work_Status | Work_status_id, Employee_id, Status_date, Status_type, Leave_id, Updated_at | id, employeeId, date, statusType, (derived leave link), updatedAt |

## Derived fields

- `Leave_Request.Total_days` = SUM(Leave_Day.Units)
- `Leave_Entitlement.Used_days` = วันที่เชื่อมสิทธิ์นี้และคำขอ Approved
- `Remaining_days` = Granted_days − Used_days
- `Pending_days` = วันจากคำขอ Pending (แยกจาก Used_days)
- ลาคลอดใช้วันที่ของคำขอที่เชื่อม Maternity_case_id และ Approved
- วันลาอนุมัติจะทำให้สถานะทำงานแสดง `Leave`; ครึ่งวันแสดงสถานะเวลาที่เหลือร่วมกับ Leave

ใน SQL มี views `Leave_Request_Summary`, `Leave_Entitlement_Balance`, `Maternity_Case_Balance` จึงไม่ต้องบันทึกค่าคำนวณซ้ำ

## ข้อมูลค้นหาสถานะเพื่อนร่วมงาน

`ColleagueStatus` เป็นผลอ่านที่คำนวณจาก Employee, Work_Status และ Leave_Request/Leave_Day ไม่เพิ่มตารางหรือ field ที่บันทึกซ้ำ รหัส `EMP-00008` เป็นรูปแบบแสดงผลของ `Employee.id = 8` เท่านั้น ค้นหาด้วยเลข id หรือชื่อบางส่วนได้

ผู้ใช้ที่เข้าสู่ระบบและ active ทุกบทบาทค้นหาเพื่อนร่วมงาน active ข้ามฝ่ายได้เฉพาะชื่อ รหัส ตำแหน่ง ฝ่าย และสถานะในวันที่เลือก หากไม่มีตัวกรองให้แสดงทุกคนที่ active รวมเจ้าของบัญชี เรียงตามชื่อ รายละเอียดการลาและข้อมูลส่วนตัวใน snapshot ยังคงกรองตามสิทธิ์เดิม ใช้เฉพาะ Leave_Day ที่เชื่อมคำขอ Approved ไม่ใช้ Pending และไม่คำนวณวันลาเดิมใหม่จากปฏิทินวันหยุด การลาเต็มวัน/สองครึ่งวันแทนสถานะงาน; ครึ่งวันแสดง AM/PM ร่วมกับสถานะช่วงที่เหลือ

เมื่อไม่พบ Work_Status ในวันที่เลือก ผลค้นหาให้ `workStatus = null` และหน้าจอแสดง “ยังไม่ได้ระบุสถานะ” ต่างจากค่าเริ่มต้น In-office ของหน้าบันทึกสถานะเดิม เพื่อไม่ให้ผลค้นหายืนยันสถานะที่ยังไม่มีการบันทึก

## กฎลาคลอดจากข้อมูลเดิม

หลังตรวจ session บทบาท และความเป็นเจ้าของ/ผู้จัดการของคำขอ ระบบใช้ `Employee.gender` ของเจ้าของคำขอจากฐานข้อมูล: `Female` ตรวจขั้นถัดไป, `Male` ไม่ผ่านนโยบายลาคลอดของโปรเจกต์, `Other` หรือค่าที่ไม่มี/ไม่ถูกต้องต้องติดต่อ HR เพื่อตรวจข้อมูล ไม่รับเพศจาก `RequestInput` หรือ command body เป็นหลักฐานสิทธิ์

ลำดับตรวจคือ เพศ → กรณีลาคลอด → ผู้จัดการที่ใช้งานได้ → วันที่และเต็มวัน → เหตุผล/ล่วงหน้า/เอกสารตามนโยบาย → วันลาซ้อน → โควตา แล้วจึงเปิดหน้าตรวจสอบก่อนส่ง กรณีที่เลือกต้องมีอยู่และเป็นของเจ้าของคำขอ HR เปิดกรณีให้ได้เมื่อเพศของพนักงานที่เลือกผ่านเงื่อนไข โดยไม่ใช้เพศของบัญชี HR เป็นตัวตัดสิน

สิทธิ์ต่อกรณีอ่านจาก `Maternity_Case.maximumDays` วันลาคลอดนับตามปฏิทิน รวมเสาร์–อาทิตย์/วันหยุด ใช้ `Full` และ `Leave_Day.entitlementId = null` แม้ข้ามปี ยอดคงเหลือ = maximumDays − วันที่ Approved; พร้อมยื่นเพิ่ม = คงเหลือ − วันที่ Pending โดยตัดคำขอเดิมออกขณะตรวจการแก้ไขหรืออนุมัติ ก่อนอนุมัติตรวจเพศ กรณี นโยบาย วันลา และโควตาล่าสุดใน transaction เดียวกับการเปลี่ยนสถานะ หากโควตาเปลี่ยนจนไม่พอให้ `CONFLICT`/HTTP 409 และคง Pending ไว้ การตรวจล่วงหน้าตอนอนุมัติอ้างอิงเวลายื่น/แก้ไขล่าสุด ไม่ใช่เวลาที่ผู้จัดการตัดสินผล

ใช้โครงสร้าง 9 ตารางและค่าคำนวณเดิม ไม่มีการเพิ่มตารางหรือบันทึกยอดใช้แล้วซ้ำ เงื่อนไขลาคลอดเป็นนโยบายตัวอย่างของโปรเจกต์เช่นเดียวกับประเภทลาอื่น

## ส่วนเพิ่มจาก dictionary

| ส่วนเพิ่ม | เหตุผล |
| --- | --- |
| Employee.Department / Active | แสดงฝ่ายและบัญชีที่ใช้งาน |
| Leave_Request.Duration (`Full`,`AM`,`PM`) | ลาครึ่งวันตามต้นแบบหน้าจอ |
| Leave_Day.Units และ Granted_days แบบ NUMERIC | รองรับ 0.5 วันแทน INT |
| Leave_Request.Status = `Withdrawn` | ยกเลิกคำขอโดยรักษาประวัติ |
| Leave_Request.Version | ป้องกันบันทึกทับข้อมูลเก่า/อนุมัติซ้ำ |
| Leave_Request.Timeline_json | ลำดับการดำเนินการใน demo |
| Leave_Approval.Status = `Completed` สำหรับ Consultation | HR ให้ความเห็นโดยไม่อนุมัติคำขอ |
| Leave_Approval.Cancelled | ไม่ใช้การพิจารณาเดิมหลังแก้ไข/ยกเลิก |
| Leave_Document.Data_url | เก็บเอกสารจริงใน demo; หลังบ้านจริงใช้ storage key |
| App_Notification / notifications | การแจ้งเตือนจาก Navigation Flow |
| App_Holiday / holidays | ยกเว้นวันหยุดในการนับวันทำงาน |
| schemaVersion | เวอร์ชันรูปแบบ JSON ที่ repository รองรับ |

ตารางสนับสนุนสองตารางไม่ถูกนับรวมใน 9 ตารางหลัก และไม่ได้แอบแก้ไฟล์ Data Dictionary ต้นฉบับ

## เปิดฐานข้อมูลตัวอย่าง

สำหรับ Supabase/PostgreSQL ใช้ [setup-10-people.sql](../database/supabase/setup-10-people.sql) สร้าง schema ใหม่ `leave_app` พร้อม 9 ตารางหลัก/ตารางสนับสนุน/views และ seed 10 คน ใช้ TIMESTAMPTZ/JSONB เปิด RLS ถอนสิทธิ์ browser roles รวม views แล้วรัน [002-cloud-api.sql](../database/supabase/002-cloud-api.sql) เพื่อเพิ่ม App_Session (token hash/employee/expiry), App_Upload (staging metadata/owner/expiry) และ App_Upload_Part (ordered base64 parts) โดยไม่ล้างข้อมูลเดิม ส่วนเพิ่มไม่นับใน 9 ตารางหลัก ไม่มี Supabase Auth users; api/go.go ใช้ session ของชุด demo ที่เปิดผ่าน environment ดู [SUPABASE.md](SUPABASE.md)

`internal/repository/postgres.go` map SQL กลับเป็น Database เดิม วันที่ DATE อ่าน ISO ค.ศ. timestamp อ่าน UTC ISO; boolean additions เก็บ 0/1 ตาม mapping เดิม Read transaction ใช้ repeatable read; mutation ใช้ advisory transaction lock ร่วมทุก instance และ SELECT FOR UPDATE ก่อนเรียก domain เขียนเฉพาะแถวที่เปลี่ยนพร้อม quota/version ใน transaction เดียว ไม่บันทึกยอดคำนวณซ้ำ `server/postgresStore.ts` เป็น implementation Node เดิมที่ใช้ตรวจเทียบ

Cloud snapshot อ่านเอกสารเฉพาะ metadata คืน remote:true/dataUrl:'' (remote ไม่ใช่คอลัมน์ SQL) แต่ Leave_Document.Data_url ในฐานยังเก็บ base64 จริงที่ผ่านการตรวจขนาด/ชนิด/เนื้อหา ดาวน์โหลดผ่าน API เป็นส่วน ๆ หลังตรวจ canView ทุกครั้ง การยื่น/แก้ไข consume staging และล้าง parts พร้อมคำขอ/เอกสารใน transaction เดียว ไม่ล้าง data_url เดิมเมื่อโหลด metadata แล้วบันทึกคำสั่งอื่น ข้อมูลและ staging ใช้โควตาฐาน Free 500 MB ร่วมกัน ไม่ใช้ Supabase Storage; ส่งออก JSON จาก cloud เป็น metadata เอกสาร

เปิดชุด 10 คน `database/sqlite/leave-management-10-people.sqlite` ด้วยเครื่องมือ SQLite ที่คุณใช้อยู่ หรือนำเข้า `database/sqlite/leave-management-10-people.sql` ในฐานใหม่ที่ว่าง ไฟล์เหล่านี้เป็นสำเนาส่งออก ไม่ใช่ฐานที่แอปอ่าน/เขียนขณะทำรายการ ตัวอย่างเดิมอยู่ใน `database/legacy/` ส่วน `database/schema.sql` เป็น schema กลาง

```sql
SELECT * FROM Leave_Entitlement_Balance;
SELECT Leave_id, Status, Total_days FROM Leave_Request_Summary;
SELECT * FROM Maternity_Case_Balance;
```

วันที่ภายในฐานข้อมูลเป็น ค.ศ. ISO เช่น `2026-12-05` ส่วน UI แปลงเป็น `5/12/2569` ชื่อและข้อมูลทุกแถวเป็นข้อมูลสมมติ
