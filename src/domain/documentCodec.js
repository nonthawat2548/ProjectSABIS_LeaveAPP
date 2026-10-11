import { ALLOWED_ATTACHMENT_TYPES } from './attachments';

/** Decode in bounded blocks rather than creating an array with an entry for each byte. */
export function documentBlob(doc) {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(doc.fileType) && doc.fileType !== 'text/plain')
    throw new Error('ไม่รองรับชนิดเอกสาร');
  const split = doc.dataUrl.indexOf(',');
  if (split < 0) throw new Error('ข้อมูลเอกสารไม่ถูกต้อง');
  const base64 = doc.dataUrl.slice(0, split).includes(';base64');
  const encoded = base64
    ? doc.dataUrl.slice(split + 1).replace(/[ \t\r\n\f]/g, '')
    : doc.dataUrl.slice(split + 1);
  const parts = [];
  if (base64) {
    for (let offset = 0; offset < encoded.length; offset += 64 * 1024) {
      const raw = atob(encoded.slice(offset, offset + 64 * 1024)),
        bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      parts.push(bytes);
    }
  } else {
    const raw = decodeURIComponent(encoded),
      bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    parts.push(bytes);
  }
  return new Blob(parts, { type: doc.fileType });
}
