/**
 * @typedef {import('../src/domain/types.js').Database} Database
 */
// @ts-check
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createDemoDatabase } from '../src/data/demoDatabase.js';
export const databasePath = resolve(
  process.env.MOCK_DATA_FILE || 'server/data/leave-management-10-people.json',
);
/**
 * @type {Promise<unknown>}
 */
let queue = Promise.resolve();
/**
 * @returns {Promise<Database>}
 */
async function read() {
  try {
    const db = JSON.parse(await readFile(databasePath, 'utf8'));
    if (db.schemaVersion !== 1) throw new Error('Unsupported database schema');
    return db;
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT') return createDemoDatabase();
    throw e;
  }
}
/**
 * @param {Database} db
 */
async function write(db) {
  await mkdir(dirname(databasePath), { recursive: true });
  const temp = databasePath + '.tmp';
  await writeFile(temp, JSON.stringify(db, null, 2));
  await rename(temp, databasePath);
}
/**
 * @template T
 * @param {(db: Database) => T} fn
 * @param {boolean} [mutate]
 * @returns {Promise<T>}
 */
export function transact(fn, mutate = false) {
  const task = queue.then(async () => {
    const db = await read();
    const result = fn(db);
    if (mutate) await write(db);
    return result;
  });
  queue = task.catch(() => {});
  return task;
}
export async function reset() {
  return transact((db) => {
    Object.assign(db, createDemoDatabase());
  }, true);
}
