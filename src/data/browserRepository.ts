import type { Command, Database, Employee, LeaveRepository } from '../domain/types';
import { DEMO_PASSWORD } from '../domain/seed';
import { actorById, applyCommand, DomainError, visibleSnapshot } from '../domain/service';
import { createDemoDatabase, DEMO_DATASET_ID, DEMO_SESSION_KEY, DEMO_DATA_CHANNEL } from './demoDatabase';
const DB_NAME = DEMO_DATASET_ID, STORE = 'database', KEY = 'state', SESSION = DEMO_SESSION_KEY;
let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
    if (!opening) opening = new Promise((resolve, reject) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => resolve(r.result); r.onerror = () => { opening = null; reject(new Error('เปิดพื้นที่เก็บข้อมูลไม่ได้ กรุณาอนุญาตให้เบราว์เซอร์เก็บข้อมูล หรือใช้โหมด API')) } });
    return opening;
}
/** One readwrite IndexedDB transaction protects against duplicate approval across tabs. */
async function transaction<T>(write: boolean, fn: (db: Database) => T): Promise<T> {
    const db = await open(); return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, write ? 'readwrite' : 'readonly'); const store = tx.objectStore(STORE); const read = store.get(KEY); let result: T; let error: unknown;
        read.onsuccess = () => { try { const data: Database = read.result ?? createDemoDatabase(); result = fn(data); if (write) store.put(data, KEY) } catch (e) { error = e; tx.abort() } };
        tx.oncomplete = () => resolve(result); tx.onabort = () => reject(error ?? new Error('บันทึกไม่สำเร็จ พื้นที่เก็บข้อมูลอาจเต็ม')); tx.onerror = () => { error ??= new Error('ไม่สามารถบันทึกข้อมูลได้') };
    });
}
function notifyDataChanged() { window.dispatchEvent(new Event('leave-data-updated')); if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel(DEMO_DATA_CHANNEL); channel.postMessage('updated'); channel.close() } }
export class BrowserRepository implements LeaveRepository {
    private actorId(): number { const id = Number(sessionStorage.getItem(SESSION)); if (!id) throw new DomainError('กรุณาเข้าสู่ระบบ', 'UNAUTHENTICATED'); return id }
    async login(email: string, password: string): Promise<Employee> { const employee = await transaction(true, db => { const e = db.employees.find(e => e.email.toLowerCase() === email.trim().toLowerCase() && e.active); if (!e || password !== DEMO_PASSWORD) throw new DomainError('อีเมลหรือรหัสผ่านตัวอย่างไม่ถูกต้อง', 'UNAUTHENTICATED'); return structuredClone(e) }); sessionStorage.setItem(SESSION, String(employee.id)); return employee }
    async session(): Promise<Employee | null> { if (!sessionStorage.getItem(SESSION)) return null; return transaction(false, db => { try { return structuredClone(actorById(db, this.actorId())) } catch { return null } }) }
    async logout() { sessionStorage.removeItem(SESSION) }
    async snapshot() { return transaction(true, db => visibleSnapshot(db, this.actorId())) }
    async execute(command: Command) { const result = await transaction(true, db => applyCommand(db, this.actorId(), command)); notifyDataChanged(); return result }
    async resetDemo() { await transaction(true, db => { if (actorById(db, this.actorId()).role !== 'HR') throw new DomainError('เฉพาะ HR เท่านั้น', 'FORBIDDEN'); Object.assign(db, createDemoDatabase()) }); notifyDataChanged() }
}
