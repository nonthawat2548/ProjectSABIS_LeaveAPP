// @ts-check
import { actorById, balance, DomainError } from './service.js';
import { addDays, today, workingDates } from './date.js';
import { leaveSummaryYears, summarizeLeave } from './leaveSummary.js';
import { employeeCode, searchColleagues } from './colleagues.js';
import { formatDepartment, workStatusLabels } from '../labels.js';

/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').Employee} Employee */
/** @typedef {{year: number, month: number, department?: string, leaveTypeId?: number}} AnalyticsFilters */
/** @typedef {{employeeId: number, date: string, units: number, rawUnits: number, requestIds: number[]}} AbsenceDay */
/** @typedef {{requestId: number, submittedAt: string, reviewedAt: string | null, elapsedMs: number | null, issue: string}} ApprovalTimeDetail */

/** Verify scope independently of navigation, profile rights or client-supplied role. */
/** @param {Database} db @param {Employee} actor */
export function managementPeople(db, actor) {
  const verified = actorById(db, actor.id);
  if (!['Manager', 'HR'].includes(verified.role))
    throw new DomainError('เฉพาะผู้จัดการและ HR เท่านั้น', 'FORBIDDEN');
  return db.employees
    .filter(
      (person) =>
        person.active &&
        (verified.role === 'HR' ||
          (person.role === 'Employee' && person.managerId === verified.id)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'th') || a.id - b.id);
}

/** @param {number} year @param {number} month */
function monthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

/**
 * Person-days count an employee at most once per working date. Calendar-day
 * maternity units on weekends remain in charts, but cannot inflate this rate.
 * Current active headcount/calendar are explicit reporting assumptions, not a
 * reconstruction of historical employment or holiday policies.
 * @param {Database} db @param {number} year @param {number} month @param {number} headcount
 */
function absenceRate(db, year, month, headcount) {
  const { start, end } = monthRange(year, month);
  const dates = new Set(
    workingDates(
      start,
      end,
      db.holidays.map((holiday) => holiday.date),
    ),
  );
  const requests = new Map(
    db.requests
      .filter((request) => ['Pending', 'Approved'].includes(request.status))
      .map((request) => [request.id, request]),
  );
  /** @type {Map<string, AbsenceDay>} */
  const personDays = new Map();
  for (const day of db.days) {
    const request = requests.get(day.leaveId);
    if (!request || !dates.has(day.date) || !Number.isFinite(day.units) || day.units <= 0) continue;
    const key = `${request.employeeId}:${day.date}`;
    const row = personDays.get(key) ?? {
      employeeId: request.employeeId,
      date: day.date,
      units: 0,
      rawUnits: 0,
      requestIds: [],
    };
    row.rawUnits += day.units;
    row.units = Math.min(1, row.rawUnits);
    if (!row.requestIds.includes(request.id)) row.requestIds.push(request.id);
    personDays.set(key, row);
  }
  const details = [...personDays.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.employeeId - b.employeeId,
  );
  const numerator = details.reduce((total, row) => total + row.units, 0);
  const denominator = dates.size * headcount;
  return {
    numerator,
    denominator,
    workingDays: dates.size,
    percent: denominator ? (numerator / denominator) * 100 : null,
    details,
  };
}

/** @param {import('./types.js').ColleagueStatus | undefined} status */
function availability(status) {
  if (status?.leaveDuration === 'Full') return 'ลางาน';
  if (status?.leaveDuration)
    return `ลางาน${status.leaveDuration === 'AM' ? 'ครึ่งวันเช้า' : 'ครึ่งวันบ่าย'}`;
  return status?.workStatus ? workStatusLabels[status.workStatus] : 'ยังไม่ได้ระบุสถานะ';
}

/**
 * Read-only management projection. Saved day units drive all leave totals;
 * annual balances always cover the whole selected year, independently of month.
 * No private reason, attachment, contact or maternity detail is exported.
 * @param {Database} db @param {Employee} actor @param {AnalyticsFilters} filters @param {Date} [now]
 */
