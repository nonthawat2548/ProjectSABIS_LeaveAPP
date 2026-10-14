// @ts-check
import { thaiMonths } from './date.js';
import { statusLabels } from '../labels.js';

/**
 * Split only unambiguous saved lines. Custom names/types may contain the same
 * separator, so retain the original line when its fields cannot be identified.
 * @param {string} line
 */
export function readReportRequestLine(line) {
  const fields = line.split(' | ');
  if (fields.length !== 6) return null;
  const [code, employee, leaveType, dates, days, label] = fields;
  const units = days.match(/^(\d+(?:\.\d+)?) วันในช่วงที่เลือก$/);
  /** @type {(keyof typeof statusLabels)[]} */
  const statuses = ['Pending', 'Approved', 'Rejected', 'Withdrawn'];
  // Saved reports use the older label for withdrawn requests.
  const status =
    label === 'ยกเลิก' ? 'Withdrawn' : statuses.find((key) => statusLabels[key] === label);
  if (
    !/^LR-\d{4}-\d+$/.test(code) ||
    !/.+ \(EMP-\d+\)$/.test(employee) ||
    !leaveType ||
    !/^\d{1,2}\/\d{1,2}\/\d{4}–\d{1,2}\/\d{1,2}\/\d{4}$/.test(dates) ||
    !units ||
    !Number.isFinite(Number(units[1])) ||
    !status
  )
    return null;
  return { code, employee, leaveType, dates, days: Number(units[1]), status };
}

/**
 * @typedef {{employeeCode: string, name: string, approvedRequests: number, approvedDays: number}} ReportPerson
 */

/**
 * Count approved requests from the frozen report. The stable EMP code keeps
 * people with the same name separate. Return null for ambiguous lines instead
 * of showing a ranking with missing or wrongly attributed requests.
 * @param {ReportDashboard} report
 * @returns {ReportPerson[] | null}
 */
export function reportEmployeeFrequency(report) {
  /** @type {Map<string, ReportPerson>} */
  const people = new Map();
  const seenRequests = new Set();
  let approvedRequests = 0;
  let approvedDays = 0;
  for (const line of report.requestLines) {
    const match = line.match(
      /^(LR-\d{4}-\d+) \| (.+) \| \d{1,2}\/\d{1,2}\/\d{4}–\d{1,2}\/\d{1,2}\/\d{4} \| (\d+(?:\.\d+)?) วันในช่วงที่เลือก \| (รอพิจารณา|อนุมัติแล้ว|ไม่อนุมัติ|ยกเลิก|ยกเลิกแล้ว)$/,
    );
    if (!match || seenRequests.has(match[1])) return null;
    seenRequests.add(match[1]);
    const owners = [...match[2].matchAll(/\((EMP-\d+)\) \| /g)];
    if (owners.length !== 1) return null;
    const owner = owners[0];
    if (owner.index === 0 || match[2][owner.index - 1] !== ' ') return null;
    const name = match[2].slice(0, owner.index - 1);
    const leaveType = match[2].slice(owner.index + owner[0].length);
    if (!name || !leaveType) return null;
    const employeeCode = owner[1];
    const person = people.get(employeeCode) ?? {
      employeeCode,
      name,
      approvedRequests: 0,
      approvedDays: 0,
    };
    // A code should refer to the same saved name throughout one report.
    if (person.name !== name) return null;
    people.set(employeeCode, person);
    if (match[4] === 'อนุมัติแล้ว') {
      person.approvedRequests += 1;
      person.approvedDays += Number(match[3]);
      approvedRequests += 1;
      approvedDays += Number(match[3]);
    }
  }
  if (approvedRequests !== report.statusCounts.Approved || approvedDays !== report.approvedDays)
    return null;
  return [...people.values()].sort(
    (a, b) =>
      b.approvedRequests - a.approvedRequests ||
      b.approvedDays - a.approvedDays ||
      a.employeeCode.localeCompare(b.employeeCode, 'en', { numeric: true }),
  );
}

/**
 * @typedef {{month: number, approvedDays: number, pendingDays: number}} ReportMonth
 * @typedef {{name: string, requestCount: number, approvedDays: number, pendingDays: number}} ReportType
 * @typedef {object} ReportDashboard
 * @property {string} sender
 * @property {string} recipient
 * @property {string} employee
 * @property {string} period
 * @property {string} leaveType
 * @property {number} year
 * @property {number} month
 * @property {number} requestCount
 * @property {{Pending: number, Approved: number, Rejected: number, Withdrawn: number}} statusCounts
 * @property {number} approvedDays
 * @property {number} pendingDays
 * @property {ReportMonth[]} monthly
 * @property {ReportType[]} byType
 * @property {string[]} requestLines
 */

const decimal = '(\\d+(?:\\.\\d+)?)';

/** @param {number} value */
const validNumber = (value) => Number.isFinite(value) && value >= 0;
/** @param {string} line @param {string} prefix */
function field(line, prefix) {
  return line?.startsWith(prefix) ? line.slice(prefix.length) : null;
}

/**
 * Read the existing immutable report format. Never query current requests or
 * substitute missing values: incomplete/unknown reports stay readable as text.
 * This parser changes presentation only, and writes nothing to the database.
 * @param {string} text
 * @returns {ReportDashboard | null}
 */
