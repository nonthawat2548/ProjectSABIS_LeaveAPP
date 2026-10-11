/**
 * UI: Buddhist Era d/m/yyyy; storage/API: Gregorian ISO yyyy-mm-dd.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1900 || y > 2200) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
/**
 * @param {string} value
 * @returns {string}
 */
export function formatDate(value) {
  if (!isoDate(value)) return '—';
  const [y, m, d] = value.split('-').map(Number);
  return `${d}/${m}/${y + 543}`;
}
/**
 * @param {string} value
 * @returns {string | null}
 */
export function parseThaiDate(value) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const iso = `${Number(y) - 543}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isoDate(iso) ? iso : null;
}
/**
 * @param {Date} [now]
 * @returns {string}
 */
export function today(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (t) => parts.find((p) => p.type === t)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
/**
 * @param {string} value
 * @returns {string}
 */
export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${formatDate(today(date))} · ${time} น.`;
}
/**
 * @param {string} iso
 * @param {number} amount
 * @returns {string}
 */
export function addDays(iso, amount) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}
/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function dayDifference(a, b) {
  return (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;
}
/**
 * @param {string} start
 * @param {string} end
 * @returns {string[]}
 */
export function datesBetween(start, end) {
  if (!isoDate(start) || !isoDate(end) || end < start || dayDifference(start, end) > 365) return [];
  const result = [];
  for (let d = start; d <= end; d = addDays(d, 1)) result.push(d);
  return result;
}
/**
 * @param {string} start
 * @param {string} end
 * @param {string[]} [holidays]
 * @returns {string[]}
 */
export function workingDates(start, end, holidays = []) {
  return datesBetween(start, end).filter((d) => {
    const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    return wd !== 0 && wd !== 6 && !holidays.includes(d);
  });
}
/**
 * @param {string} iso
 * @param {string[]} [holidays]
 * @returns {string}
 */
export function nextWorkingDay(iso, holidays = []) {
  let d = iso;
  while (!workingDates(d, d, holidays).length) d = addDays(d, 1);
  return d;
}
/**
 * @type {string[]}
 */
export const thaiMonths = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];
