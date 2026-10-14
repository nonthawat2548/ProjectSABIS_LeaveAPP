/**
 * @typedef {import('../src/domain/types.js').AttachmentInput} AttachmentInput
 * @typedef {import('../src/domain/types.js').Command} Command
 */
// @ts-check
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  actorById,
  applyCommand,
  canView,
  DomainError,
  visibleSnapshot,
} from '../src/domain/service.js';
import { DEMO_PASSWORD } from '../src/domain/seed.js';
import { findLoginAccount, LOGIN_ERROR } from '../src/domain/auth.js';
import { createDemoDatabase } from '../src/data/demoDatabase.js';
import { searchColleagues } from '../src/domain/colleagues.js';
import { employeeProfile, parseEmployeeProfileId } from '../src/domain/employeeProfile.js';
import {
  ALLOWED_ATTACHMENT_TYPES,
  CLOUD_PART_CHARACTERS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
  MAX_CLOUD_BODY_BYTES,
} from '../src/domain/attachments.js';
/**
 * @typedef {import('./postgresStore.js').CloudStore} CloudStore
 * @typedef {import('./postgresStore.js').SqlClient} SqlClient
 */
import { loadDatabase, saveDatabase } from './postgresStore.js';
/**
 * @param {string} message
 * @param {string} [code]
 * @returns {never}
 */
const fail = (message, code = 'VALIDATION') => {
  throw new DomainError(message, code);
};
/**
 * @param {string} value
 */
const hash = (value) => createHash('sha256').update(value).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * @param {Request} request
 * @returns {string | null}
 */
function token(request) {
  const value = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('leave_session='))
    ?.slice(14);
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}
/**
 * @param {string} value
 * @param {Request} request
 * @param {boolean} [clear]
 * @returns {string}
 */
