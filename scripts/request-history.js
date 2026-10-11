/**
 * @typedef {import('../src/domain/types.js').Database} Database
 */
/**
 * Clear leave transactions while retaining accounts and granted rights.
 *
 * @param {Database} input
 * @returns {Database}
 */
export function clearRequestHistory(input) {
  const collections = [
    'employees',
    'leaveTypes',
    'entitlements',
    'maternityCases',
    'requests',
    'days',
    'documents',
    'approvals',
    'workStatuses',
    'notifications',
    'holidays',
  ];
  if (input.schemaVersion !== 1 || collections.some((key) => !Array.isArray(input[key])))
    throw new Error('Unsupported local database; no data was changed');
  const db = structuredClone(input);
  db.requests = [];
  db.days = [];
  db.documents = [];
  db.approvals = [];
  db.notifications = db.notifications.filter((row) => row.leaveId == null);
  db.workStatuses = db.workStatuses.filter(
    (row) => row.statusType !== 'Leave' && row.leaveId == null,
  );
  return db;
}
