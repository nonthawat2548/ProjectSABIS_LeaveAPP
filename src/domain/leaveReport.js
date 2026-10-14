// @ts-check
import { formatDate, thaiMonths } from './date.js';
import { summarizeLeave } from './leaveSummary.js';
import { actorById, DomainError, requestCode } from './service.js';

export const REPORT_HEADING = 'รายงานสรุปการลา';
const statuses = {
  Pending: 'รอพิจารณา',
  Approved: 'อนุมัติแล้ว',
  Rejected: 'ไม่อนุมัติ',
  Withdrawn: 'ยกเลิก',
};
/** @param {number} id */
const employeeCode = (id) => `EMP-${String(id).padStart(5, '0')}`;

/** @param {string} text */
export function isLeaveReport(text) {
  return text.startsWith(REPORT_HEADING + '\nผู้ส่ง: ');
}

/**
 * Recheck current role before exposing historical reports. Notification ownership
 * is checked separately by the snapshot. Managers can read their sender copies.
 * @param {import('./types.js').Employee} actor
 * @param {import('./types.js').Notification} notification
 */
export function canReadReportNotification(actor, notification) {
  if (!isLeaveReport(notification.text)) return true;
  return (
    actor.role === 'HR' ||
    (actor.role === 'Manager' &&
      notification.text.split('\n')[1].endsWith(`(${employeeCode(actor.id)})`))
  );
}

/** Short readable copy for the bell; the full immutable report stays in text. @param {string} text */
export function notificationTitle(text) {
  return isLeaveReport(text)
    ? `${REPORT_HEADING} · ${text.split('\n')[1].slice('ผู้ส่ง: '.length)}`
    : text;
}

/**
 * Generate from current, authorized saved days inside the repository transaction.
 * Keep a human-readable snapshot in existing notifications (no extra schema or
 * client-supplied totals). Only the selected HR and sender receive this report.
 * @param {import('./types.js').Database} db
 * @param {import('./types.js').Employee} actor
 * @param {import('./types.js').SendLeaveReportCommand} command
 * @param {string} at
 * @returns {import('./types.js').CommandResult}
 */
export function sendLeaveReport(db, actor, command, at) {
  actor = actorById(db, actor.id);
  if (actor.role !== 'Manager')
    throw new DomainError('เฉพาะผู้จัดการสามารถส่งรายงานให้ HR ได้', 'FORBIDDEN');
  const hr = db.employees.find(
    (person) => person.id === command.hrId && person.role === 'HR' && person.active,
  );
  if (!hr) throw new DomainError('กรุณาเลือก HR ที่ใช้งานได้');
  const summary = summarizeLeave(db, actor, command);
  const person = db.employees.find((item) => item.id === command.employeeId);
  const type = db.leaveTypes.find((item) => item.id === command.leaveTypeId);
  if (command.leaveTypeId && !type) throw new DomainError('ไม่พบประเภทการลา');
  const period = command.month
    ? `${thaiMonths[command.month - 1]} ${command.year + 543}`
    : `ปี ${command.year + 543}`;
  const lines = [
    REPORT_HEADING,
    `ผู้ส่ง: ${actor.name} (${employeeCode(actor.id)})`,
    `ผู้รับ: ${hr.name} (${employeeCode(hr.id)})`,
    `พนักงาน: ${person ? `${person.name} (${employeeCode(person.id)})` : 'ทุกคนที่ผู้จัดการมีสิทธิ์ดู'}`,
    `ช่วงวันที่ลา: ${period}`,
    `ประเภทการลา: ${type?.name ?? 'ทุกประเภท'}`,
    `คำขอทั้งหมด: ${summary.requestCount} คำขอ`,
    `อนุมัติแล้ว: ${summary.statusCounts.Approved} คำขอ / ${summary.approvedDays} วัน`,
    `รอพิจารณา: ${summary.statusCounts.Pending} คำขอ / ${summary.pendingDays} วัน`,
    `ไม่อนุมัติ: ${summary.statusCounts.Rejected} คำขอ`,
    `ยกเลิก: ${summary.statusCounts.Withdrawn} คำขอ`,
    '',
    'รายเดือน',
    ...summary.monthly
      .filter((row) => !command.month || row.month === command.month)
      .map(
        (row) =>
          `${row.month}/${command.year + 543} | อนุมัติ ${row.approvedDays} วัน | รอพิจารณา ${row.pendingDays} วัน`,
      ),
    '',
    'แยกตามประเภทการลา',
    ...[...summary.byType]
      .sort((a, b) => a.leaveTypeId - b.leaveTypeId)
      .map(
        (row) =>
          `${row.name} | ${row.requestCount} คำขอ | อนุมัติ ${row.approvedDays} วัน | รอพิจารณา ${row.pendingDays} วัน`,
      ),
    '',
    'รายละเอียดคำขอ',
    ...summary.requests.map(({ request, periodDays }) => {
      const owner = db.employees.find((item) => item.id === request.employeeId);
      const leaveType = db.leaveTypes.find((item) => item.id === request.leaveTypeId);
      return `${requestCode(request)} | ${owner?.name ?? 'ไม่พบชื่อ'} (${employeeCode(request.employeeId)}) | ${leaveType?.name ?? 'ไม่พบประเภท'} | ${formatDate(request.startDate)}–${formatDate(request.endDate)} | ${periodDays} วันในช่วงที่เลือก | ${statuses[request.status]}`;
    }),
    '',
    'นับจากวันลาที่บันทึกไว้ ครึ่งวัน = 0.5 วัน คำขอข้ามปีนับเฉพาะช่วงที่เลือก',
    'วันลาที่อนุมัติรวมวันที่ในอนาคต ยอดในรายงานเป็นข้อมูล ณ เวลาส่ง',
  ];
  const text = lines.join('\n');
  if (text.length > 150000)
    throw new DomainError('รายงานมีรายการมากเกินไป กรุณาเลือกเดือนหรือพนักงานเพื่อแบ่งรายงาน');
  let id = Math.max(0, ...db.notifications.map((row) => row.id)) + 1;
  const reportId = id;
  for (const employeeId of [hr.id, actor.id]) {
    db.notifications.push({
      id: id++,
      employeeId,
      leaveId: null,
      text,
      createdAt: at,
      read: false,
    });
  }
  return { id: reportId, message: 'ส่งรายงานให้ HR แล้ว และเก็บสำเนาในรายการแจ้งเตือนของคุณ' };
}
