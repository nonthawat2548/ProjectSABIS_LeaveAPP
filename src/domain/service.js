/**
 * @typedef {import('./types.js').AttachmentInput} AttachmentInput
 * @typedef {import('./types.js').Balance} Balance
 * @typedef {import('./types.js').Command} Command
 * @typedef {import('./types.js').CommandResult} CommandResult
 * @typedef {import('./types.js').Database} Database
 * @typedef {import('./types.js').Employee} Employee
 * @typedef {import('./types.js').LeaveDay} LeaveDay
 * @typedef {import('./types.js').LeaveRequest} LeaveRequest
 * @typedef {import('./types.js').RequestInput} RequestInput
 */
import { datesBetween, dayDifference, isoDate, today, workingDates } from './date.js';
import { canReadReportNotification, sendLeaveReport } from './leaveReport.js';
import {
  isDecisionReviewer,
  latestHRReferral,
  HR_PERSONAL_LEAVE_UNAVAILABLE,
  pendingHRReferral,
  requestReviewer,
} from './approvalRouting.js';
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BASE64_LENGTH,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
  MAX_COMMAND_BODY_BYTES,
} from './attachments.js';
export class DomainError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code = 'VALIDATION') {
    super(message);
    this.code = code;
    this.name = 'DomainError';
  }
}
const fail = (text, code = 'VALIDATION') => {
  throw new DomainError(text, code);
};
const nextId = (rows) => Math.max(0, ...rows.map((r) => r.id)) + 1;
/**
 * @type {(r: LeaveRequest) => string}
 */
export const requestCode = (r) =>
  `LR-${r.requestDate.slice(0, 4)}-${String(r.id).padStart(5, '0')}`;
/**
 * @type {(db: Database, id: number) => number}
 */
export const totalDays = (db, id) =>
  db.days.filter((d) => d.leaveId === id).reduce((a, d) => a + d.units, 0);
/**
 * @param {Database} db
 * @param {number} id
 * @returns {Employee}
 */
export function actorById(db, id) {
  return (
    db.employees.find((e) => e.id === id && e.active) ??
    fail('กรุณาเข้าสู่ระบบอีกครั้ง', 'UNAUTHENTICATED')
  );
}
/**
 * @param {Database} db
 * @param {Employee} actor
 * @param {LeaveRequest} r
 * @returns {boolean}
 */
export function canView(db, actor, r) {
  return (
    actor.id === r.employeeId ||
    (actor.role === 'Manager' &&
      db.employees.find((e) => e.id === r.employeeId)?.role === 'Employee' &&
      db.employees.find((e) => e.id === r.employeeId)?.managerId === actor.id) ||
    actor.role === 'HR'
  );
}
/**
 * @param {Database} db
 * @param {number} actorId
 * @returns {Database}
 */
export function visibleSnapshot(db, actorId) {
  const actor = actorById(db, actorId);
  const allowed = new Set(db.requests.filter((r) => canView(db, actor, r)).map((r) => r.id));
  const people = new Set(
    db.employees
      .filter(
        (e) =>
          actor.role === 'HR' ||
          e.id === actor.id ||
          (actor.role === 'Manager' && e.managerId === actor.id) ||
          e.id === actor.managerId ||
          e.role === 'HR',
      )
      .map((e) => e.id),
  );
  const scopedPeople = new Set(
    db.employees
      .filter(
        (e) =>
          actor.role === 'HR' ||
          e.id === actor.id ||
          (actor.role === 'Manager' && e.role !== 'HR' && e.managerId === actor.id),
      )
      .map((e) => e.id),
  );
  return structuredClone({
    ...db,
    employees: db.employees.filter((e) => people.has(e.id)),
    entitlements: db.entitlements.filter((e) => scopedPeople.has(e.employeeId)),
    maternityCases: db.maternityCases.filter((c) => scopedPeople.has(c.employeeId)),
    requests: db.requests.filter((r) => allowed.has(r.id)),
    days: db.days.filter((d) => allowed.has(d.leaveId)),
    documents: db.documents.filter((d) => allowed.has(d.leaveId)),
    approvals: db.approvals.filter((a) => allowed.has(a.leaveId)),
    workStatuses: db.workStatuses.filter((w) => scopedPeople.has(w.employeeId)),
    notifications: db.notifications.filter(
      (n) => n.employeeId === actor.id && canReadReportNotification(actor, n),
    ),
  });
}
/**
 * @param {Database} db
 * @param {number} employeeId
 * @param {number} typeId
 * @param {number} year
 * @param {number | null} [caseId]
 * @param {number} [excludeId]
 * @returns {Balance}
 */
