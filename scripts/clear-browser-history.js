import { clearRequestHistory } from './request-history.js';

const DATABASE_NAME = 'leave-management-10-people-v1';

/** One transaction removes history and file chunks from the current origin only. */
export async function clearIndexedDbHistory(factory) {
  const db = await new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME);
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => reject(new Error('ไม่พบฐานข้อมูลเดิมในเบราว์เซอร์นี้'));
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => reject(new Error('กรุณาปิดแท็บอื่นที่กำลังแก้ฐานข้อมูล แล้วลองใหม่'));
  });
  try {
    if (db.version !== 1 || !db.objectStoreNames.contains('database'))
      throw new Error('โครงสร้างฐานข้อมูลไม่ตรงกัน ยังไม่ได้ล้างข้อมูล');
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('database', 'readwrite');
      const store = tx.objectStore('database');
      const request = store.get('state');
      let result, error;
      request.onsuccess = () => {
        try {
          if (!request.result) throw new Error('ไม่พบข้อมูลที่บันทึกไว้ ยังไม่ได้ล้างข้อมูล');
          const before = request.result;
          const after = clearRequestHistory(before);
          result = { before: before.requests.length, after: after.requests.length };
          store.put(after, 'state');
          store.delete('document-chunks');
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const entry = cursor.result;
            if (!entry) return;
            if (Array.isArray(entry.key) && entry.key[0] === 'document') entry.delete();
            entry.continue();
          };
        } catch (reason) {
          error = reason;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(error ?? new Error('ล้างข้อมูลไม่สำเร็จ ข้อมูลเดิมยังอยู่'));
      tx.onerror = () => {};
    });
  } finally {
    db.close();
  }
}

export async function clearBrowserHistory() {
  if (!import.meta.env?.DEV || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
    throw new Error('หน้านี้ใช้ได้เฉพาะเว็บทดลองในเครื่องเท่านั้น');
  const result = await clearIndexedDbHistory(indexedDB);
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('leave-10-people-data');
    channel.postMessage('updated');
    channel.close();
  }
  return result;
}
