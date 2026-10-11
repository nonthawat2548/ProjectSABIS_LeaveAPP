import pg from 'pg';
import type { Database } from '../src/domain/types';
import { DomainError } from '../src/domain/service.js';

export interface SqlClient { query(sql: string, values?: unknown[]): Promise<{rows: Record<string, any>[]}> }
export interface SqlConnection extends SqlClient { release(): void }
export interface SqlPool { connect(): Promise<SqlConnection> }
export interface CloudStore { transaction<T>(fn: (client: SqlClient) => Promise<T>, write?: boolean): Promise<T> }
type Collection = Exclude<keyof Database, 'schemaVersion'>;
interface Table { table: string; collection: Collection; columns: string[]; fields: (string|null)[] }
const table = (name: string, collection: Collection, columns: string[], fields: (string|null)[]): Table => ({table:name,collection,columns,fields});
export const tables: Table[] = [
 table('employee','employees',['employee_id','name','gender','email','phone','position','role','manager_id','department','active'],['id','name','gender','email','phone','position','role','managerId','department','active']),
 table('leave_type','leaveTypes',['leave_type_id','leave_type_name','quota_scope','default_quota_days','day_count_basis','advance_notice_days','document_required_from_days','required_document_type','eligible_gender'],['id','name','quotaScope','defaultQuotaDays','dayCountBasis','advanceNoticeDays','documentRequiredFromDays','requiredDocumentType','eligibleGender']),
 table('leave_entitlement','entitlements',['entitlement_id','employee_id','leave_type_id','entitlement_year','granted_days'],['id','employeeId','leaveTypeId','year','grantedDays']),
 table('maternity_case','maternityCases',['maternity_case_id','employee_id','case_no','maximum_days'],['id','employeeId','caseNo','maximumDays']),
 table('leave_request','requests',['leave_id','employee_id','leave_type_id','maternity_case_id','start_date','end_date','reason','request_date','status','duration','version','timeline_json'],['id','employeeId','leaveTypeId','maternityCaseId','startDate','endDate','reason','requestDate','status','duration','version','timeline']),
 table('leave_day','days',['leave_day_id','leave_id','leave_date','entitlement_id','units'],['id','leaveId','date','entitlementId','units']),
 table('leave_document','documents',['document_id','leave_id','document_type','file_name','storage_key','file_type','file_size','uploaded_at','data_url'],['id','leaveId','documentType','fileName','storageKey','fileType','fileSize','uploadedAt','dataUrl']),
 table('leave_approval','approvals',['approval_id','leave_id','approver_id','step_no','review_role','review_type','status','comment','assigned_at','reviewed_at','cancelled'],['id','leaveId','approverId','stepNo','reviewRole','reviewType','status','comment','assignedAt','reviewedAt','cancelled']),
 table('work_status','workStatuses',['work_status_id','employee_id','status_date','status_type','leave_id','updated_at'],['id','employeeId','date','statusType',null,'updatedAt']),
 table('app_notification','notifications',['notification_id','employee_id','leave_id','message','created_at','is_read'],['id','employeeId','leaveId','text','createdAt','read']),
 table('app_holiday','holidays',['holiday_date','name'],['date','name']),
];
const numericFields = new Set(['id','employeeId','managerId','leaveTypeId','maternityCaseId','leaveId','approverId','entitlementId','caseNo','maximumDays','year','grantedDays','defaultQuotaDays','advanceNoticeDays','documentRequiredFromDays','units','version','fileSize','stepNo']);
const booleanFields = new Set(['active','cancelled','read']);
const dateFields = new Set(['date','startDate','endDate']);

/** Documents are metadata here. Read their content only through authenticated part endpoints. */
export async function loadDatabase(client: SqlClient, lock = false): Promise<Database> {
 const db = {schemaVersion:1} as Database;
 for (const spec of tables) {
  const selections = spec.fields.flatMap((field,i) => field === null ? [] : [`${field === 'dataUrl' ? "''::text" : dateFields.has(field) ? spec.columns[i]+'::text' : spec.columns[i]} AS "${field}"`]);
  const {rows} = await client.query(`SELECT ${selections.join(',')} FROM leave_app.${spec.table} ORDER BY ${spec.columns[0]}${lock?' FOR UPDATE':''}`);
  for (const row of rows) for (const [field,value] of Object.entries(row)) {
   if (value === null) continue;
   if (numericFields.has(field)) row[field] = Number(value);
   else if (booleanFields.has(field)) row[field] = Number(value) === 1;
   else if (value instanceof Date) row[field] = value.toISOString();
  }
  (db[spec.collection] as unknown) = rows;
 }
 return db;
}

