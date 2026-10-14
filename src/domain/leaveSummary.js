// @ts-check
import { isoDate, today } from './date.js';
import { actorById, canView, DomainError } from './service.js';

/**
 * @typedef {import('./types.js').Database} Database
 * @typedef {import('./types.js').Employee} Employee
 * @typedef {import('./types.js').LeaveRequest} LeaveRequest
 * @typedef {import('./types.js').RequestStatus} RequestStatus
 * @typedef {Record<RequestStatus, number>} SummaryStatusCounts
 * @typedef {{month: number, approvedDays: number, pendingDays: number}} SummaryMonth
 * @typedef {{leaveTypeId: number, name: string, requestCount: number, approvedDays: number, pendingDays: number}} SummaryType
 * @typedef {{employeeId: number, name: string, requestCount: number, approvedDays: number, pendingDays: number}} SummaryEmployee
 * @typedef {{request: LeaveRequest, periodDays: number}} SummaryRequest
 * @typedef {object} LeaveSummary
 * @property {number} requestCount
 * @property {SummaryStatusCounts} statusCounts
 * @property {number} approvedDays
 * @property {number} pendingDays
 * @property {number} employeeCount
 * @property {SummaryMonth[]} monthly
 * @property {SummaryType[]} byType
 * @property {SummaryEmployee[]} byEmployee
 * @property {SummaryRequest[]} requests
 * @property {{date: string, approvedDays: number, pendingDays: number}[]} daily
 */

/** @param {number} year */
function validateYear(year) {
  if (!Number.isSafeInteger(year) || year < 1900 || year > 2200)
    throw new DomainError('ปีที่เลือกไม่ถูกต้อง');
}

/**
 * Recheck scope even when callers supply an unfiltered browser database.
 * Employee profile access does not grant access to another team's leave records.
 * @param {Database} db
 * @param {Employee} actor
 * @returns {Map<number, LeaveRequest>}
 */
function scopedRequests(db, actor) {
  const verifiedActor = actorById(db, actor.id);
  return new Map(
    db.requests.filter((request) => canView(db, verifiedActor, request)).map((r) => [r.id, r]),
  );
}

/**
 * People available for individual summaries, including those without requests.
 * HR identities used for consultation are never manager report targets.
 * @param {Database} db
 * @param {Employee} actor
 * @returns {Employee[]}
 */
