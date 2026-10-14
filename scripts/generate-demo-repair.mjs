import { writeFile } from 'node:fs/promises';
import { createDemoDatabase } from '../src/data/demoDatabase.js';
import { tables } from '../server/postgresStore.js';

const db = createDemoDatabase();
const ids = [1001, 1002, 1003];
const literal = (value) =>
  value == null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : typeof value === 'boolean'
        ? value
          ? '1'
          : '0'
        : `'${String(value).replaceAll("'", "''")}'`;
const lines = [
  '-- Targeted repair requested in codex_leave_app_fixes.md. Run after exporting affected rows.',
  '-- Keeps unrelated valid requests, accounts, granted quotas, policies and documents.',
  'BEGIN;',
  'SELECT pg_advisory_xact_lock(1279607126,1);',
  'DO $$ BEGIN',
];
for (const id of [1, 3, 4, 5, 6, 7]) {
  const person = db.employees.find((person) => person.id === id);
  lines.push(
    `IF NOT EXISTS (SELECT 1 FROM leave_app.employee WHERE employee_id=${id} AND email=${literal(person.email)}) THEN RAISE EXCEPTION 'Demo employee identity mismatch; repair cancelled'; END IF;`,
  );
}
for (const request of db.requests.filter((request) => ids.includes(request.id))) {
  lines.push(`IF NOT EXISTS (SELECT 1 FROM leave_app.leave_entitlement WHERE employee_id=${request.employeeId} AND leave_type_id=${request.leaveTypeId} AND entitlement_year=2026) THEN RAISE EXCEPTION 'Annual entitlement missing; repair cancelled'; END IF;`);
}
lines.push(
  "IF NOT EXISTS (SELECT 1 FROM leave_app.leave_type WHERE leave_type_id=3 AND leave_type_name='ลากิจ') THEN RAISE EXCEPTION 'Leave type mismatch; repair cancelled'; END IF; END $$;",
  `CREATE TEMP TABLE demo_repair_ids ON COMMIT DROP AS SELECT leave_id FROM leave_app.leave_request WHERE leave_id IN (1001,1002,1003) OR reason ~ 'ง่วง|8-090-9|วาสส|ไปนอนได้' OR timeline_json::text ~ 'ง่วง|8-090-9|วาสส|ไปนอนได้' UNION SELECT leave_id FROM leave_app.leave_approval WHERE comment ~ 'ง่วง|8-090-9|วาสส|ไปนอนได้';`,
  'DELETE FROM leave_app.app_notification WHERE leave_id IN (SELECT leave_id FROM demo_repair_ids);',
  'DELETE FROM leave_app.work_status WHERE leave_id IN (SELECT leave_id FROM demo_repair_ids);',
  'DELETE FROM leave_app.leave_approval WHERE leave_id IN (SELECT leave_id FROM demo_repair_ids);',
  'DELETE FROM leave_app.leave_document WHERE leave_id IN (SELECT leave_id FROM demo_repair_ids);',
  'DELETE FROM leave_app.leave_day WHERE leave_id IN (SELECT leave_id FROM demo_repair_ids);',
  'DELETE FROM leave_app.leave_request WHERE leave_id IN (SELECT leave_id FROM demo_repair_ids);',
  'UPDATE leave_app.employee SET manager_id=4 WHERE employee_id=5 AND manager_id IS NULL;',
);
for (const collection of ['requests', 'days', 'approvals', 'notifications']) {
  const table = tables.find((table) => table.collection === collection);
  for (const row of db[collection].filter((row) =>
    ids.includes(collection === 'requests' ? row.id : row.leaveId),
  )) {
    const values = table.fields.map((field, index) => {
      if (field === 'id' && collection !== 'requests')
        return `(SELECT COALESCE(MAX(${table.columns[0]}),0)+1 FROM leave_app.${table.table})`;
      if (field === 'entitlementId') {
        const request = db.requests.find((request) => request.id === row.leaveId);
        return `(SELECT entitlement_id FROM leave_app.leave_entitlement WHERE employee_id=${request.employeeId} AND leave_type_id=${request.leaveTypeId} AND entitlement_year=${Number(row.date.slice(0, 4))})`;
      }
      return literal(
        field === 'timeline'
          ? JSON.stringify(row[field])
          : field === null
            ? null
            : ['read', 'cancelled'].includes(field)
              ? Boolean(row[field])
              : row[field],
      );
    });
    lines.push(
      `INSERT INTO leave_app.${table.table} (${table.columns.join(',')}) VALUES (${values.join(',')});`,
    );
  }
}
lines.push(
  'COMMIT;',
  'SELECT r.leave_id,r.employee_id,r.leave_type_id,r.start_date,r.end_date,r.status,SUM(d.units) AS days FROM leave_app.leave_request r JOIN leave_app.leave_day d ON d.leave_id=r.leave_id WHERE r.leave_id IN (1001,1002,1003) GROUP BY r.leave_id ORDER BY r.leave_id;',
);
await writeFile(
  new URL('../database/supabase/repair-demo-records.sql', import.meta.url),
  lines.join('\n') + '\n',
);
console.log('Generated database/supabase/repair-demo-records.sql; no database connection used.');
