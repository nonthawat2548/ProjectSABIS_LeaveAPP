/**
 * @typedef {import('../src/domain/types.js').Database} Database
 * @typedef {object} SqlClient
 * @property {(sql: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }>} query
 * @typedef {object} SqlConnectionFields
 * @property {() => void} release
 * @typedef {SqlClient & SqlConnectionFields} SqlConnection
 * @typedef {object} SqlPool
 * @property {() => Promise<SqlConnection>} connect
 * @typedef {object} CloudStore
 * @property {<T>(fn: (client: SqlClient) => Promise<T>, write?: boolean) => Promise<T>} transaction
 * @typedef {Exclude<keyof Database, 'schemaVersion'>} Collection
 * @typedef {object} Table
 * @property {string} table
 * @property {Collection} collection
 * @property {string[]} columns
 * @property {(string | null)[]} fields
 */
// @ts-check
import pg from 'pg';
import { DomainError } from '../src/domain/service.js';
/**
 * @param {string} name
 * @param {Collection} collection
 * @param {string[]} columns
 * @param {(string | null)[]} fields
 * @returns {Table}
 */
const table = (name, collection, columns, fields) => ({ table: name, collection, columns, fields });
/**
 * @type {Table[]}
 */
export const tables = [
  table(
    'employee',
    'employees',
    [
      'employee_id',
      'name',
      'gender',
      'email',
      'phone',
      'position',
      'role',
      'manager_id',
      'department',
      'active',
    ],
    [
      'id',
      'name',
      'gender',
      'email',
      'phone',
      'position',
      'role',
      'managerId',
      'department',
      'active',
    ],
  ),
  table(
    'leave_type',
    'leaveTypes',
    [
      'leave_type_id',
      'leave_type_name',
      'quota_scope',
      'default_quota_days',
      'day_count_basis',
      'advance_notice_days',
      'document_required_from_days',
      'required_document_type',
      'eligible_gender',
    ],
    [
      'id',
      'name',
      'quotaScope',
      'defaultQuotaDays',
      'dayCountBasis',
      'advanceNoticeDays',
      'documentRequiredFromDays',
      'requiredDocumentType',
      'eligibleGender',
    ],
  ),
  table(
    'leave_entitlement',
    'entitlements',
    ['entitlement_id', 'employee_id', 'leave_type_id', 'entitlement_year', 'granted_days'],
    ['id', 'employeeId', 'leaveTypeId', 'year', 'grantedDays'],
  ),
  table(
    'maternity_case',
    'maternityCases',
    ['maternity_case_id', 'employee_id', 'case_no', 'maximum_days'],
    ['id', 'employeeId', 'caseNo', 'maximumDays'],
  ),
  table(
    'leave_request',
    'requests',
    [
      'leave_id',
      'employee_id',
      'leave_type_id',
      'maternity_case_id',
      'start_date',
      'end_date',
      'reason',
      'request_date',
      'status',
      'duration',
      'version',
      'timeline_json',
    ],
    [
      'id',
      'employeeId',
      'leaveTypeId',
      'maternityCaseId',
      'startDate',
      'endDate',
      'reason',
      'requestDate',
      'status',
      'duration',
      'version',
      'timeline',
    ],
  ),
  table(
    'leave_day',
    'days',
    ['leave_day_id', 'leave_id', 'leave_date', 'entitlement_id', 'units'],
    ['id', 'leaveId', 'date', 'entitlementId', 'units'],
  ),
  table(
    'leave_document',
    'documents',
    [
      'document_id',
      'leave_id',
      'document_type',
      'file_name',
      'storage_key',
      'file_type',
      'file_size',
      'uploaded_at',
      'data_url',
    ],
    [
      'id',
      'leaveId',
      'documentType',
      'fileName',
      'storageKey',
      'fileType',
      'fileSize',
      'uploadedAt',
      'dataUrl',
    ],
  ),
  table(
    'leave_approval',
    'approvals',
    [
      'approval_id',
      'leave_id',
      'approver_id',
      'step_no',
      'review_role',
      'review_type',
      'status',
      'comment',
      'assigned_at',
      'reviewed_at',
      'cancelled',
    ],
    [
      'id',
      'leaveId',
      'approverId',
      'stepNo',
      'reviewRole',
      'reviewType',
      'status',
      'comment',
      'assignedAt',
      'reviewedAt',
      'cancelled',
    ],
  ),
  table(
    'work_status',
    'workStatuses',
    ['work_status_id', 'employee_id', 'status_date', 'status_type', 'leave_id', 'updated_at'],
    ['id', 'employeeId', 'date', 'statusType', null, 'updatedAt'],
  ),
  table(
    'app_notification',
    'notifications',
    ['notification_id', 'employee_id', 'leave_id', 'message', 'created_at', 'is_read'],
    ['id', 'employeeId', 'leaveId', 'text', 'createdAt', 'read'],
  ),
  table('app_holiday', 'holidays', ['holiday_date', 'name'], ['date', 'name']),
];
const numericFields = new Set([
  'id',
  'employeeId',
  'managerId',
  'leaveTypeId',
  'maternityCaseId',
  'leaveId',
  'approverId',
  'entitlementId',
  'caseNo',
  'maximumDays',
  'year',
  'grantedDays',
  'defaultQuotaDays',
  'advanceNoticeDays',
  'documentRequiredFromDays',
  'units',
  'version',
  'fileSize',
  'stepNo',
]);
const booleanFields = new Set(['active', 'cancelled', 'read']);
const dateFields = new Set(['date', 'startDate', 'endDate']);
/**
 * Documents are metadata here. Read their content only through authenticated part endpoints.
 *
 * @param {SqlClient} client
 * @param {boolean} [lock]
 * @returns {Promise<Database>}
 */