export function balance(db, employeeId, typeId, year, caseId = null, excludeId) {
  const type = db.leaveTypes.find((t) => t.id === typeId);
  if (!type) return { total: 0, used: 0, remaining: 0, pending: 0 };
  const related = db.requests.filter(
    (r) =>
      r.id !== excludeId &&
      r.employeeId === employeeId &&
      r.leaveTypeId === typeId &&
      (type.quotaScope === 'Annual' || r.maternityCaseId === caseId),
  );
  const map = new Map(related.map((r) => [r.id, r.status]));
  let used = 0,
    pending = 0;
  for (const d of db.days) {
    const status = map.get(d.leaveId);
    if (type.quotaScope === 'Annual' && Number(d.date.slice(0, 4)) !== year) continue;
    if (status === 'Approved') used += d.units;
    if (status === 'Pending') pending += d.units;
  }
  const total =
    type.quotaScope === 'Annual'
      ? (db.entitlements.find(
          (e) => e.employeeId === employeeId && e.leaveTypeId === typeId && e.year === year,
        )?.grantedDays ?? 0)
      : (db.maternityCases.find((c) => c.id === caseId && c.employeeId === employeeId)
          ?.maximumDays ?? 0);
  return { total, used, remaining: total - used, pending };
}
/**
 * @param {Database} db
 * @param {number} employeeId
 * @param {string} date
 * @returns {string}
 */
export function effectiveWorkStatus(db, employeeId, date) {
  const approved = new Set(
    db.requests
      .filter((r) => r.employeeId === employeeId && r.status === 'Approved')
      .map((r) => r.id),
  );
  const units = db.days
    .filter((d) => approved.has(d.leaveId) && d.date === date)
    .reduce((a, d) => a + d.units, 0);
  const base =
    db.workStatuses.find((w) => w.employeeId === employeeId && w.date === date)?.statusType ??
    'In-office';
  return units >= 1 ? 'Leave' : units > 0 ? `${base} / Leave (ครึ่งวัน)` : base;
}
/**
 * @param {AttachmentInput} a
 * @returns {void}
 */
export function validateAttachment(a) {
  const sizeMessage = `เอกสารต้องเป็น PDF, JPG หรือ PNG ขนาดไม่เกิน ${MAX_ATTACHMENT_LABEL}`;
  if (
    !a ||
    !ALLOWED_ATTACHMENT_TYPES.some((type) => type === a.fileType) ||
    typeof a.fileName !== 'string' ||
    !a.fileName.trim() ||
    a.fileName.length > 255 ||
    !Number.isInteger(a.fileSize) ||
    a.fileSize <= 0 ||
    a.fileSize > MAX_ATTACHMENT_BYTES ||
    typeof a.dataUrl !== 'string'
  )
    fail(sizeMessage);
  const prefix = `data:${a.fileType};base64,`;
  if (!a.dataUrl.startsWith(prefix)) fail(sizeMessage);
  // Bound the encoded data even when a direct API caller falsifies fileSize.
  if (a.dataUrl.length - prefix.length > MAX_COMMAND_BODY_BYTES) fail(sizeMessage);
  // Preserve atob's support for ASCII whitespace and unpadded base64.
  const encoded = a.dataUrl.slice(prefix.length).replace(/[ \t\r\n\f]/g, '');
  if (encoded.length > MAX_ATTACHMENT_BASE64_LENGTH) fail(sizeMessage);
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  if (
    (padding > 0 && encoded.length % 4 !== 0) ||
    (padding === 0 && encoded.length % 4 === 1) ||
    /[^A-Za-z0-9+/]/.test(encoded.slice(0, encoded.length - padding))
  )
    fail('ข้อมูลเอกสารไม่ถูกต้อง');
  const decodedSize = Math.floor((encoded.length * 3) / 4) - padding;
  if (decodedSize > MAX_ATTACHMENT_BYTES) fail(sizeMessage);
  if (decodedSize !== a.fileSize) fail('ขนาดเอกสารไม่ตรงกับข้อมูล');
  // Validate the signature without materializing a second large binary string.
  try {
    const header = atob(encoded.slice(0, 12));
    const valid =
      a.fileType === 'application/pdf'
        ? header.startsWith('%PDF-')
        : a.fileType === 'image/png'
          ? header.startsWith('\x89PNG\r\n\x1a\n')
          : header.startsWith('\xff\xd8\xff');
    if (!valid) fail('เนื้อหาเอกสารไม่ตรงกับชนิดไฟล์');
  } catch (e) {
    if (e instanceof DomainError) throw e;
    fail('ข้อมูลเอกสารไม่ถูกต้อง');
  }
}
/**
 * Uses the stored owner's gender, never a field supplied with a leave command.
 *
 * @param {Pick<Employee, 'gender'>} employee
 * @returns {string | null}
 */
