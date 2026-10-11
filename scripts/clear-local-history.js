/**
 * @typedef {import('../src/domain/types.js').Database} Database
 * @typedef {import('../src/domain/types.js').WorkStatus} WorkStatus
 */
// @ts-check
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { clearRequestHistory } from './request-history.js';
export { clearRequestHistory } from './request-history.js';
/**
 * @param {WorkStatus} status
 */
function isLeaveStatus(status) {
  const row = /** @type {{ statusType: string; leaveId?: number | null }} */ (
    /** @type {unknown} */ (status)
  );
  return row.statusType === 'Leave' || row.leaveId != null;
}
/**
 * @param {Database} db
 */
function counts(db) {
  return {
    requests: db.requests.length,
    days: db.days.length,
    documents: db.documents.length,
    approvals: db.approvals.length,
    leaveNotifications: db.notifications.filter((row) => row.leaveId != null).length,
    leaveWorkStatuses: db.workStatuses.filter(isLeaveStatus).length,
  };
}
/**
 * Stop the Go JSON server before calling: it holds its database in memory.
 *
 * @param {string} path
 */
export async function clearLocalFile(path) {
  const file = resolve(path);
  const beforeStat = await stat(file);
  const contents = await readFile(file);
  /**
   * @type {Database}
   */
  const before = JSON.parse(contents.toString('utf8'));
  const after = clearRequestHistory(before);
  const backup = `${file}.before-clear-${Date.now()}-${randomUUID()}.bak`;
  const temp = `${file}.clear-${randomUUID()}.tmp`;
  await writeFile(backup, contents, { flag: 'wx' });
  try {
    await writeFile(temp, JSON.stringify(after, null, 2) + '\n', { flag: 'wx' });
    const current = await stat(file);
    if (current.mtimeMs !== beforeStat.mtimeMs || current.size !== beforeStat.size)
      throw new Error('The database changed during cleanup; stop the server and try again');
    await rename(temp, file);
  } finally {
    await unlink(temp).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  return { file, backup, before: counts(before), after: counts(after) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fileFlag = process.argv.indexOf('--file');
  const file = fileFlag >= 0 ? process.argv[fileFlag + 1] : 'server/data/leave-management-go.json';
  if (!file || file.startsWith('--')) throw new Error('--file requires a local JSON path');
  if (!process.argv.includes('--confirm')) {
    console.log('Stop the local API first. Run: npm run history:clear -- --confirm');
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(await clearLocalFile(file), null, 2));
  }
}