export function leaveSummaryPeople(db, actor) {
  const verified = actorById(db, actor.id);
  return db.employees
    .filter(
      (person) =>
        verified.role === 'HR' ||
        person.id === verified.id ||
        (verified.role === 'Manager' &&
          person.role === 'Employee' &&
          person.managerId === verified.id),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

/**
 * Available years come from saved leave dates, not submission dates or quotas.
 * @param {Database} db
 * @param {Employee} actor
 * @param {number} [currentYear]
 * @returns {number[]}
 */
export function leaveSummaryYears(db, actor, currentYear = Number(today().slice(0, 4))) {
  validateYear(currentYear);
  const requests = scopedRequests(db, actor);
  const years = new Set([currentYear]);
  for (const day of db.days) {
    if (requests.has(day.leaveId) && isoDate(day.date)) years.add(Number(day.date.slice(0, 4)));
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * Sort groups by approved and pending days, then by their displayed name.
 * @param {{approvedDays: number, pendingDays: number, name: string}} a
 * @param {{approvedDays: number, pendingDays: number, name: string}} b
 */
function compareGroups(a, b) {
  return (
    b.approvedDays + b.pendingDays - a.approvedDays - a.pendingDays ||
    a.name.localeCompare(b.name, 'th')
  );
}

/**
 * Summarize saved LeaveDay units. Do not regenerate dates from the current
 * holiday policy or mix maternity-case limits into annual leave totals.
 * One request can contribute days to several months or years, but is counted
 * only once in the selected period. Rejected and withdrawn requests are counted
 * separately and never contribute to approved or pending days.
 * @param {Database} db
 * @param {Employee} actor
 * @param {{year: number, month?: number, leaveTypeId?: number, employeeId?: number}} filters
 * @returns {LeaveSummary}
 */
export function summarizeLeave(db, actor, { year, month = 0, leaveTypeId = 0, employeeId = 0 }) {
  validateYear(year);
  if (!Number.isSafeInteger(month) || month < 0 || month > 12)
    throw new DomainError('เดือนที่เลือกไม่ถูกต้อง');
  if (!Number.isSafeInteger(leaveTypeId) || leaveTypeId < 0)
    throw new DomainError('ประเภทการลาที่เลือกไม่ถูกต้อง');
  if (!Number.isSafeInteger(employeeId) || employeeId < 0)
    throw new DomainError('พนักงานที่เลือกไม่ถูกต้อง');
  if (employeeId && !leaveSummaryPeople(db, actor).some((person) => person.id === employeeId))
    throw new DomainError('คุณไม่มีสิทธิ์ดูสรุปการลาของพนักงานคนนี้', 'FORBIDDEN');

  const scoped = scopedRequests(db, actor);
  const selected = new Map(
    [...scoped].filter(
      ([, request]) =>
        (!leaveTypeId || request.leaveTypeId === leaveTypeId) &&
        (!employeeId || request.employeeId === employeeId),
    ),
  );
  const daily = new Map();
  /** @type {Map<number, number>} */
  const periodDays = new Map();
  /** @type {SummaryMonth[]} */
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    approvedDays: 0,
    pendingDays: 0,
  }));

  for (const day of db.days) {
    const request = selected.get(day.leaveId);
    if (
      !request ||
      !isoDate(day.date) ||
      Number(day.date.slice(0, 4)) !== year ||
      !Number.isFinite(day.units) ||
      day.units <= 0
    )
      continue;
    const dayMonth = Number(day.date.slice(5, 7));
    if (month && dayMonth !== month) continue;
    periodDays.set(day.leaveId, (periodDays.get(day.leaveId) ?? 0) + day.units);
    const dailyRow = daily.get(day.date) ?? { date: day.date, approvedDays: 0, pendingDays: 0 };
    if (request.status === 'Approved') dailyRow.approvedDays += day.units;
    if (request.status === 'Pending') dailyRow.pendingDays += day.units;
    daily.set(day.date, dailyRow);
    if (request.status === 'Approved') monthly[dayMonth - 1].approvedDays += day.units;
    if (request.status === 'Pending') monthly[dayMonth - 1].pendingDays += day.units;
  }

  /** @type {SummaryStatusCounts} */
  const statusCounts = { Pending: 0, Approved: 0, Rejected: 0, Withdrawn: 0 };
  const employees = new Map(db.employees.map((employee) => [employee.id, employee]));
  const leaveTypes = new Map(db.leaveTypes.map((type) => [type.id, type]));
  /** @type {Map<number, SummaryType>} */
  const types = new Map();
  /** @type {Map<number, SummaryEmployee>} */
  const people = new Map();
  /** @type {SummaryRequest[]} */
  const requests = [];
  let approvedDays = 0;
  let pendingDays = 0;

  for (const [id, units] of periodDays) {
    const request = selected.get(id);
    if (!request) continue;
    statusCounts[request.status]++;
    const approved = request.status === 'Approved' ? units : 0;
    const pending = request.status === 'Pending' ? units : 0;
    approvedDays += approved;
    pendingDays += pending;
    requests.push({ request, periodDays: units });

    let type = types.get(request.leaveTypeId);
    if (!type) {
      type = {
        leaveTypeId: request.leaveTypeId,
        name: leaveTypes.get(request.leaveTypeId)?.name ?? `ประเภทการลา ${request.leaveTypeId}`,
        requestCount: 0,
        approvedDays: 0,
        pendingDays: 0,
      };
      types.set(request.leaveTypeId, type);
    }
    type.requestCount++;
    type.approvedDays += approved;
    type.pendingDays += pending;

    let person = people.get(request.employeeId);
    if (!person) {
      person = {
        employeeId: request.employeeId,
        name: employees.get(request.employeeId)?.name ?? `รหัสพนักงาน ${request.employeeId}`,
        requestCount: 0,
        approvedDays: 0,
        pendingDays: 0,
      };
      people.set(request.employeeId, person);
    }
    person.requestCount++;
    person.approvedDays += approved;
    person.pendingDays += pending;
  }

  return {
    requestCount: requests.length,
    statusCounts,
    approvedDays,
    pendingDays,
    employeeCount: people.size,
    monthly,
    byType: [...types.values()].sort(compareGroups),
    byEmployee: [...people.values()].sort(compareGroups),
    requests: requests.sort((a, b) => b.request.id - a.request.id),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
