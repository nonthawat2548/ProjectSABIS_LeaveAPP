import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';
import { BrowserRepository } from '../src/data/browserRepository';
import { DEMO_DATASET_ID } from '../src/data/demoDatabase';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from '../src/domain/attachments';
import { addDays, today } from '../src/domain/date';
import { createSeed } from '../src/domain/seed';
import { applyCommand, DomainError, validateAttachment } from '../src/domain/service';
import type { AttachmentInput, Database } from '../src/domain/types';
import { pdfAttachment, requestWithAttachment } from './upload-fixtures';

const now = new Date('2026-10-10T05:00:00Z');
const megabyte = 1024 * 1024;
const validationError = (error: unknown) => error instanceof DomainError && error.code === 'VALIDATION';

function fixture(date = now): Database {
    const db = createSeed(date);
    db.requests = []; db.days = []; db.documents = []; db.approvals = []; db.notifications = []; db.holidays = [];
    return db;
}

test('Attachment policy is 25 MiB and accepts ordinary documents above 2 MiB', () => {
    assert.equal(MAX_ATTACHMENT_BYTES, 25 * megabyte);
    assert.equal(MAX_ATTACHMENT_LABEL, '25 MB');
    const attachment = pdfAttachment(3 * megabyte);
    validateAttachment(attachment);
    const db = fixture();
    const result = applyCommand(db, 1, { type: 'submit', input: requestWithAttachment(attachment) }, now);
    const saved = db.documents.find(document => document.leaveId === result.id)!;
    assert.equal(saved.fileSize, 3 * megabyte);
    assert.equal(saved.dataUrl, attachment.dataUrl);
    assert.equal(saved.fileName, attachment.fileName);
});

test('The exact 25 MiB decoded boundary is accepted and an extra byte cannot bypass it', () => {
    validateAttachment(pdfAttachment(MAX_ATTACHMENT_BYTES));
    const oversized = pdfAttachment(MAX_ATTACHMENT_BYTES + 1);
    assert.throws(() => validateAttachment(oversized), validationError);
    // A forged size must not turn an oversized encoded body into a small file.
    assert.throws(() => validateAttachment({ ...oversized, fileSize: 12 }), validationError);
    assert.throws(() => validateAttachment({ ...oversized, fileSize: MAX_ATTACHMENT_BYTES }), validationError);
});

test('Attachment metadata must agree with the actual decoded bytes in both directions', () => {
    const attachment = pdfAttachment(30);
    for (const fileSize of [29, 31, 0, -1, 30.5, NaN, Infinity]) {
        assert.throws(() => validateAttachment({ ...attachment, fileSize }), validationError);
    }
});

test('Previously supported whitespace-wrapped and unpadded base64 documents remain accepted', () => {
    const attachment = pdfAttachment(11), prefix = 'data:application/pdf;base64,';
    const body = attachment.dataUrl.slice(prefix.length);
    validateAttachment({ ...attachment, dataUrl: prefix + body.replace(/(.{4})/g, '$1\n \t') });
    validateAttachment({ ...attachment, dataUrl: prefix + body.replace(/=+$/, '') });
});

