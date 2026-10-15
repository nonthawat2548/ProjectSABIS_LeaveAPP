// @ts-check
import { managementAnalytics } from './managementAnalytics.js';
import { thaiMonths, formatDate } from './date.js';

/** Quote every CSV field and prevent spreadsheet formula evaluation of stored text. */
/** @param {unknown} value */
export function csvCell(value) {
  let text = String(value ?? '');
  // eslint-disable-next-line no-control-regex -- Detect control characters hiding spreadsheet formulas.
  const formula = /^[\s\u0000-\u001f]*[=+\-@]/u;
  if (typeof value !== 'number' && (formula.test(text) || /^[\t\r\n]/.test(text)))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

/**
 * Recalculate from the authorized scope; never accept a prebuilt client report.
 * @param {import('./types.js').Database} db @param {import('./types.js').Employee} actor
 * @param {import('./managementAnalytics.js').AnalyticsFilters} filters @param {Date} [now]
 */
export function managementCsv(db, actor, filters, now = new Date()) {
  const report = managementAnalytics(db, actor, filters, now);
  const types = report.annualTypes;
  const maternityColumn =
    db.leaveTypes.find((type) => type.id === filters.leaveTypeId)?.quotaScope === 'Pregnancy';
  const lines = [
    ['รายงานสรุปการลาและสิทธิ์วันลา'],
    ['ช่วง KPI', `${thaiMonths[filters.month - 1]} ${filters.year + 543}`, 'ขอบเขต', report.scope],
    [
      'ฝ่าย',
      filters.department || 'ทุกฝ่ายที่มีสิทธิ์ดู',
      'ประเภท',
      db.leaveTypes.find((type) => type.id === filters.leaveTypeId)?.name ?? 'ทุกประเภท',
    ],
    [
      'อัตราการลาอนุมัติและรอพิจารณา (%)',
      report.rate.percent === null ? 'ไม่มีฐานคำนวณ' : report.rate.percent.toFixed(2),
      'วันลาบนวันทำงาน (คน-วัน)',
      report.rate.numerator,
      'วันทำงานรวม (คน-วัน)',
      report.rate.denominator,
    ],
    [
      'ระยะเวลาอนุมัติเฉลี่ย (นาที)',
      report.averageApprovalMs === null
        ? 'ไม่มีข้อมูลเวลาอนุมัติ'
        : (report.averageApprovalMs / 60000).toFixed(2),
      'คำขอที่มีเวลาครบ',
      report.approvalCount,
    ],
    [
      'ยอดสิทธิ์/ใช้แล้ว/คงเหลือและรอพิจารณาด้านล่างเป็นยอดทั้งปี',
      filters.year + 543,
      'สถานะงาน ณ',
      formatDate(report.currentDate),
    ],
    [
      'รหัสพนักงาน',
      'ชื่อ-นามสกุล',
      'แผนก',
      ...types.flatMap((type) => [`${type.name} ใช้แล้ว (วัน)`, `${type.name} คงเหลือ (วัน)`]),
      ...(maternityColumn ? ['ลาคลอด ใช้แล้ว/คงเหลือรายกรณี'] : []),
      'รอพิจารณาในปี (วัน)',
      'สถานะวันนี้',
    ],
  ];
  for (const row of report.rows)
    lines.push([
      row.code,
      row.name,
      row.department,
      ...row.balances.flatMap((item) => [
        item.allocated ? item.used : 'ไม่ได้จัดสรร',
        item.allocated ? item.remaining : 'ไม่ได้จัดสรร',
      ]),
      ...(maternityColumn
        ? [
            row.maternity
              .map((item) => `กรณี ${item.caseNo}: ${item.used}/${item.remaining}`)
              .join('; ') || 'ไม่มีกรณี',
          ]
        : []),
      row.pendingDays,
      row.status,
    ]);
  return '\uFEFF' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
