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
| `src/pages/LeaveForm.jsx` | state ของฟอร์ม ตรวจข้อมูล และตรวจสอบก่อนส่ง |
| `src/data/apiRepository.js` | `fetch`, JSON, cookie และการเรียก API |
| `src/domain/service.js` | กฎที่ฟอร์มใช้ตรวจเบื้องต้น และโหมด IndexedDB |
| `tests/ui/workspace.test.jsx` | ทดสอบหน้าจอจากการกดและกรอกของผู้ใช้ |

ไฟล์ `.jsx` คือ JavaScript ที่เขียน JSX สำหรับหน้าจอ ส่วน `.js` ใช้กับฟังก์ชันและการเชื่อมข้อมูล ไม่มี type annotation ในโค้ดที่เบราว์เซอร์รัน

`src/domain/types.d.ts`, `src/pages/types.d.ts` และ declaration ของ repository/domain เก็บคำอธิบายชนิดข้อมูลไว้ให้เครื่องมือและชุดทดสอบ TypeScript เดิม ไม่ใช่ implementation อีกชุดและไม่ถูกโหลดเข้าเบราว์เซอร์ ส่วน `server/*.ts`, ตัวสร้างข้อมูล และการทดสอบกฎเดิมยังเก็บไว้เพื่อใช้โหมด Node อ้างอิงและตรวจเทียบกับ Go

## เปลี่ยนหน้าอย่างไร

`App` ครอบ workspace ด้วย `HashRouter` และ `src/routes.jsx` กำหนดหน้าผ่าน `useRoutes` ลิงก์เดิมเช่น `#/dashboard` และ `#/request/1001` จึงยังใช้ได้ รวมถึงเปิดลิงก์โดยตรง รีโหลด และย้อนกลับ/ไปข้างหน้าของเบราว์เซอร์

เส้นทางถูกเลือกตามบทบาทของบัญชีที่ยืนยันแล้ว เช่น Employee ใช้ `/new` ส่วน HR ใช้ `/admin` และ `/settings` การจำกัดหน้าจอเป็นเพียงส่วนแสดงผล Go API และ repository ยังตรวจ session และสิทธิ์ทุกครั้งที่อ่านหรือทำรายการ

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
- `test:unit` คงชุดทดสอบวันที่ กฎการลา repository และ HTTP API เดิมไว้ `npm test` รันทั้งสองชุด
- `typecheck` ตรวจ declarations และโค้ด TypeScript ใน server/tools/tests ที่ยังใช้ ไม่ได้ตรวจ type ภายใน JavaScript ทุกบรรทัด
- `build` ตรวจส่วน TypeScript แล้วสร้างเว็บด้วย Vite ส่วน JavaScript ตรวจร่วมกับ lint และ tests
- `test:parity` เทียบ Go กับ JavaScript domain จากข้อมูลทดสอบเดียวกัน และ `test:go:postgres` ใช้ PostgreSQL ทดสอบแยก ไม่อ่าน `.env` หรือทำรายการกับ Supabase จริง

GitHub Actions ใน `.github/workflows/check.yml` รัน checks เหล่านี้ร่วมกับ Go build/vet และการตรวจข้อมูลต้นทาง

ผลตรวจ 11/10/2569: `npm test` ผ่าน 189 รายการ (ชุดเดิม 174 และ Jest 15), lint/typecheck/build/format ผ่าน รวมถึง Go tests/vet/build, parity 94 กรณี, PostgreSQL integration และ data:check ตรวจ Edge headless 122 สถานะสามบทบาท สองธีม จอ 390/1440px ไม่พบ page error หรือหน้าล้นแนวนอน ขนาดภาพเท่าเดิมทุกภาพ 113 ภาพตรงทุกพิกเซล อีก 9 ภาพต่างเฉพาะจุดเล็กน้อยไม่เกิน 0.033% ของพิกเซลและค่าสีต่างสูงสุด 4/255

ทดสอบเปิดลิงก์ตรง รีโหลด ย้อนกลับ/ไปข้างหน้า เมนูมือถือ และขั้นตอนยื่นลาพร้อม PDF–แก้ไข–ผู้จัดการอนุมัติ–ดาวน์โหลดไฟล์เดิม–HR ตรวจสถานะผ่าน Go API สำเร็จ ใช้ฐานทดลองแยก ไม่ทำรายการกับ Supabase จริง และยังไม่ได้ deploy ชุดนี้บน Vercel

เอกสารเครื่องมือ: [React Router](https://reactrouter.com/start/declarative/installation), [Tailwind + Vite](https://tailwindcss.com/docs/installation/using-vite), [Jest](https://jestjs.io/docs/getting-started), [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
