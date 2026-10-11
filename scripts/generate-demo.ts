/** Generate the ten-person source fixture without resetting existing runtime databases. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSeed } from '../src/domain/seed';
import { applyCommand, balance, totalDays, validateAttachment } from '../src/domain/service';
import type { AttachmentInput, Database, RequestInput } from '../src/domain/types';

const now = new Date('2026-10-10T05:00:00Z');
const db: Database = createSeed(now);
db.employees.find((person) => person.id === 6)!.managerId = 7;
db.employees.push(
  {
    id: 7,
    name: 'ปกรณ์ รุ่งเรือง',
    gender: 'Male',
    email: 'sales-manager@demo.local',
    phone: '0810000007',
    position: 'ผู้จัดการฝ่ายขาย',
    role: 'Manager',
    managerId: null,
    department: 'ฝ่ายขาย',
    active: true,
  },
  {
    id: 8,
    name: 'ชุติมา แสงทอง',
    gender: 'Female',
    email: 'chutima@demo.local',
    phone: '0810000008',
    position: 'เจ้าหน้าที่ประสานงานขาย',
    role: 'Employee',
    managerId: 7,
    department: 'ฝ่ายขาย',
    active: true,
  },
  {
    id: 9,
    name: 'มาลินี สุขสวัสดิ์',
    gender: 'Female',
    email: 'malinee@demo.local',
    phone: '0810000009',
    position: 'เจ้าหน้าที่ดูแลลูกค้า',
    role: 'Employee',
    managerId: 7,
    department: 'ฝ่ายขาย',
    active: true,
  },
  {
    id: 10,
    name: 'วีรภัทร ตั้งใจ',
    gender: 'Male',
    email: 'weeraphat@demo.local',
    phone: '0810000010',
    position: 'เจ้าหน้าที่ทดสอบระบบ',
    role: 'Employee',
    managerId: 4,
    department: 'ฝ่ายไอที',
    active: true,
  },
);
db.entitlements = [];
for (const person of db.employees) {
  for (const type of db.leaveTypes.filter((type) => type.quotaScope === 'Annual')) {
    for (const year of [2026, 2027]) {
      db.entitlements.push({
        id: db.entitlements.length + 1,
        employeeId: person.id,
        leaveTypeId: type.id,
        year,
        grantedDays: type.defaultQuotaDays,
      });
    }
  }
}
db.requests = [];
db.days = [];
db.documents = [];
db.approvals = [];
db.workStatuses = [];
db.notifications = [];
db.holidays = [];

// A tiny PNG fixture only; not a medical certificate or a real employee document.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const attachment: AttachmentInput = {
  fileName: 'DEMO_PLACEHOLDER_NOT_A_MEDICAL_CERTIFICATE.png',
  fileType: 'image/png',
  fileSize: png.length,
  dataUrl: `data:image/png;base64,${png.toString('base64')}`,
};
validateAttachment(attachment);

for (const date of ['2026-11-06', '2026-12-31', '2027-01-01']) {
  applyCommand(
    db,
    5,
    { type: 'holiday', date, name: 'วันหยุดบริษัท (ข้อมูลสมมติสำหรับทดสอบ)' },
    now,
  );
}
const secondCase = applyCommand(
  db,
  5,
  { type: 'maternity', employeeId: 9, maximumDays: 120 },
  now,
).id!;

function submit(
  employeeId: number,
  leaveTypeId: number,
  startDate: string,
  endDate: string,
  reason: string,
  extra: Partial<RequestInput> = {},
): number {
  return applyCommand(
    db,
    employeeId,
    {
      type: 'submit',
      input: {
        leaveTypeId,
        startDate,
        endDate,
        reason,
        duration: 'Full',
        maternityCaseId: null,
        ...extra,
      },
    },
    now,
  ).id!;
}
function review(id: number, action: 'approve' | 'reject', comment: string) {
  const request = db.requests.find((request) => request.id === id)!;
  const managerId = db.employees.find((person) => person.id === request.employeeId)!.managerId!;
  applyCommand(db, managerId, { type: action, id, version: request.version, comment }, now);
}
function refer(id: number) {
  const request = db.requests.find((request) => request.id === id)!;
  const managerId = db.employees.find((person) => person.id === request.employeeId)!.managerId!;
  applyCommand(
    db,
    managerId,
    {
      type: 'refer',
      id,
      version: request.version,
      hrId: 5,
      comment: 'ขอความเห็น HR เรื่องนโยบายและเอกสารตัวอย่าง',
    },
    now,
  );
}
function consult(id: number) {
  applyCommand(
    db,
    5,
    {
      type: 'consult',
      id,
      version: db.requests.find((request) => request.id === id)!.version,
      comment: 'ตรวจข้อมูลตัวอย่างแล้ว ผู้จัดการเป็นผู้ตัดสินผลสุดท้าย',
    },
    now,
  );
}

submit(1, 1, '2026-10-13', '2026-10-14', 'พักผ่อนกับครอบครัว');
const waitingHR = submit(2, 2, '2026-10-19', '2026-10-21', 'พักรักษาตัว (สถานการณ์จำลอง)', {
  attachment,
});
refer(waitingHR);
review(
  submit(3, 1, '2026-10-15', '2026-10-16', 'พักผ่อนประจำปี'),
  'approve',
  'อนุมัติตามสิทธิ์ตัวอย่าง',
);
review(
  submit(6, 3, '2026-10-22', '2026-10-22', 'ติดต่อหน่วยงานราชการ'),
  'reject',
  'มีงานของทีมในวันดังกล่าว กรุณาปรับช่วงวันลา',
);
review(
  submit(8, 1, '2026-11-17', '2026-11-17', 'ลาครึ่งวันเช้า', { duration: 'AM' }),
  'approve',
  'อนุมัติครึ่งวันเช้า',
);
submit(8, 3, '2026-11-17', '2026-11-17', 'ลาครึ่งวันบ่าย', { duration: 'PM' });
review(
  submit(9, 4, '2026-12-01', '2026-12-20', 'ลาคลอดตามกรณีตัวอย่าง', {
    maternityCaseId: secondCase,
  }),
  'approve',
  'อนุมัติตามกรณีลาคลอด',
);
const withdrawn = submit(10, 1, '2026-11-23', '2026-11-24', 'วางแผนพักผ่อน');
applyCommand(db, 10, { type: 'withdraw', id: withdrawn, version: 1 }, now);
const crossYear = submit(
  1,
  1,
  '2026-12-30',
  '2027-01-04',
  'พักผ่อนข้ามปี โดยยกเว้นวันหยุดบริษัทตัวอย่าง',
);
review(crossYear, 'approve', 'แบ่งโควตาตามปีของแต่ละวัน');
const completedHR = submit(6, 2, '2026-11-09', '2026-11-11', 'พักรักษาตัวพร้อมเอกสารจำลอง', {
  attachment,
});
refer(completedHR);
consult(completedHR);
const approvedHR = submit(
  10,
  2,
  '2026-11-02',
  '2026-11-04',
  'พักรักษาตัว (ตัวอย่างครบขั้นตอน HR)',
  { attachment },
);
refer(approvedHR);
consult(approvedHR);
review(approvedHR, 'approve', 'อนุมัติหลังได้รับความเห็น HR');
submit(3, 4, '2026-11-01', '2026-11-15', 'ลาคลอดรอพิจารณา', { maternityCaseId: 1 });
const holidayRequest = submit(
  2,
  3,
  '2026-11-05',
  '2026-11-09',
  'ลากิจโดยยกเว้นวันหยุดบริษัทและวันเสาร์อาทิตย์',
);
review(holidayRequest, 'approve', 'นับเฉพาะวันทำงาน');
const edited = submit(10, 3, '2026-12-08', '2026-12-08', 'ติดต่อหน่วยงานราชการ');
applyCommand(
  db,
  10,
  {
    type: 'edit',
    id: edited,
    version: 1,
    input: {
      leaveTypeId: 3,
      maternityCaseId: null,
      startDate: '2026-12-09',
      endDate: '2026-12-09',
      duration: 'Full',
      reason: 'ปรับวันนัดหมายแล้ว รอผู้จัดการพิจารณา',
      keepDocument: true,
    },
  },
  now,
);

for (const person of db.employees) {
  const statusType = person.id % 3 === 0 ? 'WFH' : person.id % 3 === 1 ? 'In-office' : 'Outside';
  applyCommand(db, person.id, { type: 'work', date: '2026-10-09', statusType }, now);
  applyCommand(db, person.id, { type: 'work', date: '2026-10-12', statusType }, now);
}
for (const entitlement of db.entitlements) {
  const quota = balance(db, entitlement.employeeId, entitlement.leaveTypeId, entitlement.year);
  if (quota.remaining < quota.pending) throw new Error('Sample exceeds annual quota');
}
if (
  db.employees.length !== 10 ||
  totalDays(db, crossYear) !== 2 ||
  totalDays(db, holidayRequest) !== 2
) {
  throw new Error('Unexpected sample count or day calculation');
}
const output = fileURLToPath(
  new URL('../src/data/leave-management-10-people.json', import.meta.url),
);
const content = JSON.stringify(db, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8').replaceAll('\r\n', '\n') !== content)
    throw new Error(
      'Demo source differs from generator. Run npm run data:generate to update source and exports.',
    );
} else writeFileSync(output, content, 'utf8');
console.log(
  JSON.stringify({
    employees: db.employees.length,
    roles: { Employee: 7, Manager: 2, HR: 1 },
    requests: db.requests.length,
    entitlements: db.entitlements.length,
    note: process.argv.includes('--check')
      ? 'Source verified without writing data.'
      : 'Only src/data/leave-management-10-people.json was written.',
  }),
);
