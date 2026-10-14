import { thaiMonths } from './domain/date.js';
import { formatLeaveDays } from './labels.js';

const shortMonths = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];
const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const count = (value) => number.format(value);

/** @param {{months: import('./domain/leaveSummary.js').SummaryMonth[], month: number, showValues?: boolean}} props */
export function MonthChart({ months, month, showValues = false }) {
  const rows = month ? months.filter((item) => item.month === month) : months;
  const maximum = Math.max(1, ...rows.flatMap((item) => [item.approvedDays, item.pendingDays]));
  return (
    <div
      className="leave-summary-chart-scroll"
      tabIndex={0}
      role="region"
      aria-label="กราฟจำนวนวันลารายเดือน เลื่อนซ้ายขวาเพื่อดูครบทุกเดือน"
    >
      <ul
        className={
          'leave-summary-months' +
          (month ? ' single-month' : '') +
          (showValues ? ' with-values' : '')
        }
      >
        {rows.map((item) => (
          <li key={item.month}>
            <div
              className="leave-summary-month-bars"
              role="img"
              aria-label={`${thaiMonths[item.month - 1]} อนุมัติ ${formatLeaveDays(item.approvedDays)} รอพิจารณา ${formatLeaveDays(item.pendingDays)}`}
            >
              <span
                className="leave-summary-bar approved"
                style={{ height: `${(item.approvedDays / maximum) * 100}%` }}
                aria-hidden="true"
              >
                {showValues && (
                  <span className="leave-report-bar-value">{count(item.approvedDays)}</span>
                )}
              </span>
              <span
                className="leave-summary-bar pending"
                style={{ height: `${(item.pendingDays / maximum) * 100}%` }}
                aria-hidden="true"
              >
                {showValues && (
                  <span className="leave-report-bar-value">{count(item.pendingDays)}</span>
                )}
              </span>
            </div>
            {!showValues && (
              <strong
                className="leave-summary-month-total"
                title={formatLeaveDays(item.approvedDays + item.pendingDays)}
              >
                {count(item.approvedDays + item.pendingDays)}
              </strong>
            )}
            <span className="leave-summary-month-label">{shortMonths[item.month - 1]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