function cookie(value, request, clear = false) {
  return `leave_session=${value}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${clear ? 0 : 28800}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
/**
 * @param {SqlClient} client
 * @param {Request} request
 * @returns {Promise<number>}
 */
async function authenticate(client, request) {
  const value = token(request) ?? fail('กรุณาเข้าสู่ระบบ', 'UNAUTHENTICATED');
  const { rows } = await client.query(
    'SELECT s.employee_id FROM leave_app.app_session s JOIN leave_app.employee e ON e.employee_id=s.employee_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP AND e.active=1',
    [hash(value)],
  );
  if (!rows[0]) fail('กรุณาเข้าสู่ระบบอีกครั้ง', 'UNAUTHENTICATED');
  return Number(rows[0].employee_id);
}
/**
 * @param {Request} request
 * @param {number} [limit]
 * @returns {Promise<any>}
 */
async function body(request, limit = 64 * 1024) {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > limit)
    fail('ข้อมูลในคำขอใหญ่เกินไป', 'PAYLOAD_TOO_LARGE');
  const reader = request.body?.getReader(),
    parts = [];
  let bytes = 0;
  try {
    if (reader)
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > limit) {
          await reader.cancel();
          fail('ข้อมูลในคำขอใหญ่เกินไป', 'PAYLOAD_TOO_LARGE');
        }
        parts.push(value);
      }
    const text = Buffer.concat(parts, bytes).toString('utf8');
    try {
      return JSON.parse(text || '{}');
    } catch {
      fail('JSON ไม่ถูกต้อง');
    }
  } finally {
    reader?.releaseLock();
  }
}
/**
 * @param {unknown} data
 * @param {number} [status]
 * @param {Record<string, string>} [headers]
 * @returns {Response}
 */
function send(data, status = 200, headers = {}) {
  const json = JSON.stringify(data);
  if (Buffer.byteLength(json) > MAX_CLOUD_BODY_BYTES)
    fail('ข้อมูลสำหรับแสดงผลมีขนาดใหญ่เกินไป กรุณาติดต่อผู้ดูแลระบบ', 'PAYLOAD_TOO_LARGE');
  return new Response(json, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}
/**
 * @param {Request} request
 * @returns {void}
 */
function checkOrigin(request) {
  if (['GET', 'HEAD'].includes(request.method)) return;
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    fail('ไม่อนุญาตให้ทำรายการจากเว็บไซต์อื่น', 'FORBIDDEN');
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    fail('ไม่อนุญาตให้ทำรายการจากเว็บไซต์อื่น', 'FORBIDDEN');
}
/**
 * @param {any} input
 * @returns {{ fileName: string; fileType: string; fileSize: number; encodedLength: number; }}
 */
function uploadMetadata(input) {
  if (
    !input ||
    typeof input.fileName !== 'string' ||
    !input.fileName.trim() ||
    input.fileName.length > 255 ||
    !(/** @type {readonly unknown[]} */ (ALLOWED_ATTACHMENT_TYPES).includes(input.fileType)) ||
    !Number.isInteger(input.fileSize) ||
    input.fileSize < 1 ||
    input.fileSize > MAX_ATTACHMENT_BYTES ||
    input.encodedLength !== 4 * Math.ceil(input.fileSize / 3)
  )
    fail(`เอกสารต้องเป็น PDF, JPG หรือ PNG ขนาดไม่เกิน ${MAX_ATTACHMENT_LABEL}`);
  return input;
}
/**
 * @param {SqlClient} client
 * @param {string} id
 * @param {number} actorId
 */
async function ownedUpload(client, id, actorId) {
  if (!uuid.test(id)) fail('ไม่พบไฟล์ที่กำลังอัปโหลด', 'NOT_FOUND');
  const { rows } = await client.query(
    'SELECT * FROM leave_app.app_upload WHERE upload_id=$1 AND employee_id=$2 AND expires_at>CURRENT_TIMESTAMP FOR UPDATE',
    [id, actorId],
  );
  return rows[0] ?? fail('ไม่พบไฟล์ที่กำลังอัปโหลด หรือหมดเวลาแล้ว', 'NOT_FOUND');
}
/**
 * @param {SqlClient} client
 * @param {any} input
 * @param {number} actorId
 * @returns {Promise<AttachmentInput>}
 */
async function resolveAttachment(client, input, actorId) {
  // Invalid/foreign upload references become invalid attachment data, so domain eligibility
  // (gender -> case -> manager -> dates -> policy) still runs before attachment validation.
  const invalid = {
    fileName: 'เอกสาร',
    fileType: 'application/octet-stream',
    fileSize: 0,
    dataUrl: '',
  };
  if (!input || typeof input.uploadId !== 'string' || !uuid.test(input.uploadId)) return invalid;
  const { rows } = await client.query(
    'SELECT * FROM leave_app.app_upload WHERE upload_id=$1 AND employee_id=$2 AND expires_at>CURRENT_TIMESTAMP FOR UPDATE',
    [input.uploadId, actorId],
  );
  if (!rows[0]) return invalid;
  const upload = rows[0];
  const parts = await client.query(
    'SELECT part_no,encoded_data FROM leave_app.app_upload_part WHERE upload_id=$1 ORDER BY part_no',
    [input.uploadId],
  );
  const count = Math.ceil(Number(upload.encoded_length) / CLOUD_PART_CHARACTERS);
  if (
    parts.rows.length !== count ||
    parts.rows.some((part, index) => Number(part.part_no) !== index)
  )
    return invalid;
  const encoded = parts.rows.map((part) => part.encoded_data).join('');
  if (encoded.length !== Number(upload.encoded_length)) return invalid;
  return {
    fileName: upload.file_name,
    fileType: upload.file_type,
    fileSize: Number(upload.file_size),
    dataUrl: `data:${upload.file_type};base64,${encoded}`,
  };
}
/**
 * @param {SqlClient} client
 * @param {number} actorId
 * @param {number} id
 */
async function scopedDocument(client, actorId, id) {
  const db = await loadDatabase(client);
  const actor = actorById(db, actorId);
  const document = db.documents.find((item) => item.id === id) ?? fail('ไม่พบเอกสาร', 'NOT_FOUND');
  const request =
    db.requests.find((item) => item.id === document.leaveId) ?? fail('ไม่พบคำขอ', 'NOT_FOUND');
  if (!canView(db, actor, request)) fail('คุณไม่มีสิทธิ์อ่านเอกสารนี้', 'FORBIDDEN');
  return document;
}
/**
 * @param {CloudStore} store
 * @param {{ demoLogin?: boolean; now?: () => Date }} [options]
 * @returns {(request: Request) => Promise<Response>}
 */
export function createCloudHandler(store, options = {}) {
  const now = () => options.now?.() ?? new Date();
  return async (request) => {
    try {
      const url = new URL(request.url);
      // Vercel rewrite preserves the original endpoint in this server-controlled route query.
      const endpoint =
        url.pathname === '/api/router'
          ? (url.searchParams.get('endpoint') ?? '')
          : url.pathname.replace(/^\/api\/?/, '');
      const path = '/' + endpoint.replace(/^\/+|\/+$/g, '');
      const method = request.method;
      checkOrigin(request);
      if (path === '/health' && method === 'GET') {
        await store.transaction(async (client) => {
          const { rows } = await client.query(
            "SELECT to_regclass('leave_app.app_session') AS sessions,to_regclass('leave_app.app_upload_part') AS uploads,to_regclass('leave_app.employee') AS employees",
          );
          if (!rows[0]?.sessions || !rows[0]?.uploads || !rows[0]?.employees)
            fail('ระบบยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ', 'UNAVAILABLE');
        });
        return send({
          status: 'ok',
          mode: 'cloud-postgres',
          documentTransport: 'parts-v1',
          partCharacters: CLOUD_PART_CHARACTERS,
        });
      }
      if (path === '/session' && method === 'POST') {
        if (!(options.demoLogin ?? process.env.ENABLE_DEMO_LOGIN === 'true'))
          fail('บัญชีทดลองยังไม่เปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ', 'UNAVAILABLE');
        const input = await body(request);
        if (
          !input ||
          typeof input.email !== 'string' ||
          input.email.length > 255 ||
          input.password !== DEMO_PASSWORD
        )
          fail(LOGIN_ERROR, 'UNAUTHENTICATED');
        const value = randomBytes(32).toString('hex');
        const employee = await store.transaction(async (client) => {
          const db = await loadDatabase(client, true);
          const employee =
            findLoginAccount(db.employees, input.email) ?? fail(LOGIN_ERROR, 'UNAUTHENTICATED');
          if (!employee.active) fail(LOGIN_ERROR, 'UNAUTHENTICATED');
          const old = token(request);
          if (old)
            await client.query('DELETE FROM leave_app.app_session WHERE token_hash=$1', [
              hash(old),
            ]);
          await client.query(
            'DELETE FROM leave_app.app_session WHERE expires_at<=CURRENT_TIMESTAMP',
          );
          await client.query(
            'INSERT INTO leave_app.app_session(token_hash,employee_id,expires_at) VALUES ($1,$2,$3)',
            [hash(value), employee.id, new Date(Date.now() + 8 * 3600000).toISOString()],
          );
          return employee;
        }, true);
        return send({ employee }, 200, {
          'Set-Cookie': cookie(value, request),
        });
      }
      if (path === '/session' && method === 'DELETE') {
        const value = token(request);
        if (value)
          await store.transaction(async (client) => {
            await client.query('DELETE FROM leave_app.app_session WHERE token_hash=$1', [
              hash(value),
            ]);
          }, true);
        return send({ message: 'ออกจากระบบแล้ว' }, 200, {
          'Set-Cookie': cookie('', request, true),
        });
      }
      // Authenticate before reading a command/file body, and recheck inside its write transaction.
      await store.transaction((client) => authenticate(client, request));
      if (path === '/session' && method === 'GET')
        return send({
          employee: await store.transaction(async (client) =>
            actorById(await loadDatabase(client), await authenticate(client, request)),
          ),
        });
      if (path === '/snapshot' && method === 'GET') {
        const data = await store.transaction(async (client) => {
          const id = await authenticate(client, request),
            db = await loadDatabase(client),
            data = visibleSnapshot(db, id);
          data.documents.forEach((doc) => {
            doc.remote = true;
          });
          return data;
        });
        return send(data);
      }
      if (path === '/colleagues' && method === 'GET')
        return send(
          await store.transaction(async (client) =>
            searchColleagues(
              await loadDatabase(client),
              await authenticate(client, request),
              url.searchParams.get('query') ?? '',
              url.searchParams.get('date') ?? '',
            ),
          ),
        );
      if (path === '/employee-profile' && method === 'GET')
        return send(
          await store.transaction(async (client) =>
            employeeProfile(
              await loadDatabase(client),
              await authenticate(client, request),
              parseEmployeeProfileId(url.searchParams.get('employeeId')),
            ),
          ),
        );
      if (path === '/commands' && method === 'POST') {
        const input = await body(request, MAX_CLOUD_BODY_BYTES);
        if (!input || typeof input !== 'object' || typeof input.type !== 'string')
          fail('คำสั่งไม่ถูกต้อง');
        const result = await store.transaction(async (client) => {
          const id = await authenticate(client, request),
            db = await loadDatabase(client, true),
            before = structuredClone(db);
          const reference =
            (input.type === 'submit' || input.type === 'edit') && input.input?.attachment;
          const uploadId =
            reference && typeof reference === 'object' && 'uploadId' in reference
              ? reference.uploadId
              : null;
          if (reference && typeof reference === 'object' && 'uploadId' in reference)
            input.input.attachment = await resolveAttachment(client, reference, id);
          const result = applyCommand(db, id, /** @type {Command} */ (input), now());
          for (const document of db.documents)
            if (document.dataUrl) document.storageKey = `cloud/${document.id}`;
          await saveDatabase(client, before, db);
          if (typeof uploadId === 'string' && uuid.test(uploadId))
            await client.query(
              'DELETE FROM leave_app.app_upload WHERE upload_id=$1 AND employee_id=$2',
              [uploadId, id],
            );
          return result;
        }, true);
        return send(result);
      }
      if (path === '/demo/reset' && method === 'POST') {
        await store.transaction(async (client) => {
          const id = await authenticate(client, request),
            db = await loadDatabase(client, true);
          if (actorById(db, id).role !== 'HR') fail('เฉพาะ HR เท่านั้น', 'FORBIDDEN');
          await client.query('DELETE FROM leave_app.app_upload');
          const replacement = createDemoDatabase();
          await client.query(
            'DELETE FROM leave_app.app_session WHERE NOT(employee_id=ANY($1::integer[]))',
            [replacement.employees.map((employee) => employee.id)],
          );
          await saveDatabase(client, db, replacement);
        }, true);
        return send({ message: 'คืนค่าข้อมูลจำลองแล้ว' });
      }
      if (path === '/uploads' && method === 'POST') {
        const input = uploadMetadata(await body(request));
        const uploadId = randomUUID();
        await store.transaction(async (client) => {
          const actorId = await authenticate(client, request),
            actor = actorById(await loadDatabase(client), actorId);
          if (!['Employee', 'Manager', 'HR'].includes(actor.role))
            fail('เฉพาะผู้ยื่นคำขอที่เข้าสู่ระบบเท่านั้น', 'FORBIDDEN');
          await client.query(
            'DELETE FROM leave_app.app_upload WHERE expires_at<=CURRENT_TIMESTAMP',
          );
          const { rows } = await client.query(
            'SELECT count(*)::integer AS count FROM leave_app.app_upload WHERE employee_id=$1',
            [actorId],
          );
          if (Number(rows[0].count) >= 3)
            fail('มีไฟล์ที่กำลังอัปโหลดอยู่ กรุณารอหรือยกเลิกไฟล์เดิม', 'CONFLICT');
          await client.query(
            'INSERT INTO leave_app.app_upload(upload_id,employee_id,file_name,file_type,file_size,encoded_length,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [
              uploadId,
              actorId,
              input.fileName,
              input.fileType,
              input.fileSize,
              input.encodedLength,
              new Date(Date.now() + 3600000).toISOString(),
            ],
          );
        }, true);
        return send({ uploadId, partCharacters: CLOUD_PART_CHARACTERS });
      }
      const uploadMatch = path.match(/^\/uploads\/([^/]+)(?:\/parts\/(\d+))?$/);
      if (uploadMatch && method === 'DELETE' && uploadMatch[2] === undefined) {
        await store.transaction(async (client) => {
          const id = await authenticate(client, request);
          await ownedUpload(client, uploadMatch[1], id);
          await client.query(
            'DELETE FROM leave_app.app_upload WHERE upload_id=$1 AND employee_id=$2',
            [uploadMatch[1], id],
          );
        }, true);
        return send({ message: 'ยกเลิกการอัปโหลดแล้ว' });
      }
      if (uploadMatch && method === 'PUT' && uploadMatch[2] !== undefined) {
        const input = await body(request, MAX_CLOUD_BODY_BYTES),
          part = Number(uploadMatch[2]);
        await store.transaction(async (client) => {
          const actorId = await authenticate(client, request),
            upload = await ownedUpload(client, uploadMatch[1], actorId);
          const remaining = Number(upload.encoded_length) - part * CLOUD_PART_CHARACTERS,
            expected = Math.min(CLOUD_PART_CHARACTERS, remaining),
            last = remaining <= CLOUD_PART_CHARACTERS;
          if (
            !Number.isSafeInteger(part) ||
            part < 0 ||
            remaining <= 0 ||
            !input ||
            typeof input.data !== 'string' ||
            input.data.length !== expected ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data) ||
            (!last && input.data.includes('='))
          )
            fail('ส่วนของไฟล์ไม่ถูกต้อง');
          await client.query(
            'INSERT INTO leave_app.app_upload_part(upload_id,part_no,encoded_data) VALUES ($1,$2,$3) ON CONFLICT(upload_id,part_no) DO UPDATE SET encoded_data=EXCLUDED.encoded_data',
            [uploadMatch[1], part, input.data],
          );
        }, true);
        return send({ part });
      }
      const docMatch = path.match(/^\/documents\/(\d+)(?:\/parts\/(\d+))?$/);
      if (docMatch && method === 'GET') {
        const id = Number(docMatch[1]);
        if (!Number.isSafeInteger(id)) fail('ไม่พบเอกสาร', 'NOT_FOUND');
        return send(
          await store.transaction(async (client) => {
            const actorId = await authenticate(client, request),
              document = await scopedDocument(client, actorId, id);
            if (docMatch[2] === undefined) {
              const { rows } = await client.query(
                'SELECT length(data_url) AS length FROM leave_app.leave_document WHERE document_id=$1',
                [id],
              );
              return {
                ...document,
                remote: true,
                totalCharacters: Number(rows[0].length),
                partCharacters: CLOUD_PART_CHARACTERS,
              };
            }
            const part = Number(docMatch[2]);
            if (!Number.isSafeInteger(part) || part < 0 || part > 67)
              fail('ส่วนของเอกสารไม่ถูกต้อง');
            const { rows } = await client.query(
              'SELECT substring(data_url FROM $2::integer FOR $3::integer) AS data FROM leave_app.leave_document WHERE document_id=$1',
              [id, part * CLOUD_PART_CHARACTERS + 1, CLOUD_PART_CHARACTERS],
            );
            if (!rows[0].data) fail('ไม่พบส่วนของเอกสาร', 'NOT_FOUND');
            return { part, data: rows[0].data };
          }),
        );
      }
      return send({ message: 'ไม่พบ API นี้', code: 'NOT_FOUND' }, 404);
    } catch (error) {
      const problem =
        error instanceof DomainError
          ? error
          : new DomainError('ไม่สามารถทำรายการได้ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ', 'SERVER');
      if (!(error instanceof DomainError))
        console.error('Cloud API error', {
          code: /** @type {NodeJS.ErrnoException} */ (error)?.code,
        });
      const status =
        /** @type {Record<string, number>} */ ({
          UNAUTHENTICATED: 401,
          FORBIDDEN: 403,
          NOT_FOUND: 404,
          CONFLICT: 409,
          PAYLOAD_TOO_LARGE: 413,
          UNAVAILABLE: 503,
          SERVER: 500,
        })[problem.code] ?? 400;
      return send({ message: problem.message, code: problem.code }, status);
    }
  };
}
