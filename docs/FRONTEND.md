# Frontend: React + JavaScript

Frontend ใช้ React, JavaScript, Vite, React Router, Tailwind CSS และ Jest + React Testing Library ตามเครื่องมือใน [รายวิชา Frontend](https://plearnjai.com/fe2026/course_520341.html) หน้าตา ข้อความ ธีม เมนู วันที่ พ.ศ. และขั้นตอนของเว็บเดิมคงอยู่ หลังบ้านใช้ Go + Gin ตาม [GO_BACKEND.md](GO_BACKEND.md)

## เปิดเพื่อทดลอง

ติดตั้ง Node.js 22.12 ขึ้นไป และ Go 1.26 ขึ้นไป จากนั้นรันที่รากโปรเจกต์:

```bash
npm install
npm run dev:api
```

เปิด URL ที่ Terminal แสดง โดยปกติคือ `http://localhost:5173` คำสั่งนี้เปิด Vite และ Go API ด้วยกัน ข้อมูลทดลองบันทึกใน `server/data/leave-management-go.json` โดยไม่เขียนทับฐาน Node เดิมหรือ Supabase

`npm run dev` ใช้ IndexedDB ในเบราว์เซอร์ ส่วน `npm run dev:cloud` ใช้ Go API กับ PostgreSQL ตามค่าใน `.env` ข้อมูลแต่ละโหมดแยกกัน ไม่มีการย้ายหรือซิงก์ให้อัตโนมัติ

## ลำดับอ่านโค้ด

| ไฟล์ | สิ่งที่ควรดู |
| --- | --- |
| `src/main.jsx` | เริ่ม React ด้วย `createRoot` และนำเข้า CSS |
| `src/App.jsx` | บัญชีที่เข้าสู่ระบบ โหลดข้อมูล และ layout หลัก |
| `src/routes.jsx` | เส้นทางกับหน้าจอของแต่ละบทบาท |
| `src/Login.jsx` | `useState`, event และการกรอกบัญชีทดลอง |
| `src/pages/EmployeeProfilePage.jsx` | โหลดประวัติผ่าน repository แยก Employee เฉพาะตนเอง Manager/HR ข้ามฝ่าย แสดงแบบเต็มหน้าหรือในป๊อปอัป |
| `src/AccountMenu.jsx` | เมนูรูปบัญชีมุมขวาบน เลือกโปรไฟล์เพื่อเปิดประวัติตนเองแบบเต็มหน้า |
| `src/EmployeeProfileLink.jsx` | ใช้ Context เปิดป๊อปอัปประวัติจากชื่อพนักงาน |
| `src/NotificationToasts.jsx` | เทียบแจ้งเตือนใหม่ของบัญชี คิวป๊อปอัป 3 วินาที และ cleanup timer |
| `src/pages/LeaveForm.jsx` | state ของฟอร์ม ตรวจข้อมูล และตรวจสอบก่อนส่ง |
| `src/data/apiRepository.js` | `fetch`, JSON, cookie และการเรียก API |
| `src/domain/service.js` | กฎที่ฟอร์มใช้ตรวจเบื้องต้น และโหมด IndexedDB |
| `tests/ui/workspace.test.jsx` | ทดสอบหน้าจอจากการกดและกรอกของผู้ใช้ |

ไฟล์ `.jsx` คือ JavaScript ที่เขียน JSX สำหรับหน้าจอ ส่วน `.js` ใช้กับฟังก์ชันและการเชื่อมข้อมูล ไม่มี type annotation ในโค้ดที่เบราว์เซอร์รัน

รายการบัญชีทดลองหน้าเข้าสู่ระบบแสดง “ชื่อพนักงาน · ชื่อผู้ใช้ · ตำแหน่งภาษาอังกฤษ” โดย `getDemoAccounts()` ส่งตำแหน่งจากข้อมูลตัวอย่างเดิมและ `formatPosition()` แปลงชื่อสำหรับแสดงผล การเลือกบัญชียังกรอกชื่อผู้ใช้เดิมกับรหัสทดลอง ไม่ใช้ตำแหน่งเป็นชื่อเข้าสู่ระบบ

`src/`, หลังบ้าน Node เดิมใน `server/`, สคริปต์ และชุดทดสอบใช้ JavaScript ทั้งหมด โครงสร้างข้อมูลกลางอยู่ใน JSDoc ของ `src/domain/types.js` และ `PageProps` อยู่ใน `src/pages/types.js` ส่วนคำอธิบายฟังก์ชัน domain อยู่ข้าง implementation โดยตรง ไม่มีไฟล์ `.ts`, `.tsx` หรือ `.d.ts` ที่โปรเจกต์เขียนเอง หลังบ้าน Go และรูปแบบข้อมูลที่บันทึกคงเดิม

แพ็กเกจ `typescript` และ `@types/*` ยังเป็นเครื่องมือพัฒนาเพื่ออ่าน JSDoc และแนะนำชนิดข้อมูลใน editor ไม่ใช่ภาษา source ของแอปหรือโค้ดที่รันในเบราว์เซอร์ ส่วน `tsx` ที่เคยใช้เปิด TypeScript ถูกถอดออกแล้ว Node legacy เปิด `.js` ได้โดยตรง

รอบเปลี่ยน source เป็น JavaScript 11/10/2569: ชุดทดสอบ Node 185 และ Jest 59 รายการผ่าน รวม 244 รายการ พร้อม lint, JSDoc check, format, Vercel frontend build, Go tests/vet/build, Vercel Go wrapper, parity 139 กรณี, PostgreSQL integration และ data:check ตรวจ AST ของ implementation เดิม 91 โมดูลแล้วตรงกันหลังตัดชนิดข้อมูลและปรับเส้นทาง import ต่างเฉพาะ launcher กับวิธีทดสอบ native boot ตามการเปลี่ยนภาษา SHA-256 ของไฟล์ข้อมูลต้นทาง/ส่งออก/ฐานในเครื่อง 11 ไฟล์เท่าเดิม ตรวจ Edge headless 12 กรณี ครบสามบทบาท สองธีม และกว้าง 390/1440px ไม่พบ page error หรือหน้าล้นแนวนอน ใช้ browser context และฐานทดสอบแยก ไม่ทำรายการกับ Supabase จริง

## เปลี่ยนหน้าอย่างไร

`App` ครอบ workspace ด้วย `HashRouter` และ `src/routes.jsx` กำหนดหน้าผ่าน `useRoutes` ลิงก์เดิมเช่น `#/dashboard` และ `#/request/1001` จึงยังใช้ได้ รวมถึงเปิดลิงก์โดยตรง รีโหลด และย้อนกลับ/ไปข้างหน้าของเบราว์เซอร์

เส้นทางถูกเลือกตามบทบาทของบัญชีที่ยืนยันแล้ว เช่น Employee ใช้ `/new` ส่วน HR ใช้ `/admin` และ `/settings` การจำกัดหน้าจอเป็นเพียงส่วนแสดงผล Go API และ repository ยังตรวจ session และสิทธิ์ทุกครั้งที่อ่านหรือทำรายการ

## หน้าสรุปการลาและรายงาน

ใน `RequestDetail.jsx` เมื่อผู้จัดการกด “ส่งต่อให้ HR” แล้ว HR ที่ได้รับมอบหมายมีปุ่ม “อนุมัติ” และ “ไม่อนุมัติ” เป็นผู้ตัดสินจนจบ ไม่มีปุ่มส่งความเห็นกลับ ผู้จัดการดูผลได้แต่ตัดสินหรือส่งต่อซ้ำไม่ได้ ใช้ `latestHRReferral()`/`pendingHRReferral()` และ `canDecideRequest()` ตรวจ assignment ล่าสุดจากข้อมูลจริง คำสั่ง `consult` เดิมถูกปิดด้วย 403 แม้เรียก API ตรง ปุ่มยืนยันส่ง `approve`/`reject` โดย reject ต้องมีเหตุผล และ backend ตรวจ version/โควตา/เอกสารซ้ำใน transaction เมนู HR ใช้ชื่อ “คำขอส่งต่อ” ที่ `#/requests` แยกจาก `#/approvals` ซึ่งรับคำขอส่วนตัวของผู้จัดการ

Employee ไม่มีเมนู/ผลค้นหาหรือ route `#/leave-summary` ส่วน Manager/HR เปิดหน้านี้ได้ตามรูปแบบของบทบาทเดิม แถบซ้ายและ drawer กรองเมนูแจ้งเตือนออกทุกบทบาท แต่ `#/notifications` กระดิ่ง/ป๊อปอัป/ลิงก์ดูรายการทั้งหมด และค้นหาด่วนยังใช้งานได้

เมนู “แดชบอร์ด” ของ HR ที่ `#/leave-summary` จัดแบบ Dashboard ผ่าน `ManagementAnalytics.jsx` และ `HrAnalyticsCharts.jsx` โดย `routes.jsx` เลือกทั้งชุดนี้แทน `LeaveSummaryPage` เฉพาะ HR รวมกราฟรายเดือน/ประเภท/แผนกกับอันดับจำนวนคำขออนุมัติรายคน กดอันดับเพื่อกรองคำขอและเปิดรายละเอียดต่อได้ ตารางสิทธิ์รายปีพับไว้ก่อน CSS เฉพาะหน้าอยู่ใน `hr-dashboard.css` ซึ่งนำเข้าผ่าน `styles.css` หน้าหลัก HR กลับมาใช้ Dashboard เดิมและไม่แสดง Analytics ซ้ำ ส่วน Manager/Employee คง layout เดิม ข้อมูลทั้งหมดมาจาก snapshot ตามสิทธิ์ ไม่มี schema/endpoint ใหม่ ดูสูตรและขอบเขตใน `MANAGEMENT_ANALYTICS.md`

การ์ด KPI ใน Dashboard กดเปิด `ManagementKpiDialog.jsx` เพื่อดูรายการที่มาของยอดและเปิดคำขอเดิมต่อได้ ใช้ Dialog/portal และ `onAnalyticsDialogChange` ใน PageProps เพื่อทำพื้นหลัง inert พักป๊อปอัปแจ้งเตือน/ค้นหาด่วน คงตัวกรอง URL และ scroll เมื่อปิด พร้อมคืนโฟกัสไปการ์ด รายละเอียดตรวจ actor/active/scope จากข้อมูลล่าสุด ไม่เพิ่ม endpoint/schema หรือเขียนยอดคำนวณกลับฐาน

หน้า “แดชบอร์ด” HR ใช้ `src/ManagementAnalytics.jsx` อ่านผ่าน `src/domain/managementAnalytics.js` ซึ่งตรวจ actor/active/scope ซ้ำ เลือกเดือน/ปี/ฝ่าย/ประเภท ดู KPI/กราฟ/สิทธิ์รายปีและ CSV ผ่าน `managementExport.js` ส่วนหน้าหลัก Manager ไม่แสดงชุด Analytics ซ้ำแล้ว ให้เปิด “สรุปการลา” จากเมนูเพื่อดูกราฟและส่งรายงาน HR ตามเดิม ไม่เพิ่ม endpoint หรือแก้รายงาน snapshot เดิม Employee ไม่เห็นส่วนนี้ ดู [MANAGEMENT_ANALYTICS.md](MANAGEMENT_ANALYTICS.md)

หน้า `#/work` ใช้ `WorkPage.jsx` แสดงเฉพาะบัญชีตนเองทั้ง Employee/Manager/HR ในตารางและรายการมือถือ ทุกบทบาทเลือกวันที่และอัปเดตสถานะของตนเองได้ตามกฎเดิม การดูสถานะเพื่อนร่วมงานยังอยู่ที่ `#/colleagues` การเปลี่ยนนี้จำกัดเฉพาะการแสดงผล ไม่เปลี่ยน API หรือ scope ของ snapshot

Employee/Manager มีเมนูยื่นคำขอลา ทุกบทบาทดูโควตาส่วนตัวได้ Manager/HR ดูประวัติตนเองที่ `#/my-requests`; `#/requests` คงเป็นรายการทีม/ปรึกษา HR และ `#/approvals` เป็นงานอนุมัติคำขอผู้จัดการของ HR ตามไฟล์ `(1)` ไม่เปิดเมนู/URL ยื่นหรือแก้ไขคำขอ HR เพราะไม่มีผู้อนุมัติระดับสูงกว่า และห้ามส่ง HR ลงผู้จัดการแผนก ประวัติเดิมยังอ่านและถอน Pending ได้ ปุ่มอนุมัติตรวจ Decision และห้ามอนุมัติตนเอง การแจ้งเตือนใช้กระดิ่งและหน้ารวมตามเดิม โดยไม่แสดงเมนูในแถบซ้าย/drawer ทุกบทบาท

หน้า **สรุปการลา** ของ Manager ที่ `#/leave-summary` ใช้ `src/pages/LeaveSummaryPage.jsx` และ `src/domain/leaveSummary.js` อ่าน snapshot ที่กรองสิทธิ์แล้ว พร้อมตรวจ actor จากข้อมูลอีกครั้ง กรองปี พ.ศ./เดือน/ประเภท และเลือกตนเองหรือ Employee ในทีมได้ ไม่แสดงการลาของ HR กราฟรายเดือน สถานะ ประเภทลา และกราฟรายวันเมื่อเลือกรายคน+เดือน อ้างอิงวันลาที่บันทึกไว้ ไม่คำนวณย้อนหลังจากปฏิทินปัจจุบัน ส่วน HR ใช้หน้าแดชบอร์ดตามรายละเอียดข้างต้น และ Employee ไม่มีเส้นทางนี้

ปุ่มส่งรายงานใช้ `run({type:'sendLeaveReport',...})` มีสถานะกำลังส่ง ป้องกันกดซ้ำ และลองใหม่ได้เมื่อผิดพลาด ล็อกตัวกรองระหว่างส่ง Go/JavaScript domain สร้างข้อความรายงานจากข้อมูลล่าสุดใน transaction ผ่าน notifications เดิม กระดิ่งและปุ่ม “เปิดอ่านรายงาน” ใน `NotificationsPage.jsx` เปิด `#/leave-report/:id` ผ่าน `LeaveReportDashboardPage.jsx` เป็น Dashboard อ่านอย่างเดียว ตัวอ่าน `src/domain/reportDashboard.js` ใช้ยอด/เดือน/ประเภท/รายละเอียดจากข้อความที่บันทึก ณ เวลาส่ง ไม่คำนวณจากคำขอปัจจุบัน ถ้ารูปแบบไม่สมบูรณ์ให้เปิดอ่านข้อความเดิมแทนการเดายอด ตรวจตัวตนจริง เจ้าของ notification และสิทธิ์ปัจจุบันแม้เปิด URL ตรง กราฟรายเดือนใช้ `src/LeaveMonthChart.jsx` ร่วมกับหน้าสรุป ไม่ทำเครื่องหมายอ่านเมื่อเปิด และแสดงข้อความผ่าน React โดยไม่ใช้ HTML จากรายงาน

กราฟจำนวนคำขออนุมัติรายพนักงานใช้ `reportEmployeeFrequency()` ในตัวอ่านรายงาน รวมบรรทัดคำขอจากข้อความ ณ เวลาส่งด้วยรหัส EMP (ชื่อซ้ำแยกคน) เฉพาะสถานะ Approved นับจำนวนคำขอเป็นความถี่และแสดงจำนวนวันของช่วงรายงานประกอบ เรียงมากไปน้อย สูงสุดเท่ากันแสดงทุกคน หากรายงานกำกวม/ยอดไม่ตรง ไม่แสดงอันดับที่คาดเดาและยังอ่านรายละเอียดคำขอเดิมได้

## เมื่อกดยื่นคำขอลา

1. `LeaveForm.jsx` รับค่าจาก input ลง state ด้วย event ของ React
2. แปลงวันที่ พ.ศ. เป็น ISO ค.ศ. ผ่าน `src/domain/date.js` และตรวจเบื้องต้นด้วย domain ก่อนแสดงหน้าตรวจสอบ
3. เมื่อยืนยัน ฟอร์มเรียก `repo.execute({ type: 'submit', input })`
4. `apiRepository.js` ส่ง JSON ไป `POST /api/commands` พร้อม cookie ของ session
5. Go ตรวจข้อมูลล่าสุดและสิทธิ์ แล้วบันทึกผ่าน repository ใน transaction เดียว
6. React โหลด snapshot ใหม่และแสดงผลสำเร็จ หรือแสดงข้อผิดพลาดให้แก้ไข

ไฟล์แนบยังจำกัด 25 MiB และส่งเป็น parts ตาม API เดิม การตรวจฝั่งหน้าเว็บไม่แทนการตรวจฝั่ง Go โดยเฉพาะเพศของเจ้าของคำขอลาคลอด วันลาซ้อนและโควตา

## Tailwind กับ CSS เดิม

`src/tailwind.css` โหลด theme และ utilities ของ Tailwind ผ่าน Vite โดยไม่โหลด Preflight เพื่อรักษา reset, input และฟอนต์เดิม ใช้ utilities กับ layout เช่น:

```jsx
<div className="topbar-actions flex items-center gap-[8px]">
  {/* ปุ่มบนแถบด้านบน */}
</div>
```

`src/styles.css` ยังคุม tokens สีทั้งสองธีม ขนาดปุ่ม animation และ responsive rules ขององค์ประกอบเดิม กฎ layout ที่ย้ายไป Tailwind แล้วถูกนำออกจาก CSS เพื่อลดการกำหนดค่าซ้ำ ไม่จำเป็นต้องย้าย CSS ของทุกองค์ประกอบเป็น utility ในครั้งเดียว

`src/responsive.css` โหลดต่อจาก `styles.css` ใน `main.jsx` และใช้ `<main>` เป็น container ชื่อ `workspace` จึงจัดคอลัมน์ตามพื้นที่เนื้อหาที่เหลือข้างเมนูได้จริง ที่ความกว้างเนื้อหาไม่เกิน 900/620/380px จะลดคอลัมน์ของการ์ด ฟอร์มและกราฟตามลำดับ รายการคำขอ/สถานะงานเปลี่ยนเป็นการ์ดเมื่อพื้นที่ไม่เกิน 620px ส่วนตารางกว้างและปฏิทินเลื่อนเฉพาะในกรอบ ไม่ซ่อนข้อมูลด้วยการตัด overflow ทั้งหน้า เมนู drawer ยังคงใช้ความกว้างหน้าจอ 760px และป๊อปอัปใช้ขนาด viewport เพื่ออยู่ในจอ ทั้งหมดใช้ CSS ไม่เพิ่มตัวจับ resize หรือคำนวณสเกลด้วย JavaScript

เมื่อต้องเปลี่ยน layout ให้ดู class ขององค์ประกอบก่อน เมื่อต้องเปลี่ยนสีให้แก้ tokens ใน `styles.css` และตรวจทั้งสองธีม อย่าเพิ่ม Tailwind สีคงที่จนข้ามการตั้งค่าธีม

## ตรวจงานก่อนส่ง

```bash
npm run lint
npm test
npm run typecheck
npm run build
npm run format:check
npm run test:go
npm run test:parity
npm run test:go:postgres
```

- `lint` ตรวจ JavaScript/JSX รวมตัวแปรและ import ที่ไม่ได้ใช้
- `test:ui` ใช้ Jest + React Testing Library ตรวจ login, routing, สิทธิ์, การกรอกวันที่/ไฟล์แนบ, กล่องแจ้งเตือนและสถานะเพื่อนร่วมงาน โดยไม่ใช้ฐานจริง
- `test:unit` รันไฟล์ `tests/*.test.js` ด้วย Node และโหลด JSX ผ่าน Babel React preset ใน `scripts/register-jsx.mjs`; ไฟล์ JavaScript ปกติใช้ native Node ส่วน `npm test` รันทั้งชุดนี้และ Jest
- `typecheck` ใช้ `tsc -p jsconfig.json --noEmit` ตรวจสัญญา JSDoc และไฟล์ JavaScript ที่เปิด `// @ts-check` โดยไม่มีขั้นตอนแปลง TypeScript เป็น JavaScript; ไม่ได้ตรวจชนิดภายใน JavaScript ทุกไฟล์
- `build` ตรวจ JSDoc แล้วสร้างเว็บด้วย Vite ร่วมกับการตรวจ JavaScript ผ่าน lint และ tests
- `test:parity` เทียบ Go กับ JavaScript domain จากข้อมูลทดสอบเดียวกัน และ `test:go:postgres` ใช้ PostgreSQL ทดสอบแยก ไม่อ่าน `.env` หรือทำรายการกับ Supabase จริง

GitHub Actions ใน `.github/workflows/check.yml` รัน checks เหล่านี้ร่วมกับ Go build/vet และการตรวจข้อมูลต้นทาง

ผลตรวจ 11/10/2569: `npm test` ผ่าน 189 รายการ (ชุดเดิม 174 และ Jest 15), lint/typecheck/build/format ผ่าน รวมถึง Go tests/vet/build, parity 94 กรณี, PostgreSQL integration และ data:check ตรวจ Edge headless 122 สถานะสามบทบาท สองธีม จอ 390/1440px ไม่พบ page error หรือหน้าล้นแนวนอน ขนาดภาพเท่าเดิมทุกภาพ 113 ภาพตรงทุกพิกเซล อีก 9 ภาพต่างเฉพาะจุดเล็กน้อยไม่เกิน 0.033% ของพิกเซลและค่าสีต่างสูงสุด 4/255

ทดสอบเปิดลิงก์ตรง รีโหลด ย้อนกลับ/ไปข้างหน้า เมนูมือถือ และขั้นตอนยื่นลาพร้อม PDF–แก้ไข–ผู้จัดการอนุมัติ–ดาวน์โหลดไฟล์เดิม–HR ตรวจสถานะผ่าน Go API สำเร็จ ใช้ฐานทดลองแยก ไม่ทำรายการกับ Supabase จริง และยังไม่ได้ deploy ชุดนี้บน Vercel

เอกสารเครื่องมือ: [React Router](https://reactrouter.com/start/declarative/installation), [Tailwind + Vite](https://tailwindcss.com/docs/installation/using-vite), [Jest](https://jestjs.io/docs/getting-started), [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