export function maternityGenderIssue(employee) {
  if (employee.gender === 'Female') return null;
  if (employee.gender === 'Male') return 'พนักงานชายไม่มีสิทธิ์ยื่นลาคลอดตามนโยบายของโปรเจกต์';
  return 'กรุณาติดต่อ HR เพื่อตรวจสอบข้อมูลเพศก่อนดำเนินการลาคลอด';
}
function requireMaternityCase(db, owner, caseId) {
  const issue = maternityGenderIssue(owner);
  if (issue) fail(issue);
  if (caseId == null) {
    if (!db.maternityCases.some((c) => c.employeeId === owner.id))
      fail('ยังไม่มีกรณีลาคลอด กรุณาติดต่อ HR เพื่อเปิดกรณีก่อนยื่นคำขอ');
    fail('กรุณาเลือกกรณีลาคลอดที่ HR เปิดให้คุณ');
  }
  const maternity =
    db.maternityCases.find((c) => c.id === caseId) ??
    fail('ไม่พบกรณีลาคลอดที่เลือก กรุณาติดต่อ HR เพื่อตรวจสอบ');
  if (maternity.employeeId !== owner.id)
    fail('กรณีลาคลอดนี้ไม่ใช่ของเจ้าของคำขอ กรุณาเลือกกรณีของตนเอง');
  if (
    !Number.isInteger(maternity.maximumDays) ||
    maternity.maximumDays < 1 ||
    maternity.maximumDays > 120
  )
    fail('ข้อมูลสิทธิ์ของกรณีลาคลอดไม่ถูกต้อง กรุณาติดต่อ HR');
  return maternity;
}
function inputDays(db, actor, input) {
  const type = db.leaveTypes.find((t) => t.id === input.leaveTypeId) ?? fail('ไม่พบประเภทการลา');
  if (
    typeof input.startDate !== 'string' ||
    typeof input.endDate !== 'string' ||
    !isoDate(input.startDate) ||
    !isoDate(input.endDate) ||
    input.endDate < input.startDate ||
    dayDifference(input.startDate, input.endDate) > 365
  )
    fail('วันที่ไม่ถูกต้อง หรือช่วงวันลาเกิน 366 วัน');
  if (!['Full', 'AM', 'PM'].includes(input.duration)) fail('ช่วงเวลาไม่ถูกต้อง');
  if (type.quotaScope === 'Pregnancy' && input.duration !== 'Full') fail('ลาคลอดใช้การลาเต็มวัน');
  if (input.duration !== 'Full' && input.startDate !== input.endDate)
    fail('การลาครึ่งวันต้องเป็นวันเดียวกัน');
  if (
    type.quotaScope !== 'Pregnancy' &&
    type.eligibleGender &&
    type.eligibleGender !== actor.gender
  )
    fail('คุณไม่มีสิทธิ์ใช้ประเภทการลานี้ตามนโยบายตัวอย่าง');
  const dates =
    type.quotaScope !== 'Pregnancy' && type.dayCountBasis === 'Working Days'
      ? workingDates(
          input.startDate,
          input.endDate,
          db.holidays.map((h) => h.date),
        )
      : datesBetween(input.startDate, input.endDate);
  if (!dates.length) fail('ช่วงวันที่เลือกไม่มีวันที่นับเป็นวันลา');
  return dates.map((date) => ({
    date,
    units: input.duration === 'Full' ? 1 : 0.5,
    entitlementId:
      type.quotaScope === 'Annual'
        ? (db.entitlements.find(
            (e) =>
              e.employeeId === actor.id &&
              e.leaveTypeId === type.id &&
              e.year === Number(date.slice(0, 4)),
          )?.id ?? null)
        : null,
  }));
}
/**
 * @param {Database} db
 * @param {Employee} actor
 * @param {RequestInput} input
 * @param {number} [excludeId]
 * @param {Date} [now]
 * @returns {{ days: Omit<LeaveDay, 'id' | 'leaveId'>[]; total: number; }}
 */