export async function loadDatabase(client, lock = false) {
  const db = /** @type {Database} */ ({ schemaVersion: 1 });
  for (const spec of tables) {
    const selections = spec.fields.flatMap((field, i) =>
      field === null
        ? []
        : [
            `${field === 'dataUrl' ? "''::text" : dateFields.has(field) ? spec.columns[i] + '::text' : spec.columns[i]} AS "${field}"`,
          ],
    );
    const { rows } = await client.query(
      `SELECT ${selections.join(',')} FROM leave_app.${spec.table} ORDER BY ${spec.columns[0]}${lock ? ' FOR UPDATE' : ''}`,
    );
    for (const row of rows)
      for (const [field, value] of Object.entries(row)) {
        if (value === null) continue;
        if (numericFields.has(field)) row[field] = Number(value);
        else if (booleanFields.has(field)) row[field] = Number(value) === 1;
        else if (value instanceof Date) row[field] = value.toISOString();
      }
    /** @type {unknown} */ (db[spec.collection]) = rows;
  }
  return db;
}
/**
 * Write only changed rows. Existing large document TEXT is never cleared by a metadata read.
 *
 * @param {SqlClient} client
 * @param {Database} previous
 * @param {Database} next
 * @returns {Promise<void>}
 */
export async function saveDatabase(client, previous, next) {
  /**
   * @type {Collection[]}
   */
  const deleteOrder = [
    'workStatuses',
    'notifications',
    'approvals',
    'documents',
    'days',
    'requests',
    'entitlements',
    'maternityCases',
    'employees',
    'leaveTypes',
    'holidays',
  ];
  for (const collection of deleteOrder) {
    const spec = /** @type {Table} */ (tables.find((item) => item.collection === collection));
    const key = /** @type {string} */ (spec.fields[0]);
    const nextKeys = new Set(
      /** @type {Record<string, unknown>[]} */ (/** @type {unknown} */ (next[collection])).map(
        (row) => row[key],
      ),
    );
    const removed = /** @type {Record<string, unknown>[]} */ (
      /** @type {unknown} */ (previous[collection])
    )
      .filter((row) => !nextKeys.has(row[key]))
      .map((row) => row[key]);
    if (removed.length)
      await client.query(
        `DELETE FROM leave_app.${spec.table} WHERE ${spec.columns[0]}=ANY($1::${collection === 'holidays' ? 'date' : 'integer'}[])`,
        [removed],
      );
  }
  for (const spec of tables) {
    const key = /** @type {string} */ (spec.fields[0]);
    const before = new Map(
      /** @type {Record<string, unknown>[]} */ (
        /** @type {unknown} */ (previous[spec.collection])
      ).map((row) => [row[key], JSON.stringify(row)]),
    );
    const rows = /** @type {Record<string, unknown>[]} */ (
      /** @type {unknown} */ ([...next[spec.collection]])
    );
    if (spec.collection === 'employees')
      rows.sort((a, b) => Number(a.managerId !== null) - Number(b.managerId !== null));
    for (const row of rows) {
      if (before.get(row[key]) === JSON.stringify(row)) continue;
      const values = spec.fields.map((field) =>
        field === null
          ? null
          : field === 'timeline'
            ? JSON.stringify(row[field])
            : booleanFields.has(field)
              ? row[field]
                ? 1
                : 0
              : row[field],
      );
      const placeholders = values.map((_, i) => '$' + (i + 1));
      const updates = spec.columns.slice(1).map((column) => `${column}=EXCLUDED.${column}`);
      await client.query(
        `INSERT INTO leave_app.${spec.table} (${spec.columns.join(',')}) VALUES (${placeholders.join(',')}) ON CONFLICT (${spec.columns[0]}) DO UPDATE SET ${updates.join(',')}`,
        values,
      );
    }
  }
}
/**
 * @type {pg.Pool | undefined}
 */
let pool;
/**
 * @returns {pg.Pool}
 */
export function postgresPool() {
  if (!pool) {
    const value = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!value)
      throw new DomainError(
        'ระบบยังไม่พร้อมเชื่อมต่อฐานข้อมูล กรุณาติดต่อผู้ดูแลระบบ',
        'UNAVAILABLE',
      );
    const url = new URL(value);
    // Keep certificate verification enabled; do not permit URL options to disable TLS validation.
    for (const field of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
      url.searchParams.delete(field);
    const ca = process.env.POSTGRES_SSL_CA;
    pool = new pg.Pool({
      connectionString: url.toString(),
      max: 2,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 10000,
      allowExitOnIdle: true,
      ssl: {
        rejectUnauthorized: true,
        ...(ca ? { ca: ca.replaceAll('\\n', '\n') } : {}),
      },
    });
    pool.on('error', (error) =>
      console.error('PostgreSQL pool error', {
        code: /** @type {NodeJS.ErrnoException} */ (error).code,
      }),
    );
  }
  return pool;
}
/**
 * @returns {Promise<void>}
 */
export async function closePostgresPool() {
  if (pool) {
    const previous = pool;
    pool = undefined;
    await previous.end();
  }
}
/**
 * @implements {CloudStore}
 */
export class PostgresStore {
  poolFactory;
  /**
   * @param {() => SqlPool} [poolFactory]
   */
  constructor(poolFactory = postgresPool) {
    this.poolFactory = poolFactory;
  }
  /**
   * @template T
   * @param {(client: SqlClient) => Promise<T>} fn
   * @param {boolean} [write]
   * @returns {Promise<T>}
   */
  async transaction(fn, write = false) {
    const client = await this.poolFactory().connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      if (write) await client.query('SELECT pg_advisory_xact_lock(1279607126,1)');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