export function readReportDashboard(text) {
  if (typeof text !== 'string' || text.length > 150000) return null;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== 'รายงานสรุปการลา') return null;
  const sender = field(lines[1], 'ผู้ส่ง: ');
  const recipient = field(lines[2], 'ผู้รับ: ');
  const employee = field(lines[3], 'พนักงาน: ');
  const period = field(lines[4], 'ช่วงวันที่ลา: ');
  const leaveType = field(lines[5], 'ประเภทการลา: ');
  if (!sender || !recipient || !employee || !period || !leaveType) return null;

  const periodMatch = period.match(/^(ปี|[^\d]+) (\d{4})$/);
  if (!periodMatch) return null;
  const year = Number(periodMatch[2]) - 543;
  const month = periodMatch[1] === 'ปี' ? 0 : thaiMonths.indexOf(periodMatch[1]) + 1;
  if (year < 1900 || year > 2200 || (periodMatch[1] !== 'ปี' && !month)) return null;

  const total = lines[6]?.match(/^คำขอทั้งหมด: (\d+) คำขอ$/);
  const approved = lines[7]?.match(new RegExp(`^อนุมัติแล้ว: (\\d+) คำขอ / ${decimal} วัน$`));
  const pending = lines[8]?.match(new RegExp(`^รอพิจารณา: (\\d+) คำขอ / ${decimal} วัน$`));
  const rejected = lines[9]?.match(/^ไม่อนุมัติ: (\d+) คำขอ$/);
  const withdrawn = lines[10]?.match(/^ยกเลิก: (\d+) คำขอ$/);
  if (!total || !approved || !pending || !rejected || !withdrawn) return null;
  const requestCount = Number(total[1]);
  const statusCounts = {
    Approved: Number(approved[1]),
    Pending: Number(pending[1]),
    Rejected: Number(rejected[1]),
    Withdrawn: Number(withdrawn[1]),
  };
  const approvedDays = Number(approved[2]),
    pendingDays = Number(pending[2]);
  if (
    ![requestCount, ...Object.values(statusCounts)].every(Number.isSafeInteger) ||
    ![approvedDays, pendingDays].every(validNumber) ||
    Object.values(statusCounts).reduce((sum, value) => sum + value, 0) !== requestCount
  )
    return null;

  const monthStart = lines.indexOf('รายเดือน', 11);
  const typeStart = lines.indexOf('แยกตามประเภทการลา', monthStart + 1);
  const requestStart = lines.indexOf('รายละเอียดคำขอ', typeStart + 1);
  if (monthStart !== 12 || typeStart <= monthStart || requestStart <= typeStart) return null;

  /** @type {ReportMonth[]} */
  const monthly = [];
  for (const line of lines.slice(monthStart + 1, typeStart).filter(Boolean)) {
    const match = line.match(
      new RegExp(`^(\\d{1,2})/(\\d{4}) \\| อนุมัติ ${decimal} วัน \\| รอพิจารณา ${decimal} วัน$`),
    );
    if (!match) return null;
    const row = {
      month: Number(match[1]),
      approvedDays: Number(match[3]),
      pendingDays: Number(match[4]),
    };
    if (
      Number(match[2]) !== year + 543 ||
      row.month < 1 ||
      row.month > 12 ||
      (month && row.month !== month) ||
      monthly.some((item) => item.month === row.month) ||
      ![row.approvedDays, row.pendingDays].every(validNumber)
    )
      return null;
    monthly.push(row);
  }
  if (monthly.length !== (month ? 1 : 12)) return null;
  monthly.sort((a, b) => a.month - b.month);

  /** @type {ReportType[]} */
  const byType = [];
  for (const line of lines.slice(typeStart + 1, requestStart).filter(Boolean)) {
    const match = line.match(
      new RegExp(`^(.+) \\| (\\d+) คำขอ \\| อนุมัติ ${decimal} วัน \\| รอพิจารณา ${decimal} วัน$`),
    );
    if (!match) return null;
    const row = {
      name: match[1],
      requestCount: Number(match[2]),
      approvedDays: Number(match[3]),
      pendingDays: Number(match[4]),
    };
    if (
      !Number.isSafeInteger(row.requestCount) ||
      ![row.approvedDays, row.pendingDays].every(validNumber)
    )
      return null;
    byType.push(row);
  }
  const requestEnd = lines.indexOf('', requestStart + 1);
  if (requestEnd < 0) return null;
  const requestLines = lines.slice(requestStart + 1, requestEnd);
  if (
    requestLines.length !== requestCount ||
    !requestLines.every((line) => /^LR-\d{4}-\d+ \| .+/.test(line))
  )
    return null;
  /** @param {{approvedDays: number, pendingDays: number, requestCount?: number}[]} rows @param {'approvedDays' | 'pendingDays' | 'requestCount'} key */
  const sum = (rows, key) => rows.reduce((value, row) => value + (row[key] ?? 0), 0);
  if (
    sum(monthly, 'approvedDays') !== approvedDays ||
    sum(monthly, 'pendingDays') !== pendingDays ||
    sum(byType, 'approvedDays') !== approvedDays ||
    sum(byType, 'pendingDays') !== pendingDays ||
    sum(byType, 'requestCount') !== requestCount
  )
    return null;
  return {
    sender,
    recipient,
    employee,
    period,
    leaveType,
    year,
    month,
    requestCount,
    statusCounts,
    approvedDays,
    pendingDays,
    monthly,
    byType,
    requestLines,
  };
}