export function managementAnalytics(
  db,
  actor,
  { year, month, department = '', leaveTypeId = 0 },
  now = new Date(),
) {
  const verified = actorById(db, actor.id);
  const allowed = managementPeople(db, verified);
  if (
    !Number.isSafeInteger(year) ||
    year < 1901 ||
    year > 2200 ||
    !Number.isSafeInteger(month) ||
    month < 1 ||
    month > 12
  )
    throw new DomainError('ปีหรือเดือนที่เลือกไม่ถูกต้อง');
  if (
    !Number.isSafeInteger(leaveTypeId) ||
    leaveTypeId < 0 ||
    (leaveTypeId && !db.leaveTypes.some((type) => type.id === leaveTypeId))
  )
    throw new DomainError('ประเภทการลาที่เลือกไม่ถูกต้อง');
  const departmentName = (/** @type {Employee} */ person) =>
    formatDepartment(person.department) || 'ไม่ได้ระบุฝ่าย';
  const departments = [...new Set(allowed.map(departmentName))].sort((a, b) =>
    a.localeCompare(b, 'en'),
  );
  if (typeof department !== 'string' || (department && !departments.includes(department)))
    throw new DomainError('คุณไม่มีสิทธิ์ดูรายงานของฝ่ายนี้', 'FORBIDDEN');
  const people = allowed.filter((person) => !department || departmentName(person) === department);
  const ids = new Set(people.map((person) => person.id));
  const scoped = { ...db, requests: db.requests.filter((request) => ids.has(request.employeeId)) };
  const summary = summarizeLeave(scoped, verified, { year, month, leaveTypeId });
  const annual = summarizeLeave(scoped, verified, { year, leaveTypeId });
  const rateDb = {
    ...scoped,
    requests: scoped.requests.filter(
      (request) => !leaveTypeId || request.leaveTypeId === leaveTypeId,
    ),
  };
  const rate = absenceRate(rateDb, year, month, people.length);
  const previousDate = addDays(monthRange(year, month).start, -1);
  const previousRate = absenceRate(
    rateDb,
    Number(previousDate.slice(0, 4)),
    Number(previousDate.slice(5, 7)),
    people.length,
  );
  const difference =
    rate.percent === null || previousRate.percent === null
      ? null
      : rate.percent - previousRate.percent;
  const currentDate = today(now);
  const statuses = new Map(
    searchColleagues(scoped, verified.id, '', currentDate).map((status) => [
      status.employeeId,
      status,
    ]),
  );
  const order = (/** @type {number} */ id) =>
    [1, 3, 2].includes(id) ? [1, 3, 2].indexOf(id) : 100 + id;
  const annualTypes = db.leaveTypes
    .filter((type) => type.quotaScope === 'Annual' && (!leaveTypeId || type.id === leaveTypeId))
    .sort((a, b) => order(a.id) - order(b.id));
  const rows = people.map((person) => {
    const balances = annualTypes.map((type) => ({
      leaveTypeId: type.id,
      name: type.name,
      allocated: db.entitlements.some(
        (entry) =>
          entry.employeeId === person.id && entry.leaveTypeId === type.id && entry.year === year,
      ),
      ...balance(db, person.id, type.id, year),
    }));
    const maternity =
      leaveTypeId &&
      db.leaveTypes.find((type) => type.id === leaveTypeId)?.quotaScope === 'Pregnancy'
        ? db.maternityCases
            .filter((entry) => entry.employeeId === person.id)
            .map((entry) => ({
              caseNo: entry.caseNo,
              ...balance(db, person.id, leaveTypeId, 0, entry.id),
            }))
        : [];
    const pendingDays =
      annual.byEmployee.find((entry) => entry.employeeId === person.id)?.pendingDays ?? 0;
    return {
      employeeId: person.id,
      code: employeeCode(person.id),
      name: person.name,
      department: departmentName(person),
      balances,
      maternity,
      pendingDays,
      status: availability(statuses.get(person.id)),
    };
  });
  const byDepartment = departments
    .filter((name) => !department || department === name)
    .map((name) => {
      const members = people.filter((person) => departmentName(person) === name);
      const memberIds = new Set(members.map((person) => person.id));
      const requests = summary.requests.filter((entry) => memberIds.has(entry.request.employeeId));
      return {
        name,
        headcount: members.length,
        onLeaveToday: members.filter((person) => statuses.get(person.id)?.leaveDuration).length,
        requestCount: requests.length,
        approvedDays: requests
          .filter((entry) => entry.request.status === 'Approved')
          .reduce((sum, entry) => sum + entry.periodDays, 0),
        pendingDays: requests
          .filter((entry) => entry.request.status === 'Pending')
          .reduce((sum, entry) => sum + entry.periodDays, 0),
      };
    })
    .sort(
      (a, b) =>
        b.approvedDays + b.pendingDays - a.approvedDays - a.pendingDays ||
        a.name.localeCompare(b.name),
    );
  const totalDays = summary.approvedDays + summary.pendingDays;
  const byType = db.leaveTypes
    .filter((type) => !leaveTypeId || type.id === leaveTypeId)
    .map((type) => {
      const item = summary.byType.find((entry) => entry.leaveTypeId === type.id);
      const approvedDays = item?.approvedDays ?? 0,
        pendingDays = item?.pendingDays ?? 0;
      return {
        name: type.name,
        leaveTypeId: type.id,
        approvedDays,
        pendingDays,
        share: totalDays ? ((approvedDays + pendingDays) / totalDays) * 100 : 0,
      };
    })
    .sort(
      (a, b) =>
        b.approvedDays + b.pendingDays - a.approvedDays - a.pendingDays ||
        a.leaveTypeId - b.leaveTypeId,
    );
  /** @type {number[]} */
  const durations = [];
  /** @type {ApprovalTimeDetail[]} */
  const approvalDetails = [];
  let missingApprovalTimes = 0;
  for (const { request } of summary.requests) {
    if (request.status !== 'Approved') continue;
    const decisions = db.approvals.filter(
      (step) =>
        step.leaveId === request.id &&
        step.reviewType === 'Decision' &&
        !step.cancelled &&
        step.status === 'Approved',
    );
    const final = decisions.sort((a, b) => b.stepNo - a.stepNo || b.id - a.id)[0];
    const submitted = Date.parse(request.requestDate),
      reviewed = Date.parse(final?.reviewedAt ?? '');
    const valid =
      Number.isFinite(submitted) &&
      Number.isFinite(reviewed) &&
      reviewed >= submitted &&
      reviewed <= now.getTime();
    if (valid) durations.push(reviewed - submitted);
    else missingApprovalTimes++;
    approvalDetails.push({
      requestId: request.id,
      submittedAt: request.requestDate,
      reviewedAt: final?.reviewedAt ?? null,
      elapsedMs: valid ? reviewed - submitted : null,
      issue: valid
        ? ''
        : !Number.isFinite(submitted)
          ? 'เวลายื่นไม่ถูกต้อง'
          : !Number.isFinite(reviewed)
            ? 'ไม่มีเวลาอนุมัติที่ครบถ้วน'
            : reviewed < submitted
              ? 'เวลาอนุมัติก่อนเวลายื่น'
              : 'เวลาอนุมัติอยู่ในอนาคต',
    });
  }
  /** @template {{name:string,approvedDays:number,pendingDays:number}} T @param {T[]} items */
  const top = (items) => {
    const maximum = Math.max(0, ...items.map((item) => item.approvedDays + item.pendingDays));
    return maximum ? items.filter((item) => item.approvedDays + item.pendingDays === maximum) : [];
  };
  // Rank approved requests in the selected period, keeping people with the same name separate.
  /** @type {Map<number, {requestCount: number, days: number}>} */
  const approvedTotals = new Map();
  for (const { request, periodDays } of summary.requests) {
    if (request.status !== 'Approved') continue;
    const totals = approvedTotals.get(request.employeeId) ?? { requestCount: 0, days: 0 };
    totals.requestCount++;
    totals.days += periodDays;
    approvedTotals.set(request.employeeId, totals);
  }
  const approvedEmployees = rows
    .map((person) => ({
      employeeId: person.employeeId,
      code: person.code,
      name: person.name,
      department: person.department,
      ...(approvedTotals.get(person.employeeId) ?? { requestCount: 0, days: 0 }),
    }))
    .filter((person) => person.requestCount > 0)
    .sort(
      (a, b) => b.requestCount - a.requestCount || b.days - a.days || a.employeeId - b.employeeId,
    );
  return {
    scope: verified.role === 'HR' ? 'พนักงานที่ใช้งานอยู่ทุกฝ่าย' : 'พนักงานในทีมที่คุณดูแล',
    year,
    month,
    department,
    leaveTypeId,
    currentDate,
    departments,
    headcount: people.length,
    years: [
      ...new Set([
        ...leaveSummaryYears(scoped, verified, Number(currentDate.slice(0, 4))),
        ...db.entitlements.filter((entry) => ids.has(entry.employeeId)).map((entry) => entry.year),
      ]),
    ].sort((a, b) => b - a),
    summary,
    monthly: annual.monthly,
    rate,
    previousRate,
    previousPeriod: {
      year: Number(previousDate.slice(0, 4)),
      month: Number(previousDate.slice(5, 7)),
    },
    difference,
    byDepartment,
    byType,
    rows,
    annualTypes,
    averageApprovalMs: durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : null,
    approvalCount: durations.length,
    missingApprovalTimes,
    approvalDetails,
    topDepartments: top(byDepartment),
    topTypes: top(byType),
    approvedEmployees,
  };
}
