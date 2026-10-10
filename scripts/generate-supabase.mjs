import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = resolve(root, 'src/data/leave-management-10-people.json');
const schemaPath = resolve(root, 'database/schema.sql');
export const outputPath = resolve(root, 'database/supabase/setup-10-people.sql');

// Keep the original dictionary column names; PostgreSQL folds unquoted names to lower case.
export const mappings = [
  ['Employee', 'employees', ['Employee_id','Name','Gender','Email','Phone','Position','Role','Manager_id','Department','Active'], ['id','name','gender','email','phone','position','role','managerId','department','active']],
  ['Leave_Type', 'leaveTypes', ['Leave_type_id','Leave_type_name','Quota_scope','Default_quota_days','Day_count_basis','Advance_notice_days','Document_required_from_days','Required_document_type','Eligible_gender'], ['id','name','quotaScope','defaultQuotaDays','dayCountBasis','advanceNoticeDays','documentRequiredFromDays','requiredDocumentType','eligibleGender']],
  ['Leave_Entitlement', 'entitlements', ['Entitlement_id','Employee_id','Leave_type_id','Entitlement_year','Granted_days'], ['id','employeeId','leaveTypeId','year','grantedDays']],
  ['Maternity_Case', 'maternityCases', ['Maternity_case_id','Employee_id','Case_no','Maximum_days'], ['id','employeeId','caseNo','maximumDays']],
  ['Leave_Request', 'requests', ['Leave_id','Employee_id','Leave_type_id','Maternity_case_id','Start_date','End_date','Reason','Request_date','Status','Duration','Version','Timeline_json'], ['id','employeeId','leaveTypeId','maternityCaseId','startDate','endDate','reason','requestDate','status','duration','version','timeline']],
  ['Leave_Day', 'days', ['Leave_day_id','Leave_id','Leave_date','Entitlement_id','Units'], ['id','leaveId','date','entitlementId','units']],
  ['Leave_Document', 'documents', ['Document_id','Leave_id','Document_type','File_name','Storage_key','File_type','File_size','Uploaded_at','Data_url'], ['id','leaveId','documentType','fileName','storageKey','fileType','fileSize','uploadedAt','dataUrl']],
  ['Leave_Approval', 'approvals', ['Approval_id','Leave_id','Approver_id','Step_no','Review_role','Review_type','Status','Comment','Assigned_at','Reviewed_at','Cancelled'], ['id','leaveId','approverId','stepNo','reviewRole','reviewType','status','comment','assignedAt','reviewedAt','cancelled']],
  ['Work_Status', 'workStatuses', ['Work_status_id','Employee_id','Status_date','Status_type','Leave_id','Updated_at'], ['id','employeeId','date','statusType',null,'updatedAt']],
  ['App_Notification', 'notifications', ['Notification_id','Employee_id','Leave_id','Message','Created_at','Is_read'], ['id','employeeId','leaveId','text','createdAt','read']],
  ['App_Holiday', 'holidays', ['Holiday_date','Name'], ['date','name']],
];

function literal(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid numeric seed value');
    return String(value);
  }
  if (value === undefined) throw new Error('Missing seed field');
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return "'" + text.replaceAll("'", "''") + "'";
}

export function buildSupabaseSql(source = JSON.parse(readFileSync(sourcePath, 'utf8'))) {
  if (source.schemaVersion !== 1) throw new Error('Unsupported source schema version');
  let schema = readFileSync(schemaPath, 'utf8').replaceAll('\r\n', '\n');
  for (const marker of ['PRAGMA foreign_keys = ON;', ' UNIQUE COLLATE NOCASE', "Timeline_json TEXT NOT NULL DEFAULT '[]'", 'CREATE VIEW Maternity_Case_Balance AS']) {
    if (!schema.includes(marker)) throw new Error(`Reference schema changed; review PostgreSQL conversion: ${marker}`);
  }
  schema = schema
    .replace(/^-- SQLite starter schema.*\n/, '-- PostgreSQL schema derived from database/schema.sql.\n')
    .replace('PRAGMA foreign_keys = ON;', '')
    .replace(' UNIQUE COLLATE NOCASE', ' UNIQUE')
    .replace(/\bTIMESTAMP\b/g, 'TIMESTAMPTZ')
    .replace("Timeline_json TEXT NOT NULL DEFAULT '[]'", "Timeline_json JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(Timeline_json) = 'array')")
    .replace(/(CREATE VIEW \w+) AS/g, '$1 WITH (security_invoker = true) AS');
  if (/\bPRAGMA\b|COLLATE NOCASE/.test(schema)) throw new Error('Unconverted SQLite syntax');

  // Managers must exist before the employees who reference them.
  const inserts = mappings.flatMap(([table, collection, columns, keys]) => {
    const rows = table === 'Employee'
      ? [...source[collection]].sort((a,b) => Number(a.managerId !== null) - Number(b.managerId !== null))
      : source[collection];
    return rows.map(row => {
      const values = keys.map(key => literal(key === null ? null : key === 'cancelled' ? row[key] ?? false : row[key]));
      return `INSERT INTO ${table} (${columns.join(',')}) VALUES (${values.join(',')});`;
    });
  }).join('\n');
  const protection = mappings.map(([table]) => `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`).join('\n');
  return `-- Generated by node scripts/generate-supabase.mjs; fictional data from src/data/leave-management-10-people.json.
-- Run once in Supabase SQL Editor. Requires PostgreSQL 15+ and an unused leave_app schema.
-- This prepares storage only; it does not connect the frontend, create Auth users, or migrate device data.
-- A repeat run fails without deleting or replacing existing data. Do not add DROP/TRUNCATE to retry.
BEGIN;
SET LOCAL standard_conforming_strings = on;
SET LOCAL TIME ZONE 'UTC';
CREATE SCHEMA leave_app;
SET LOCAL search_path = leave_app, pg_catalog;
${schema}
-- Match the existing case-insensitive email lookup without requiring an extension.
CREATE UNIQUE INDEX employee_email_lower_unique ON Employee (lower(Email));
-- No browser-facing grants or policies. The future server must verify identity, role and assignment.
REVOKE ALL ON SCHEMA leave_app FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA leave_app FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA leave_app REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
${protection}
${inserts}
COMMIT;
SELECT Role, count(*) AS employee_count FROM leave_app.Employee GROUP BY Role ORDER BY Role;
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buildSupabaseSql(), 'utf8');
  console.log('Created database/supabase/setup-10-people.sql; runtime databases were not changed.');
}