test('Accepted PDF, JPG and PNG types still require matching file signatures', () => {
    const bytes = [
        ['application/pdf', Buffer.from('%PDF-1.7\n')],
        ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
        ['image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ] as const;
    for (const [fileType, data] of bytes) {
        const attachment: AttachmentInput = { fileName: 'document', fileType, fileSize: data.length, dataUrl: `data:${fileType};base64,${data.toString('base64')}` };
        validateAttachment(attachment);
        assert.throws(() => validateAttachment({ ...attachment, dataUrl: `data:${fileType};base64,${Buffer.alloc(data.length).toString('base64')}` }), validationError);
    }
    const pdf = pdfAttachment(30);
    assert.throws(() => validateAttachment({ ...pdf, fileType: 'text/plain', dataUrl: pdf.dataUrl.replace('application/pdf', 'text/plain') }), validationError);
    assert.throws(() => validateAttachment({ ...pdf, fileType: 'image/png', dataUrl: pdf.dataUrl.replace('application/pdf', 'image/png') }), validationError);
});

test('Invalid data URL headers, malformed base64 and misplaced padding are rejected', () => {
    const attachment = pdfAttachment(30), prefix = 'data:application/pdf;base64,';
    const body = attachment.dataUrl.slice(prefix.length);
    for (const dataUrl of [
        attachment.dataUrl.replace('application/pdf', 'image/jpeg'),
        attachment.dataUrl.replace(';base64,', ';charset=utf-8;base64,'),
        'data:application/pdf,' + body,
        prefix,
        prefix + body.slice(0, 8) + '!!!!' + body.slice(12),
        prefix + body.slice(0, 12) + 'AA==' + body.slice(16),
        prefix + body + '===',
        prefix + body.slice(0, -1),
    ]) {
        assert.throws(() => validateAttachment({ ...attachment, dataUrl }), validationError);
    }
    for (const fileName of ['', '   ', 'a'.repeat(256)]) {
        assert.throws(() => validateAttachment({ ...attachment, fileName }), validationError);
    }
});

test('IndexedDB preserves larger documents on submit and edit, and rejects invalid uploads atomically', async t => {
    const factory = new IDBFactory(), dom = new JSDOM('', { url: 'http://localhost' });
    const globals = { indexedDB: factory, sessionStorage: dom.window.sessionStorage, window: new EventTarget(), BroadcastChannel: undefined };
    const savedGlobals = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(DEMO_DATASET_ID, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('database');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    t.after(() => {
        connection.close(); dom.window.close();
        for (const [name, descriptor] of savedGlobals) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
        }
    });
    // Public snapshots reassemble large documents stored in IndexedDB chunks.
    const read = () => repository.snapshot();
    await new Promise<void>((resolve, reject) => {
        const tx = connection.transaction('database', 'readwrite');
        tx.objectStore('database').put(fixture(new Date()), 'state');
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
    const repository = new BrowserRepository();
    await repository.login('employee@demo.local', 'demo1234');
    let date = addDays(today(), 7);
    while ([0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay())) date = addDays(date, 1);
    const attachment = pdfAttachment(3 * megabyte, 'submitted.pdf');
    const input = requestWithAttachment(attachment, date);
    const id = (await repository.execute({ type: 'submit', input })).id!;
    let state = await read(), document = state.documents.find(document => document.leaveId === id)!;
    assert.equal(document.dataUrl, attachment.dataUrl); assert.equal(document.fileSize, attachment.fileSize);
    const originalDocument = structuredClone(document);

    await repository.execute({ type: 'edit', id, version: 1, input: { ...input, reason: 'แก้ไขเหตุผลและเก็บเอกสารเดิม', attachment: null, keepDocument: true } });
    state = await read();
    assert.deepEqual(state.documents.find(document => document.leaveId === id), originalDocument);
    assert.equal(state.requests.find(request => request.id === id)!.version, 2);

    const replacement = pdfAttachment(3 * megabyte + 1, 'replacement.pdf');
    await repository.execute({ type: 'edit', id, version: 2, input: { ...input, attachment: replacement } });
    state = await read(); document = state.documents.find(document => document.leaveId === id)!;
    assert.equal(state.documents.filter(document => document.leaveId === id).length, 1);
    assert.equal(document.dataUrl, replacement.dataUrl); assert.equal(document.fileSize, replacement.fileSize);
    assert.equal(document.fileName, 'replacement.pdf');
    assert.equal(state.requests.find(request => request.id === id)!.version, 3);

    const before = await read();
    const badAttachments = [
        { ...replacement, fileSize: MAX_ATTACHMENT_BYTES + 1 },
        { ...replacement, fileSize: 12 },
        { ...replacement, dataUrl: 'data:application/pdf;base64,invalid' },
    ];
    for (const invalid of badAttachments) {
        await assert.rejects(repository.execute({ type: 'edit', id, version: 3, input: { ...input, attachment: invalid } }), validationError);
        assert.deepEqual(await read(), before);
        await assert.rejects(repository.execute({ type: 'submit', input: requestWithAttachment(invalid, addDays(date, 7)) }), validationError);
        assert.deepEqual(await read(), before);
    }
});
