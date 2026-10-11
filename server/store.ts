import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createDemoDatabase } from '../src/data/demoDatabase';
import type { Database } from '../src/domain/types';
export const databasePath = resolve(
  process.env.MOCK_DATA_FILE || 'server/data/leave-management-10-people.json',
);
let queue: Promise<unknown> = Promise.resolve();
async function read(): Promise<Database> {
  try {
    const db = JSON.parse(await readFile(databasePath, 'utf8'));
    if (db.schemaVersion !== 1) throw new Error('Unsupported database schema');
    return db;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return createDemoDatabase();
    throw e;
  }
}
async function write(db: Database) {
  await mkdir(dirname(databasePath), { recursive: true });
  const temp = databasePath + '.tmp';
  await writeFile(temp, JSON.stringify(db, null, 2));
  await rename(temp, databasePath);
}
export function transact<T>(fn: (db: Database) => T, mutate = false): Promise<T> {
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