/** Write only changed rows. Existing large document TEXT is never cleared by a metadata read. */
export async function saveDatabase(client: SqlClient, previous: Database, next: Database): Promise<void> {
 const deleteOrder: Collection[] = ['workStatuses','notifications','approvals','documents','days','requests','entitlements','maternityCases','employees','leaveTypes','holidays'];
 for (const collection of deleteOrder) {
  const spec = tables.find(item=>item.collection===collection)!;
  const key = spec.fields[0]!;
  const nextKeys = new Set((next[collection] as unknown as Record<string,unknown>[]).map(row=>row[key]));
  const removed = (previous[collection] as unknown as Record<string,unknown>[]).filter(row=>!nextKeys.has(row[key])).map(row=>row[key]);
  if (removed.length) await client.query(`DELETE FROM leave_app.${spec.table} WHERE ${spec.columns[0]}=ANY($1::${collection==='holidays'?'date':'integer'}[])`,[removed]);
 }
 for (const spec of tables) {
  const key = spec.fields[0]!;
  const before = new Map((previous[spec.collection] as unknown as Record<string,unknown>[]).map(row=>[row[key],JSON.stringify(row)]));
  const rows = [...next[spec.collection]] as unknown as Record<string,unknown>[];
  if (spec.collection==='employees') rows.sort((a,b)=>Number(a.managerId!==null)-Number(b.managerId!==null));
  for (const row of rows) {
   if (before.get(row[key])===JSON.stringify(row)) continue;
   const values = spec.fields.map(field=>field===null?null:field==='timeline'?JSON.stringify(row[field]):booleanFields.has(field)?(row[field]?1:0):row[field]);
   const placeholders = values.map((_,i)=>'$'+(i+1));
   const updates = spec.columns.slice(1).map(column=>`${column}=EXCLUDED.${column}`);
   await client.query(`INSERT INTO leave_app.${spec.table} (${spec.columns.join(',')}) VALUES (${placeholders.join(',')}) ON CONFLICT (${spec.columns[0]}) DO UPDATE SET ${updates.join(',')}`,values);
  }
 }
}

let pool: pg.Pool|undefined;
export function postgresPool(): pg.Pool {
 if (!pool) {
  const value = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!value) throw new DomainError('ระบบยังไม่พร้อมเชื่อมต่อฐานข้อมูล กรุณาติดต่อผู้ดูแลระบบ','UNAVAILABLE');
  const url = new URL(value);
  // Keep certificate verification enabled; do not permit URL options to disable TLS validation.
  for (const field of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(field);
  const ca = process.env.POSTGRES_SSL_CA;
  pool = new pg.Pool({connectionString:url.toString(),max:2,connectionTimeoutMillis:15000,idleTimeoutMillis:10000,allowExitOnIdle:true,ssl:{rejectUnauthorized:true,...(ca?{ca:ca.replaceAll('\\n','\n')}:{})}});
  pool.on('error',error=>console.error('PostgreSQL pool error',{code:(error as NodeJS.ErrnoException).code}));
 }
 return pool;
}
export async function closePostgresPool(): Promise<void> {if(pool){const previous=pool;pool=undefined;await previous.end();}}
export class PostgresStore implements CloudStore {
 constructor(private readonly poolFactory:()=>SqlPool=postgresPool) {}
 async transaction<T>(fn:(client:SqlClient)=>Promise<T>,write=false):Promise<T> {
  const client = await this.poolFactory().connect();
  try {
   await client.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   if (write) await client.query('SELECT pg_advisory_xact_lock(1279607126,1)');
   const result = await fn(client);
   await client.query('COMMIT');
   return result;
  } catch (error) { await client.query('ROLLBACK').catch(()=>{}); throw error }
  finally { client.release(); }
 }
}
