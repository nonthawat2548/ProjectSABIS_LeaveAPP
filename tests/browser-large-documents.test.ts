import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';
import { BrowserRepository } from '../src/data/browserRepository';
import { createDemoDatabase, DEMO_DATASET_ID, DEMO_SESSION_KEY } from '../src/data/demoDatabase';
import { addDays, today } from '../src/domain/date';
import { createSeed } from '../src/domain/seed';
import { applyCommand, balance, DomainError, visibleSnapshot } from '../src/domain/service';
import type { Database } from '../src/domain/types';
import { pdfAttachment, requestWithAttachment } from './upload-fixtures';

const megabyte = 1024 * 1024, chunkCharacters = 4 * megabyte, recordLimit = 10 * megabyte;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const isChunkKey = (key: unknown): key is [string, number, number] => Array.isArray(key) && key[0] === 'document';
type Manifest = { version: 1; documents: { id: number; count: number; length: number }[] };

test('IndexedDB stores large files in bounded records while preserving atomic transactions and legacy data', async t => {
    const factory = new IDBFactory(), dom = new JSDOM('', { url: 'http://localhost' });
    const globals = { indexedDB: factory, sessionStorage: dom.window.sessionStorage, window: new EventTarget(), BroadcastChannel: undefined };
    const savedGlobals = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(DEMO_DATASET_ID, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('database');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const originalPut = FakeObjectStore.prototype.put;
    let largestRecord = 0, chunkWrites = 0, allWrites = 0, injectChunkFailure = false;
    FakeObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
        // A deliberately smaller analogue of Chromium's serialized-record cap.
        const bytes = (typeof value === 'string' ? value.length : JSON.stringify(value).length) * 2;
        largestRecord = Math.max(largestRecord, bytes); allWrites++;
        if (bytes > recordLimit) throw new DOMException('Serialized IndexedDB record is too large', 'UnknownError');
        if (isChunkKey(key)) {
            chunkWrites++;
            if (injectChunkFailure && key[2] === 1) throw new DOMException('Injected storage exhaustion', 'QuotaExceededError');
        }
        return originalPut.call(this, value, key);
    };
    const boundedPut = FakeObjectStore.prototype.put;
    t.after(() => {
        FakeObjectStore.prototype.put = originalPut;
        connection.close(); dom.window.close();
        for (const [name, descriptor] of savedGlobals) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
        }
    });
    const records = () => new Promise<{ keys: IDBValidKey[]; values: unknown[] }>((resolve, reject) => {
        const tx = connection.transaction('database', 'readonly'), store = tx.objectStore('database');
        const keys = store.getAllKeys(), values = store.getAll();
        tx.oncomplete = () => resolve({ keys: keys.result, values: values.result }); tx.onabort = () => reject(tx.error);
    });
    const raw = async () => {
        const rows = await records();
        const state = rows.values[rows.keys.findIndex(key => key === 'state')] as Database;
        const manifest = rows.values[rows.keys.findIndex(key => key === 'document-chunks')] as Manifest | undefined;
        return { ...rows, state, manifest };
    };
    const saveInline = (data: Database) => new Promise<void>((resolve, reject) => {
        const tx = connection.transaction('database', 'readwrite'); tx.objectStore('database').put(data, 'state');
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
    let date = addDays(today(), 7);
    while ([0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay())) date = addDays(date, 1);
    const initial = createSeed(); initial.requests = []; initial.days = []; initial.documents = []; initial.approvals = []; initial.notifications = []; initial.holidays = [];
    const legacyAttachment = pdfAttachment(2 * megabyte);
    const legacyId = applyCommand(initial, 1, { type: 'submit', input: requestWithAttachment(legacyAttachment, date) }).id!;
    await saveInline(initial);
    dom.window.sessionStorage.setItem(DEMO_SESSION_KEY, '1');
    const repository = new BrowserRepository();

    await t.test('Existing inline files read without migration and convert only on a successful write', async () => {
        const before = await records();
        assert.equal((await repository.snapshot()).documents[0].dataUrl, legacyAttachment.dataUrl);
        assert.deepEqual(await records(), before);
        await assert.rejects(repository.login('employee@demo.local', 'wrong'), error => error instanceof DomainError && error.code === 'UNAUTHENTICATED');
        assert.deepEqual(await records(), before);
        await repository.login('employee@demo.local', 'demo1234');
        const saved = await raw();
        assert.equal(saved.state.documents[0].dataUrl, ''); assert.equal(saved.manifest?.documents.length, 1);
        assert.equal((await repository.snapshot()).documents[0].dataUrl, legacyAttachment.dataUrl);
        await repository.execute({ type: 'edit', id: legacyId, version: 1, input: { ...requestWithAttachment(legacyAttachment, date), attachment: null, keepDocument: false } });
        assert(!(await records()).keys.some(isChunkKey)); assert.equal((await raw()).manifest, undefined);
    });

    let id: number, secondId: number, originalDocumentId: number;
    const large = pdfAttachment(8 * megabyte + 7, 'large.pdf'), largeInput = requestWithAttachment(large, addDays(date, 7));
    await t.test('A file larger than the emulated record cap persists and reconstructs byte-for-byte', async () => {
        assert(large.dataUrl.length * 2 > recordLimit);
        id = (await repository.execute({ type: 'submit', input: largeInput })).id!;
        const saved = await raw(), document = saved.state.documents.find(document => document.leaveId === id)!;
        originalDocumentId = document.id;
        assert.equal(document.dataUrl, '');
        const entry = saved.manifest!.documents.find(entry => entry.id === document.id)!;
        assert.equal(entry.length, large.dataUrl.length); assert.equal(entry.count, 3);
        const chunks = saved.keys.map((key, index) => ({ key, value: saved.values[index] })).filter(row => isChunkKey(row.key) && row.key[1] === document.id).sort((a, b) => (a.key as [string, number, number])[2] - (b.key as [string, number, number])[2]);
        assert(chunks.every(chunk => typeof chunk.value === 'string' && chunk.value.length <= chunkCharacters));
        assert.equal(digest(chunks.map(chunk => chunk.value).join('')), digest(large.dataUrl));
        const snapshot = await new BrowserRepository().snapshot();
        assert.equal(digest(snapshot.documents.find(document => document.leaveId === id)!.dataUrl), digest(large.dataUrl));
        assert.equal((await new BrowserRepository().session())?.id, 1);
        assert(largestRecord <= recordLimit);
    });

    await t.test('Multiple large files stay separate and readonly snapshots never rewrite chunks', async () => {
        secondId = (await repository.execute({ type: 'submit', input: requestWithAttachment(large, addDays(date, 14)) })).id!;
        const before = chunkWrites, beforeAll = allWrites;
        const snapshot = await repository.snapshot();
        assert.equal(snapshot.documents.length, 2);
        assert(snapshot.documents.every(document => digest(document.dataUrl) === digest(large.dataUrl)));
        assert.equal(chunkWrites, before); assert.equal(allWrites, beforeAll);
        await repository.execute({ type: 'edit', id, version: 1, input: { ...largeInput, attachment: null, keepDocument: true, reason: 'เก็บเอกสารเดิม' } });
        assert.equal(chunkWrites, before);
        assert.equal((await raw()).manifest!.documents.length, 2);
    });

    await t.test('A chunk write failure aborts metadata, request version and all partial chunks together', async () => {
        const before = await records(); injectChunkFailure = true;
        const replacement = pdfAttachment(8 * megabyte + 8, 'replacement.pdf');
        await assert.rejects(repository.execute({ type: 'edit', id, version: 2, input: { ...largeInput, attachment: replacement } }), /Injected storage exhaustion/);
        injectChunkFailure = false;
        assert.deepEqual(await records(), before);
        await assert.rejects(repository.execute({ type: 'edit', id, version: 2, input: { ...largeInput, attachment: { ...large, fileSize: 12 } } }), error => error instanceof DomainError && error.code === 'VALIDATION');
        assert.deepEqual(await records(), before);
    });

    await t.test('Replacement removes stale chunks and document removal clears only its own data', async () => {
        const replacement = pdfAttachment(3 * megabyte + 1, 'smaller.pdf');
        await repository.execute({ type: 'edit', id, version: 2, input: { ...largeInput, attachment: replacement } });
        let saved = await raw();
        assert(!saved.keys.some(key => isChunkKey(key) && key[1] === originalDocumentId));
        const currentDocument = (await repository.snapshot()).documents.find(document => document.leaveId === id)!;
        assert.equal(digest(currentDocument.dataUrl), digest(replacement.dataUrl));
        assert.equal(saved.manifest!.documents.find(entry => entry.id === currentDocument.id)!.count, 2);
        await repository.execute({ type: 'edit', id, version: 3, input: { ...largeInput, attachment: null, keepDocument: false } });
        saved = await raw();
        assert(!saved.keys.some(key => isChunkKey(key) && key[1] === currentDocument.id));
        assert.equal(saved.manifest!.documents.length, 1);
        assert.equal((await repository.snapshot()).documents.find(document => document.leaveId === secondId)!.dataUrl, large.dataUrl);
    });

    await t.test('Concurrent approvals still commit once with chunked documents', async () => {
        await repository.login('manager@demo.local', 'demo1234');
        const before = await repository.snapshot(), request = before.requests.find(request => request.id === secondId)!;
        const year = Number(request.startDate.slice(0, 4)), used = balance(before, 1, 2, year).used;
        const command = { type: 'approve' as const, id: secondId, version: 1, comment: '' };
        const outcomes = await Promise.allSettled([repository.execute(command), new BrowserRepository().execute(command)]);
        assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
        const rejected = outcomes.find(outcome => outcome.status === 'rejected');
        assert(rejected?.status === 'rejected' && rejected.reason instanceof DomainError && rejected.reason.code === 'CONFLICT');
        const after = await repository.snapshot(); assert.equal(balance(after, 1, 2, year).used, used + 1);
        assert.equal(after.documents.find(document => document.leaveId === secondId)!.dataUrl, large.dataUrl);
    });

    await t.test('The cumulative inline-file budget also protects the state record', async () => {
        const current = await repository.snapshot();
        const extra = pdfAttachment(450 * 1024, 'inline.pdf');
        const source = current.documents[0];
        const rawState = (await raw()).state;
        const synthetic = structuredClone(rawState);
        // These trusted persisted records model many older small attachments.
        synthetic.documents = Array.from({ length: 12 }, (_, index) => ({ ...source, id: 100 + index, fileSize: extra.fileSize, dataUrl: extra.dataUrl }));
        // Write the old format without the cap; successful login performs conversion.
        FakeObjectStore.prototype.put = originalPut;
        try { await saveInline(synthetic) } finally {
            // Restore the bounded wrapper used by all repository writes below.
            FakeObjectStore.prototype.put = boundedPut;
        }
        await repository.login('manager@demo.local', 'demo1234');
        const saved = await raw();
        assert(saved.state.documents.reduce((sum, document) => sum + document.dataUrl.length, 0) <= 4 * megabyte);
        assert(saved.manifest!.documents.length > 0);
        assert((await repository.snapshot()).documents.every(document => document.dataUrl === extra.dataUrl));
    });

    await t.test('HR reset removes all chunk records atomically and preserves the database version', async () => {
        await repository.login('hr@demo.local', 'demo1234');
        await repository.resetDemo();
        const saved = await raw();
        assert(!saved.keys.some(isChunkKey)); assert.equal(saved.manifest, undefined);
        assert.equal(connection.version, 1);
        assert.deepEqual(saved.state, createDemoDatabase());
        assert.deepEqual(await repository.snapshot(), visibleSnapshot(createDemoDatabase(), 5));
    });
});
