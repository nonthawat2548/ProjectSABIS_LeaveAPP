import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiRepository } from '../src/data/apiRepository';
import { MAX_ATTACHMENT_BYTES } from '../src/domain/attachments';
import { applyCommand, validateAttachment } from '../src/domain/service';
import { createSeed } from '../src/domain/seed';
import { documentBlob } from '../src/domain/documentCodec';
import { cloudFixture } from './cloud-fixture';
import { pdfAttachment, requestWithAttachment } from './upload-fixtures';
import type { Database } from '../src/domain/types';

test('Legacy files above 25 MiB survive editing, approval and local download', () => {
    const now = new Date('2026-10-10T05:00:00Z');
    const db = createSeed(now);
    db.requests = []; db.days = []; db.documents = []; db.approvals = []; db.notifications = [];
    const input = requestWithAttachment(pdfAttachment(9));
    const { id } = applyCommand(db, 1, { type: 'submit', input }, now);
    const document = db.documents.find(row => row.leaveId === id)!;
    const legacy = pdfAttachment(MAX_ATTACHMENT_BYTES + 1, 'legacy.pdf');
    Object.assign(document, legacy); // Represents a file saved under the previous policy.
    assert.throws(() => validateAttachment(legacy), /25 MB/);
    applyCommand(db, 1, { type: 'edit', id: id!, version: 1, input: { ...input, attachment: null, keepDocument: true } }, now);
    applyCommand(db, 4, { type: 'approve', id: id!, version: 2, comment: '' }, now);
    assert.equal(db.documents[0].dataUrl, legacy.dataUrl);
    assert.equal(documentBlob(db.documents[0]).size, legacy.fileSize);
});

test('Cloud reads a legacy 26 MiB file while rejecting a new upload of that size', async () => {
    const fixture = await cloudFixture(), previousFetch = globalThis.fetch;
    try {
        const owner = fixture.client(); await owner.login('employee@demo.local');
        const legacy = pdfAttachment(26 * 1024 * 1024, 'legacy-cloud.pdf');
        const { rows } = await fixture.db.query<{ leave_id: number }>('SELECT leave_id FROM leave_app.leave_request WHERE employee_id=1 ORDER BY leave_id LIMIT 1');
        await fixture.db.query(`INSERT INTO leave_app.leave_document
            (document_id,leave_id,document_type,file_name,storage_key,file_type,file_size,uploaded_at,data_url)
            VALUES (99999,$1,'Supporting Document',$2,'legacy-test',$3,$4,CURRENT_TIMESTAMP,$5)`,
            [rows[0].leave_id, legacy.fileName, legacy.fileType, legacy.fileSize, legacy.dataUrl]);
        globalThis.fetch = async (input, init) => {
            const request = new Request(input, init); request.headers.set('Cookie', owner.cookie);
            return fixture.handle(request);
        };
        const repository = new ApiRepository('https://leave.test/api');
        const snapshot: Database = await repository.snapshot();
        const document = snapshot.documents.find(row => row.id === 99999)!;
        const blob = await repository.downloadDocument(document);
        assert.equal(blob.size, legacy.fileSize);
        assert.equal(await blob.slice(0, 9).text(), '%PDF-1.7\n');
        assert.equal((await owner.request('/uploads', 'POST', {
            fileName: legacy.fileName, fileType: legacy.fileType, fileSize: legacy.fileSize,
            encodedLength: 4 * Math.ceil(legacy.fileSize / 3),
        })).status, 400);
    } finally { globalThis.fetch = previousFetch; await fixture.close() }
});