export function previewRequest(db, actor, input, excludeId, now = new Date()) {
  return checkRequest(db, actor, input, excludeId, now);
}
function checkRequest(db, actor, input, excludeId, now, quotaCode = 'VALIDATION') {
  actor = actorById(db, actor.id);
  if (actor.role === 'HR') fail(HR_PERSONAL_LEAVE_UNAVAILABLE, 'FORBIDDEN');
  if (!['Employee', 'Manager'].includes(actor.role)) fail('ไม่มีสิทธิ์ยื่นคำขอ', 'FORBIDDEN');
  if (excludeId !== undefined) {
    const previous = db.requests.find((r) => r.id === excludeId) ?? fail('ไม่พบคำขอ', 'NOT_FOUND');
    if (previous.employeeId !== actor.id) fail('คุณแก้ไขคำขอผู้อื่นไม่ได้', 'FORBIDDEN');
    if (previous.status !== 'Pending') fail('คำขอนี้ไม่ได้อยู่ในสถานะรอพิจารณา', 'CONFLICT');
  }
  if (!input || typeof input !== 'object') fail('ข้อมูลคำขอไม่ถูกต้อง');
  const type = db.leaveTypes.find((t) => t.id === input.leaveTypeId) ?? fail('ไม่พบประเภทการลา');
  // Maternity eligibility order: gender -> case -> manager -> dates/full day -> policy -> overlap -> quota.
  if (type.quotaScope === 'Pregnancy') requireMaternityCase(db, actor, input.maternityCaseId);
  if (!requestReviewer(db, actor)) {
    if (actor.role !== 'Manager' && !actor.managerId)
      fail('บัญชีนี้ยังไม่มีผู้จัดการ กรุณาให้ HR กำหนดผู้จัดการก่อน');
    fail(
      actor.role === 'Manager'
        ? 'ไม่พบ HR ผู้พิจารณาที่พร้อมใช้งาน'
        : 'ผู้จัดการผู้พิจารณาไม่พร้อมใช้งาน กรุณาติดต่อ HR',
    );
  }
  const requireReason = () => {
    if (
      typeof input.reason !== 'string' ||
      !input.reason.trim() ||
      input.reason.trim().length > 500
    )
      fail('กรุณาระบุเหตุผล 1–500 ตัวอักษร');
  };
  if (type.quotaScope !== 'Pregnancy') requireReason();
  const days = inputDays(db, actor, input);
  const total = days.reduce((a, d) => a + d.units, 0);
  if (type.quotaScope === 'Pregnancy') requireReason();
  if (
    type.advanceNoticeDays > 0 &&
    dayDifference(today(now), input.startDate) < type.advanceNoticeDays
  )
    fail(`กรุณายื่นขอล่วงหน้าอย่างน้อย ${type.advanceNoticeDays} วัน`);
  if (type.advanceNoticeDays === 0 && dayDifference(input.startDate, today(now)) > 30)
    fail('ตัวอย่างนี้อนุญาตให้ยื่นลาป่วยย้อนหลังได้ไม่เกิน 30 วัน');
  if (input.attachment) validateAttachment(input.attachment);
  const hasExisting =
    !!excludeId &&
    input.keepDocument !== false &&
    db.documents.some((d) => d.leaveId === excludeId);
  if (
    type.documentRequiredFromDays !== null &&
    total >= type.documentRequiredFromDays &&
    !input.attachment &&
    !hasExisting
  )
    fail(
      `ลาประเภทนี้ตั้งแต่ ${type.documentRequiredFromDays} วัน ต้องแนบ${type.requiredDocumentType === 'Medical Certificate' ? 'ใบรับรองแพทย์' : 'เอกสารประกอบ'}`,
    );
  const other = db.requests.filter(
    (r) =>
      r.employeeId === actor.id && r.id !== excludeId && ['Pending', 'Approved'].includes(r.status),
  );
  for (const r of other) {
    if (input.startDate <= r.endDate && input.endDate >= r.startDate)
      fail(`ไม่สามารถยื่นคำขอลาซ้ำกับช่วงวันที่คุณมีคำขอลาอยู่แล้วได้ (${requestCode(r)})`);
  }
  if (type.quotaScope === 'Annual') {
    for (const year of new Set(days.map((d) => Number(d.date.slice(0, 4))))) {
      const b = balance(db, actor.id, type.id, year, null, excludeId);
      const needed = days
        .filter((d) => Number(d.date.slice(0, 4)) === year)
        .reduce((a, d) => a + d.units, 0);
      if (needed > b.remaining - b.pending)
        fail(
          `จำนวนวันลาเกินสิทธิ์คงเหลือที่กำหนด: สิทธิ์ปี ${year + 543} ไม่พอ (ใช้ได้ ${Math.max(0, b.remaining - b.pending)} วันหลังหักที่รอพิจารณา)`,
          quotaCode,
        );
    }
  } else {
    const b = balance(db, actor.id, type.id, 0, input.maternityCaseId, excludeId);
    if (total > b.remaining - b.pending) fail('โควตาของกรณีลาคลอดนี้ไม่เพียงพอ', quotaCode);
  }
  return { days, total };
}
function notify(db, employeeId, leaveId, text, at) {
  db.notifications.push({
    id: nextId(db.notifications),
    employeeId,
    leaveId,
    text,
    createdAt: at,
    read: false,
  });
}
function approval(db, r, at) {
  const e = actorById(db, r.employeeId);
  const reviewer = requestReviewer(db, e) ?? fail('ไม่พบผู้พิจารณาที่พร้อมใช้งาน');
  db.approvals.push({
    id: nextId(db.approvals),
    leaveId: r.id,
    approverId: reviewer.id,
    stepNo: db.approvals.filter((a) => a.leaveId === r.id).length + 1,
    reviewRole: reviewer.role,
    reviewType: 'Decision',
    status: 'Pending',
    comment: '',
    assignedAt: at,
    reviewedAt: null,
  });
}
function document(db, id, input, at) {
  if (input.attachment || input.keepDocument === false)
    db.documents = db.documents.filter((d) => d.leaveId !== id);
  if (input.attachment) {
    const a = input.attachment;
    db.documents.push({
      id: nextId(db.documents),
      leaveId: id,
      documentType:
        db.leaveTypes.find((t) => t.id === input.leaveTypeId)?.requiredDocumentType ??
        'Supporting Document',
      fileName: a.fileName,
      fileType: a.fileType,
      fileSize: a.fileSize,
      dataUrl: a.dataUrl,
      storageKey: `mock/${id}/${a.fileName}`,
      uploadedAt: at,
    });
  }
}
function pending(db, id, version) {
  const r = db.requests.find((r) => r.id === id) ?? fail('ไม่พบคำขอ', 'NOT_FOUND');
  if (r.status !== 'Pending') fail('คำขอนี้ไม่ได้อยู่ในสถานะรอพิจารณา', 'CONFLICT');
  if (r.version !== version) fail('ข้อมูลถูกเปลี่ยนแล้ว กรุณารีเฟรชก่อนทำรายการ', 'CONFLICT');
  return r;
}
function requireOriginalReviewer(db, actor, r) {
  if (!isDecisionReviewer(db, actor, r) || latestHRReferral(db, r))
    fail('คุณไม่มีสิทธิ์พิจารณาคำขอนี้', 'FORBIDDEN');
}
function requireComment(comment) {
  if (typeof comment !== 'string' || !comment.trim() || comment.trim().length > 500)
    fail('กรุณาระบุข้อความ 1–500 ตัวอักษร');
  return comment.trim();
}
/**
 * All mutations must run in one repository transaction; quota is derived from approved Leave_Day rows.
 *
 * @param {Database} db
 * @param {number} actorId
 * @param {Command} c
 * @param {Date} [now]
 * @returns {CommandResult}
 */
