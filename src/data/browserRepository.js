import { DEMO_PASSWORD } from '../domain/seed.js';
import { findLoginAccount, LOGIN_ERROR } from '../domain/auth.js';
import { actorById, applyCommand, DomainError, visibleSnapshot } from '../domain/service.js';
import {
  createDemoDatabase,
  DEMO_DATASET_ID,
  DEMO_SESSION_KEY,
  DEMO_DATA_CHANNEL,
} from './demoDatabase.js';
import { searchColleagues } from '../domain/colleagues.js';
import { employeeProfile } from '../domain/employeeProfile.js';
const DB_NAME = DEMO_DATASET_ID,
  STORE = 'database',
  KEY = 'state',
  SESSION = DEMO_SESSION_KEY;
const DOCUMENT_MANIFEST = 'document-chunks',
  CHUNK_CHARACTERS = 4 * 1024 * 1024;
const INLINE_DOCUMENT_CHARACTERS = 1024 * 1024,
  INLINE_TOTAL_CHARACTERS = 4 * 1024 * 1024;

const chunkKey = (id, index) => ['document', id, index];
let opening = null;
function open() {
  if (!opening)
    opening = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => {
        opening = null;
        reject(
          new Error(
            'ไม่สามารถเปิดพื้นที่เก็บข้อมูลได้ กรุณาตรวจสอบการตั้งค่าเบราว์เซอร์หรือติดต่อผู้ดูแลระบบ',
          ),
        );
      };
    });
  return opening;
}
/** One readwrite IndexedDB transaction protects against duplicate approval across tabs. */
async function transaction(write, fn, hydrateDocuments = true) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, write ? 'readwrite' : 'readonly'),
      store = tx.objectStore(STORE);
    const read = store.get(KEY),
      readManifest = store.get(DOCUMENT_MANIFEST);
    let result,
      error,
      waiting = 2;
    const abort = (reason) => {
      error = reason;
      tx.abort();
    };
    const finishReading = () => {
      if (--waiting) return;
      try {
        const data = read.result ?? createDemoDatabase();
        const manifest = readManifest.result ?? { version: 1, documents: [] };
        if (manifest.version !== 1 || !Array.isArray(manifest.documents))
          throw new Error('ข้อมูลเอกสารที่บันทึกไว้ไม่ถูกต้อง กรุณาลองโหลดใหม่');
        const entries = new Map();
        for (const entry of manifest.documents) {
          if (
            !Number.isInteger(entry.id) ||
            !Number.isInteger(entry.count) ||
            entry.count < 1 ||
            entry.count > 256 ||
            !Number.isInteger(entry.length) ||
            entry.length < 1 ||
            Math.ceil(entry.length / CHUNK_CHARACTERS) !== entry.count ||
            entries.has(entry.id)
          )
            throw new Error('ข้อมูลเอกสารที่บันทึกไว้ไม่ถูกต้อง กรุณาลองโหลดใหม่');
          entries.set(entry.id, entry);
        }
        const hydrated = new Map();
        const complete = () => {
          try {
            result = fn(data);
            if (write) persistDocuments(store, data, entries, hydrated);
          } catch (reason) {
            abort(reason);
          }
        };
        const chunkedDocuments = hydrateDocuments
          ? data.documents.filter((document) => document.dataUrl === '' && entries.has(document.id))
          : [];
        if (!chunkedDocuments.length) {
          complete();
          return;
        }
        let outstanding = chunkedDocuments.reduce(
          (count, document) => count + entries.get(document.id).count,
          0,
        );
        for (const document of chunkedDocuments) {
          const entry = entries.get(document.id),
            chunks = new Array(entry.count);
          let documentOutstanding = entry.count;
          for (let index = 0; index < entry.count; index++) {
            const request = store.get(chunkKey(document.id, index));
            request.onsuccess = () => {
              try {
                const chunk = request.result;
                const expectedLength =
                  index === entry.count - 1
                    ? entry.length - index * CHUNK_CHARACTERS
                    : CHUNK_CHARACTERS;
                if (typeof chunk !== 'string' || chunk.length !== expectedLength)
                  throw new Error('ข้อมูลเอกสารที่บันทึกไว้ไม่ครบ กรุณาลองโหลดใหม่');
                chunks[index] = chunk;
                if (--documentOutstanding === 0) {
                  document.dataUrl = chunks.join('');
                  hydrated.set(document.id, document.dataUrl);
                }
                if (--outstanding === 0) complete();
              } catch (reason) {
                abort(reason);
              }
            };
          }
        }
      } catch (reason) {
        abort(reason);
      }
    };
    read.onsuccess = finishReading;
    readManifest.onsuccess = finishReading;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(error ?? new Error('บันทึกไม่สำเร็จ พื้นที่เก็บข้อมูลอาจเต็ม'));
    tx.onerror = () => {
      error ??= new Error('ไม่สามารถบันทึกข้อมูลได้');
    };
  });
}
/** Keep each persisted value small enough for Chromium's IndexedDB record limit. */
function persistDocuments(store, data, previous, hydrated) {
  const documents = [],
    manifest = { version: 1, documents: [] };
  let inlineCharacters = 0;
  for (const document of data.documents) {
    const content = document.dataUrl;
    if (
      content.length <= INLINE_DOCUMENT_CHARACTERS &&
      inlineCharacters + content.length <= INLINE_TOTAL_CHARACTERS
    ) {
      inlineCharacters += content.length;
      documents.push(document);
      continue;
    }
    const entry = {
      id: document.id,
      count: Math.ceil(content.length / CHUNK_CHARACTERS),
      length: content.length,
    };
    manifest.documents.push(entry);
    documents.push({ ...document, dataUrl: '' });
    // A snapshot or unrelated command must not rewrite unchanged file chunks.
    if (hydrated.get(document.id) !== content) {
      for (let index = 0; index < entry.count; index++)
        store.put(
          content.slice(index * CHUNK_CHARACTERS, (index + 1) * CHUNK_CHARACTERS),
          chunkKey(document.id, index),
        );
    }
  }
  const current = new Map(manifest.documents.map((entry) => [entry.id, entry]));
  for (const entry of previous.values()) {
    for (let index = current.get(entry.id)?.count ?? 0; index < entry.count; index++)
      store.delete(chunkKey(entry.id, index));
  }
  store.put({ ...data, documents }, KEY);
  if (manifest.documents.length) store.put(manifest, DOCUMENT_MANIFEST);
  else store.delete(DOCUMENT_MANIFEST);
}
function notifyDataChanged() {
  window.dispatchEvent(new Event('leave-data-updated'));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(DEMO_DATA_CHANNEL);
    channel.postMessage('updated');
    channel.close();
  }
}
/** @implements {import('../domain/types.js').LeaveRepository} */
export class BrowserRepository {
  actorId() {
    const id = Number(sessionStorage.getItem(SESSION));
    if (!id) throw new DomainError('กรุณาเข้าสู่ระบบ', 'UNAUTHENTICATED');
    return id;
  }
  /**
   * @param {string} identifier
   * @param {string} password
   * @returns {Promise<import('../domain/types.js').Employee>}
   */
  async login(identifier, password) {
    const employee = await transaction(true, (db) => {
      const e = findLoginAccount(db.employees, identifier);
      if (!e?.active || password !== DEMO_PASSWORD)
        throw new DomainError(LOGIN_ERROR, 'UNAUTHENTICATED');
      return structuredClone(e);
    });
    sessionStorage.setItem(SESSION, String(employee.id));
    return employee;
  }
  /** @returns {Promise<import('../domain/types.js').Employee | null>} */
  async session() {
    if (!sessionStorage.getItem(SESSION)) return null;
    return transaction(false, (db) => {
      try {
        return structuredClone(actorById(db, this.actorId()));
      } catch {
        return null;
      }
    });
  }
  /** @returns {Promise<void>} */
  async logout() {
    sessionStorage.removeItem(SESSION);
  }
  /** @returns {Promise<import('../domain/types.js').Database>} */
  async snapshot() {
    return transaction(false, (db) => visibleSnapshot(db, this.actorId()));
  }
  /**
   * @param {number} employeeId
   * @returns {Promise<import('../domain/types.js').EmployeeProfile>}
   */
  async getEmployeeProfile(employeeId) {
    return transaction(false, (db) => employeeProfile(db, this.actorId(), employeeId), false);
  }
  /**
   * @param {string} query
   * @param {string} date
   * @returns {Promise<import('../domain/types.js').ColleagueStatus[]>}
   */
  async searchColleagues(query, date) {
    return transaction(false, (db) => searchColleagues(db, this.actorId(), query, date), false);
  }
  /**
   * @param {import('../domain/types.js').Command} command
   * @returns {Promise<import('../domain/types.js').CommandResult>}
   */
  async execute(command) {
    const result = await transaction(true, (db) => applyCommand(db, this.actorId(), command));
    notifyDataChanged();
    return result;
  }
  /** @returns {Promise<void>} */
  async resetDemo() {
    await transaction(true, (db) => {
      if (actorById(db, this.actorId()).role !== 'HR')
        throw new DomainError('เฉพาะ HR เท่านั้น', 'FORBIDDEN');
      Object.assign(db, createDemoDatabase());
    });
    notifyDataChanged();
  }
}
