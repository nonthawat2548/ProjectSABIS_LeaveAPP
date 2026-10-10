import type { AttachmentInput, RequestInput } from '../src/domain/types';

// Nine bytes align the PDF header with a complete base64 quartet. The padding
// represents real zero bytes without allocating a second, equally large Buffer.
export const PDF_FIXTURE_PREFIX = '%PDF-1.7\n';
export function pdfAttachment(fileSize: number, fileName = 'document.pdf'): AttachmentInput {
    if (!Number.isInteger(fileSize) || fileSize < PDF_FIXTURE_PREFIX.length) throw new RangeError('PDF fixture requires at least nine bytes');
    const remaining = fileSize - PDF_FIXTURE_PREFIX.length;
    const suffix = remaining % 3 === 1 ? 'AA==' : remaining % 3 === 2 ? 'AAA=' : '';
    const body = Buffer.from(PDF_FIXTURE_PREFIX).toString('base64') + 'AAAA'.repeat(Math.floor(remaining / 3)) + suffix;
    return { fileName, fileType: 'application/pdf', fileSize, dataUrl: 'data:application/pdf;base64,' + body };
}

export function requestWithAttachment(attachment: AttachmentInput, date = '2026-12-04'): RequestInput {
    return { leaveTypeId: 2, maternityCaseId: null, startDate: date, endDate: date, duration: 'Full', reason: 'พักรักษาตัวพร้อมเอกสารประกอบ', attachment };
}