export function applyCommand(db, actorId, c, now = new Date()) {
  const actor = actorById(db, actorId),
    at = now.toISOString();
  if (c.type === 'sendLeaveReport') return sendLeaveReport(db, actor, c, at);
  if (c.type === 'submit' || c.type === 'edit') {
    const previous = c.type === 'edit' ? pending(db, c.id, c.version) : null;
    if (previous && previous.employeeId !== actor.id)
      fail('คุณแก้ไขคำขอผู้อื่นไม่ได้', 'FORBIDDEN');
    const { days } = previewRequest(db, actor, c.input, previous?.id, now);
    const id = previous?.id ?? Math.max(1000, ...db.requests.map((r) => r.id)) + 1;
    const r = previous ?? {
      id,
      employeeId: actor.id,
      leaveTypeId: c.input.leaveTypeId,
      maternityCaseId: null,
      startDate: '',
      endDate: '',
      reason: '',
      requestDate: at,
      status: 'Pending',
      duration: 'Full',
      version: 0,
      timeline: [],
    };
    Object.assign(r, {
      leaveTypeId: c.input.leaveTypeId,
      maternityCaseId:
        db.leaveTypes.find((t) => t.id === c.input.leaveTypeId).quotaScope === 'Pregnancy'
          ? c.input.maternityCaseId
          : null,
      startDate: c.input.startDate,
      endDate: c.input.endDate,
      duration: c.input.duration,
      reason: c.input.reason.trim(),
      version: r.version + 1,
    });
    if (!previous) db.requests.push(r);
    else
      db.approvals
        .filter((a) => a.leaveId === id && !a.cancelled)
        .forEach((a) => {
          a.cancelled = true;
        });
    db.days = db.days.filter((d) => d.leaveId !== id);
    for (const d of days) db.days.push({ ...d, id: nextId(db.days), leaveId: id });
    document(db, id, c.input, at);
    approval(db, r, at);
    r.timeline.push({
      action: previous ? 'แก้ไขคำขอ / เริ่มพิจารณาใหม่' : 'ยื่นคำขอ',
      actorId: actor.id,
      at,
      comment: '',
    });
    notify(
      db,
      requestReviewer(db, actor).id,
      id,
      `${actor.name}${previous ? 'แก้ไข' : 'ส่ง'}คำขอ ${requestCode(r)}`,
      at,
    );
    notify(
      db,
      actor.id,
      id,
      previous ? 'แก้ไขคำขอแล้ว และเริ่มพิจารณาใหม่' : 'ส่งคำขอแล้ว รอผู้พิจารณา',
      at,
    );
    return { id, message: previous ? 'บันทึกการแก้ไขแล้ว' : 'ส่งคำขอเรียบร้อยแล้ว' };
  }
  if (c.type === 'withdraw') {
    const r = pending(db, c.id, c.version);
    if (r.employeeId !== actor.id) fail('คุณยกเลิกคำขอผู้อื่นไม่ได้', 'FORBIDDEN');
    r.status = 'Withdrawn';
    r.version++;
    r.timeline.push({ action: 'ยกเลิกคำขอ', actorId, at, comment: '' });
    db.approvals
      .filter((a) => a.leaveId === r.id && !a.cancelled)
      .forEach((a) => {
        a.cancelled = true;
      });
    const manager = requestReviewer(db, actor)?.id;
    if (manager) notify(db, manager, r.id, `${actor.name}ยกเลิก ${requestCode(r)}`, at);
    return { id: r.id, message: 'ยกเลิกคำขอแล้ว ไม่มีการหักโควตา' };
  }
  if (c.type === 'approve' || c.type === 'reject' || c.type === 'refer') {
    const r = pending(db, c.id, c.version);
    const delegated = c.type !== 'refer' ? pendingHRReferral(db, actor, r) : null;
    if (!delegated) requireOriginalReviewer(db, actor, r);
    const requestType =
      db.leaveTypes.find((t) => t.id === r.leaveTypeId) ?? fail('ไม่พบประเภทการลา');
    if (c.type === 'approve' && requestType.quotaScope === 'Pregnancy')
      requireMaternityCase(db, actorById(db, r.employeeId), r.maternityCaseId);
    if (c.type === 'refer') {
      if (actor.role !== 'Manager' || c.hrId === r.employeeId)
        fail('ส่งต่อได้เฉพาะ HR ที่ไม่ได้เป็นผู้ยื่นคำขอ', 'FORBIDDEN');
      const comment = requireComment(c.comment);
      if (!db.employees.some((e) => e.id === c.hrId && e.role === 'HR' && e.active))
        fail('ไม่พบเจ้าหน้าที่ HR');
      db.approvals.push({
        id: nextId(db.approvals),
        leaveId: r.id,
        approverId: c.hrId,
        stepNo: db.approvals.filter((a) => a.leaveId === r.id).length + 1,
        reviewRole: 'HR',
        reviewType: 'Consultation',
        status: 'Pending',
        comment,
        assignedAt: at,
        reviewedAt: null,
      });
      r.version++;
      r.timeline.push({ action: 'ส่งให้ HR ตัดสิน', actorId, at, comment });
      notify(db, c.hrId, r.id, `ผู้จัดการส่ง ${requestCode(r)} ให้คุณตัดสิน`, at);
      return { id: r.id, message: 'ส่งให้ HR เป็นผู้ตัดสินแล้ว' };
    }
    const comment =
      c.type === 'reject'
        ? requireComment(c.comment)
        : typeof c.comment === 'string'
          ? c.comment.trim()
          : '';
    if (comment.length > 500) fail('ความเห็นยาวเกิน 500 ตัวอักษร');
    if (c.type === 'approve') {
      const t = requestType;
      const days = db.days.filter((d) => d.leaveId === r.id);
      if (t.quotaScope === 'Pregnancy') {
        // Recheck the stored owner and policy. Notice is measured from submission, not decision time.
        const submittedAt =
          r.timeline
            .filter((e) => e.action === 'ยื่นคำขอ' || e.action === 'แก้ไขคำขอ / เริ่มพิจารณาใหม่')
            .at(-1)?.at ?? r.requestDate;
        const checked = checkRequest(
          db,
          actorById(db, r.employeeId),
          {
            leaveTypeId: r.leaveTypeId,
            maternityCaseId: r.maternityCaseId,
            startDate: r.startDate,
            endDate: r.endDate,
            duration: r.duration,
            reason: r.reason,
            keepDocument: true,
          },
          r.id,
          new Date(submittedAt),
          'CONFLICT',
        );
        if (
          days.length !== checked.days.length ||
          days.some((d) => d.units !== 1 || d.entitlementId !== null) ||
          checked.days.some((d) => !days.some((saved) => saved.date === d.date))
        )
          fail('ข้อมูลวันลาคลอดไม่สอดคล้องกัน กรุณาติดต่อ HR', 'CONFLICT');
      }
      if (!days.length) fail('คำขอไม่มีวันลา');
      if (
        t.documentRequiredFromDays !== null &&
        totalDays(db, r.id) >= t.documentRequiredFromDays &&
        !db.documents.some((d) => d.leaveId === r.id)
      )
        fail('ไม่พบเอกสารประกอบตามนโยบาย');
      if (t.quotaScope === 'Annual') {
        for (const y of new Set(days.map((d) => Number(d.date.slice(0, 4))))) {
          const b = balance(db, r.employeeId, r.leaveTypeId, y);
          if (
            days.filter((d) => Number(d.date.slice(0, 4)) === y).reduce((a, d) => a + d.units, 0) >
            b.remaining
          )
            fail('โควตาปัจจุบันไม่เพียงพอ จึงอนุมัติไม่ได้', 'CONFLICT');
        }
      } else if (
        totalDays(db, r.id) >
        balance(db, r.employeeId, r.leaveTypeId, 0, r.maternityCaseId).remaining
      )
        fail('โควตาลาคลอดปัจจุบันไม่เพียงพอ', 'CONFLICT');
    }
    r.status = c.type === 'approve' ? 'Approved' : 'Rejected';
    r.version++;
    r.timeline.push({
      action: c.type === 'approve' ? 'อนุมัติคำขอ' : 'ไม่อนุมัติ',
      actorId,
      at,
      comment,
    });
    if (delegated) {
      // Preserve the manager's assignment; record the actual HR decision separately.
      const manager =
        db.approvals.find(
          (step) =>
            step.leaveId === r.id &&
            step.reviewType === 'Decision' &&
            step.reviewRole === 'Manager' &&
            !step.cancelled &&
            step.status === 'Pending',
        )?.approverId ?? db.employees.find((person) => person.id === r.employeeId)?.managerId;
      db.approvals
        .filter(
          (step) =>
            step.leaveId === r.id &&
            !step.cancelled &&
            (step.status === 'Pending' || step.id === delegated.id),
        )
        .forEach((step) => {
          if (step.id === delegated.id) {
            step.status = 'Completed';
            step.comment = comment;
            step.reviewedAt = at;
          } else step.cancelled = true;
        });
      db.approvals.push({
        id: nextId(db.approvals),
        leaveId: r.id,
        approverId: actor.id,
        stepNo: db.approvals.filter((step) => step.leaveId === r.id).length + 1,
        reviewRole: 'HR',
        reviewType: 'Decision',
        status: r.status,
        comment,
        assignedAt: delegated.assignedAt,
        reviewedAt: at,
      });
      if (manager)
        notify(
          db,
          manager,
          r.id,
          `HR ${c.type === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ'} ${requestCode(r)} แล้ว`,
          at,
        );
    } else {
      const a = db.approvals.find(
        (a) =>
          a.leaveId === r.id &&
          a.reviewType === 'Decision' &&
          !a.cancelled &&
          a.status === 'Pending',
      );
      if (a) {
        a.status = r.status;
        a.comment = comment;
        a.reviewedAt = at;
      }
    }
    notify(
      db,
      r.employeeId,
      r.id,
      `${requestCode(r)} ${c.type === 'approve' ? 'ได้รับอนุมัติ' : 'ไม่ได้รับอนุมัติ'}${comment ? ' · ' + comment : ''}`,
      at,
    );
    return {
      id: r.id,
      message: c.type === 'approve' ? 'อนุมัติและอัปเดตโควตาแล้ว' : 'บันทึกผลไม่อนุมัติแล้ว',
    };
  }
  if (c.type === 'consult') {
    fail('คำขอที่ส่งให้ HR ต้องอนุมัติหรือไม่อนุมัติ ไม่ส่งความเห็นกลับผู้จัดการ', 'FORBIDDEN');
  }
  if (c.type === 'work') {
    if (!isoDate(c.date) || !['In-office', 'WFH', 'Outside'].includes(c.statusType))
      fail('สถานะหรือวันที่ไม่ถูกต้อง');
    if (effectiveWorkStatus(db, actor.id, c.date).includes('Leave'))
      fail('วันที่เลือกมีการลาที่อนุมัติแล้ว ระบบแสดงสถานะให้อัตโนมัติ');
    const row = db.workStatuses.find((w) => w.employeeId === actor.id && w.date === c.date);
    if (row) {
      row.statusType = c.statusType;
      row.updatedAt = at;
    } else
      db.workStatuses.push({
        id: nextId(db.workStatuses),
        employeeId: actor.id,
        date: c.date,
        statusType: c.statusType,
        updatedAt: at,
      });
    return { message: 'บันทึกสถานะการทำงานแล้ว' };
  }
  if (c.type === 'readNotifications') {
    db.notifications
      .filter((n) => n.employeeId === actorId)
      .forEach((n) => {
        n.read = true;
      });
    return { message: 'อ่านการแจ้งเตือนทั้งหมดแล้ว' };
  }
  if (actor.role !== 'HR') fail('เฉพาะฝ่ายบุคคลเท่านั้น', 'FORBIDDEN');
  if (c.type === 'entitlement') {
    if (
      !db.employees.some((e) => e.id === c.employeeId) ||
      !db.leaveTypes.some((t) => t.id === c.leaveTypeId && t.quotaScope === 'Annual') ||
      !Number.isInteger(c.year) ||
      c.year < 1900 ||
      c.year > 2200 ||
      !Number.isFinite(c.grantedDays) ||
      c.grantedDays < 0 ||
      c.grantedDays > 999 ||
      (c.grantedDays * 2) % 1 !== 0
    )
      fail('ข้อมูลสิทธิ์ไม่ถูกต้อง');
    const b = balance(db, c.employeeId, c.leaveTypeId, c.year);
    if (c.grantedDays < b.used + b.pending)
      fail('สิทธิ์ต้องไม่น้อยกว่าวันที่ใช้แล้วรวมกับคำขอที่รอพิจารณา');
    const e = db.entitlements.find(
      (e) => e.employeeId === c.employeeId && e.leaveTypeId === c.leaveTypeId && e.year === c.year,
    );
    if (e) e.grantedDays = c.grantedDays;
    else
      db.entitlements.push({
        id: nextId(db.entitlements),
        employeeId: c.employeeId,
        leaveTypeId: c.leaveTypeId,
        year: c.year,
        grantedDays: c.grantedDays,
      });
    notify(db, c.employeeId, null, `HR อัปเดตสิทธิ์ลาปี ${c.year + 543}`, at);
    return { message: 'บันทึกสิทธิ์วันลาแล้ว' };
  }
  if (c.type === 'maternity') {
    const employee =
      db.employees.find((e) => e.id === c.employeeId && e.active) ?? fail('ไม่พบพนักงานที่เลือก');
    const issue = maternityGenderIssue(employee);
    if (issue) fail(issue);
    if (!Number.isInteger(c.maximumDays) || c.maximumDays < 1 || c.maximumDays > 120)
      fail('ข้อมูลกรณีลาคลอดไม่ถูกต้อง');
    const id = nextId(db.maternityCases);
    db.maternityCases.push({
      id,
      employeeId: c.employeeId,
      caseNo: db.maternityCases.filter((m) => m.employeeId === c.employeeId).length + 1,
      maximumDays: c.maximumDays,
    });
    return { id, message: 'เปิดกรณีลาคลอดแล้ว' };
  }
  if (c.type === 'holiday') {
    if (
      !isoDate(c.date) ||
      (!c.remove && (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 100))
    )
      fail('ข้อมูลวันหยุดไม่ถูกต้อง');
    db.holidays = db.holidays.filter((h) => h.date !== c.date);
    if (!c.remove) db.holidays.push({ date: c.date, name: c.name.trim() });
    return { message: 'บันทึกปฏิทินวันหยุดแล้ว' };
  }
  if (c.type === 'policy') {
    const p = c.policy;
    const t = db.leaveTypes.find((t) => t.id === p?.id) ?? fail('ไม่พบประเภทการลา');
    if (
      p.quotaScope !== t.quotaScope ||
      p.dayCountBasis !== t.dayCountBasis ||
      p.eligibleGender !== t.eligibleGender
    )
      fail('รูปแบบสิทธิ์และวิธีนับวันแก้ไขได้ใน seed หรือหลังบ้าน');
    if (
      typeof p.name !== 'string' ||
      !p.name.trim() ||
      p.name.length > 100 ||
      ![p.advanceNoticeDays, p.defaultQuotaDays].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 999,
      ) ||
      !(
        p.documentRequiredFromDays === null ||
        (Number.isInteger(p.documentRequiredFromDays) &&
          p.documentRequiredFromDays >= 1 &&
          p.documentRequiredFromDays <= 999)
      )
    )
      fail('เงื่อนไขการลาไม่ถูกต้อง');
    Object.assign(t, {
      name: p.name.trim(),
      advanceNoticeDays: p.advanceNoticeDays,
      defaultQuotaDays: p.defaultQuotaDays,
      documentRequiredFromDays: p.documentRequiredFromDays,
      requiredDocumentType: p.documentRequiredFromDays === null ? null : 'Medical Certificate',
    });
    return { message: 'บันทึกนโยบายตัวอย่างแล้ว สิทธิ์ที่จัดสรรไว้ไม่ถูกเปลี่ยนอัตโนมัติ' };
  }
  return fail('ไม่รองรับคำสั่งนี้');
}
