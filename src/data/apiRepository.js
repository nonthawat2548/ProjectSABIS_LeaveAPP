import { DomainError, validateAttachment } from '../domain/service';
import { CLOUD_PART_CHARACTERS, MAX_STORED_DOCUMENT_BASE64_LENGTH } from '../domain/attachments';
import { documentBlob } from '../domain/documentCodec';
export class ApiRepository {
  capabilities;

  constructor(base = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '')) {
    this.base = base;
  }
  async request(path, method = 'GET', body) {
    let response;
    try {
      response = await fetch(this.base + path, {
        method,
        credentials: 'include',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new DomainError(
        'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ',
        'NETWORK',
      );
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new DomainError(
        response.status >= 500
          ? 'ระบบส่วนกลางยังไม่พร้อมใช้งาน กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ'
          : 'ระบบส่งข้อมูลไม่ถูกต้อง กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ',
        response.status >= 500 ? 'UNAVAILABLE' : 'API',
      );
    }
    if (data === null || typeof data !== 'object')
      throw new DomainError('ระบบส่งข้อมูลไม่ถูกต้อง กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ', 'API');
    if (!response.ok)
      throw new DomainError(data.message ?? 'การเชื่อมต่อมีปัญหา', data.code ?? 'API');
    return data;
  }
  async login(identifier, password) {
    return (await this.request('/session', 'POST', { email: identifier, password })).employee;
  }
  async session() {
    try {
      return (await this.request('/session')).employee;
    } catch (e) {
      if (e instanceof DomainError && e.code === 'UNAUTHENTICATED') return null;
      throw e;
    }
  }
  async logout() {
    await this.request('/session', 'DELETE');
  }
  async snapshot() {
    return this.request('/snapshot');
  }
  async searchColleagues(query, date) {
    return this.request('/colleagues?' + new URLSearchParams({ query, date }).toString());
  }
  async execute(command) {
    const attachment =
      command.type === 'submit' || command.type === 'edit' ? command.input.attachment : null;
    if (!attachment) return this.request('/commands', 'POST', command);
    this.capabilities ??= this.request('/health').catch((error) => {
      this.capabilities = undefined;
      throw error;
    });
    const capabilities = await this.capabilities;
    if (capabilities.documentTransport !== 'parts-v1')
      return this.request('/commands', 'POST', command);
    validateAttachment(attachment);
    const prefix = `data:${attachment.fileType};base64,`;
    let encoded = attachment.dataUrl.slice(prefix.length).replace(/[ \t\r\n\f]/g, '');
    encoded += '='.repeat((4 - (encoded.length % 4)) % 4);
    const staged = await this.request('/uploads', 'POST', {
      fileName: attachment.fileName,
      fileType: attachment.fileType,
      fileSize: attachment.fileSize,
      encodedLength: encoded.length,
    });
    if (typeof staged.uploadId !== 'string' || staged.partCharacters !== CLOUD_PART_CHARACTERS)
      throw new DomainError('ระบบอัปโหลดส่งข้อมูลไม่ถูกต้อง');
    try {
      for (
        let offset = 0, part = 0;
        offset < encoded.length;
        offset += CLOUD_PART_CHARACTERS, part++
      ) {
        await this.request(`/uploads/${encodeURIComponent(staged.uploadId)}/parts/${part}`, 'PUT', {
          data: encoded.slice(offset, offset + CLOUD_PART_CHARACTERS),
        });
      }
      return await this.request('/commands', 'POST', {
        ...command,
        input: {
          ...command.input,
          attachment: { uploadId: staged.uploadId },
        },
      });
    } catch (error) {
      await this.request('/uploads/' + encodeURIComponent(staged.uploadId), 'DELETE').catch(
        () => {},
      );
      throw error;
    }
  }
  async downloadDocument(document) {
    if (!document.remote) return documentBlob(document);
    const metadata = await this.request('/documents/' + document.id);
    if (
      !Number.isInteger(metadata.totalCharacters) ||
      metadata.totalCharacters <= 0 ||
      metadata.totalCharacters > MAX_STORED_DOCUMENT_BASE64_LENGTH + 1024 ||
      metadata.partCharacters !== CLOUD_PART_CHARACTERS ||
      metadata.fileType !== document.fileType
    )
      throw new DomainError('ข้อมูลเอกสารไม่ถูกต้อง');
    const parts = [];
    for (
      let offset = 0, part = 0;
      offset < metadata.totalCharacters;
      offset += CLOUD_PART_CHARACTERS, part++
    ) {
      const data = await this.request(`/documents/${document.id}/parts/${part}`);
      if (
        data.part !== part ||
        typeof data.data !== 'string' ||
        data.data.length !== Math.min(CLOUD_PART_CHARACTERS, metadata.totalCharacters - offset)
      )
        throw new DomainError('ดาวน์โหลดเอกสารไม่ครบ กรุณาลองอีกครั้ง');
      parts.push(data.data);
    }
    const blob = documentBlob({
      fileType: metadata.fileType,
      dataUrl: parts.join(''),
    });
    if (blob.size !== metadata.fileSize)
      throw new DomainError('ขนาดเอกสารไม่ตรงกับข้อมูล กรุณาลองอีกครั้ง');
    return blob;
  }
  async resetDemo() {
    await this.request('/demo/reset', 'POST', {});
  }
}
