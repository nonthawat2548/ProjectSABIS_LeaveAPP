import { createDemoDatabase } from '../src/data/demoDatabase.js';

const testText = /ง่วง|8-090-9|วาสส|ไปนอนได้/;
const nextId = (rows) => Math.max(0, ...rows.map((row) => row.id)) + 1;

/** Replace only the requested sample records and identified disposable test requests. */
export function repairDemoRecords(database) {
  const source = createDemoDatabase();
  for (const id of [1, 3, 4, 5, 6, 7]) {
    const expected = source.employees.find((person) => person.id === id);
    if (database.employees.find((person) => person.id === id)?.email !== expected.email)
      throw new Error(
        'Employee identities differ from the ten-person demo; no records were changed.',
      );
  }
  const targetIds = new Set([1001, 1002, 1003]);
  for (const request of database.requests) {
    const comments = database.approvals
      .filter((step) => step.leaveId === request.id)
      .map((step) => step.comment);
    if (testText.test(JSON.stringify([request.reason, request.timeline, comments])))
      targetIds.add(request.id);
  }
  const db = structuredClone(database);
  db.requests = db.requests.filter((request) => !targetIds.has(request.id));
  for (const collection of ['days', 'documents', 'approvals', 'notifications', 'workStatuses'])
    db[collection] = db[collection].filter((row) => !targetIds.has(row.leaveId));
  db.requests.push(
    ...structuredClone(
      source.requests.filter((request) => [1001, 1002, 1003].includes(request.id)),
    ),
  );
  for (const collection of ['days', 'approvals', 'notifications']) {
    for (const row of source[collection].filter((row) =>
      [1001, 1002, 1003].includes(row.leaveId),
    )) {
      const copy = structuredClone(row);
      copy.id = nextId(db[collection]);
      if (collection === 'days') {
        const request = db.requests.find((request) => request.id === copy.leaveId);
        copy.entitlementId =
          db.entitlements.find(
            (entry) =>
              entry.employeeId === request.employeeId &&
              entry.leaveTypeId === request.leaveTypeId &&
              entry.year === Number(copy.date.slice(0, 4)),
          )?.id ?? null;
        if (!copy.entitlementId)
          throw new Error('The requested annual entitlement is missing; no records were changed.');
      }
      db[collection].push(copy);
    }
  }
  return { database: db, replacedRequestIds: [...targetIds].sort((a, b) => a - b) };
}
