/**
 * @typedef {import('../src/domain/types.js').AttachmentInput} AttachmentInput
 * @typedef {import('../src/domain/types.js').Database} Database
 * @typedef {import('../src/domain/types.js').RequestInput} RequestInput
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { createDemoDatabase } from '../src/data/demoDatabase.js';
import { addDays, today, workingDates } from '../src/domain/date.js';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_BASE64_LENGTH,
  MAX_COMMAND_BODY_BYTES,
} from '../src/domain/attachments.js';
const dataPrefix = 'data:application/pdf;base64,';
const pdfHeader = Buffer.from('%PDF-1.7\n').toString('base64');
const zeroChunk = 'A'.repeat(64 * 1024);
/**
 * Streams a canonical large PDF fixture without creating a second 25 MiB client Buffer.
 *
 * @param {number} size
 */
function* encodedPdf(size) {
  yield pdfHeader;
  let remaining = Math.floor((size - 9) / 3) * 4;
  while (remaining > 0) {
    const length = Math.min(remaining, zeroChunk.length);
    yield zeroChunk.slice(0, length);
    remaining -= length;
  }
  const tail = (size - 9) % 3;
  if (tail) yield tail === 1 ? 'AA==' : 'AAA=';
}
/**
 * @param {RequestInput} input
 * @param {number} size
 */
function* streamedCommand(input, size) {
  const empty = JSON.stringify({ type: 'submit', input });
  const split = empty.indexOf(dataPrefix) + dataPrefix.length;
  assert(split >= dataPrefix.length);
  yield empty.slice(0, split);
  yield* encodedPdf(size);
  yield empty.slice(split);
}
test(
  'HTTP attachments: 25 MiB persistence, direct validation and bounded JSON request bodies',
  { timeout: 120000 },
  async (t) => {
    const folder = await mkdtemp(join(tmpdir(), 'leave-upload-api-'));
    const file = join(folder, 'db.json');
    const date = workingDates(addDays(today(), 14), addDays(today(), 21), [])[0];
    const fixture = createDemoDatabase();
    fixture.requests = [];
    fixture.days = [];
    fixture.documents = [];
    fixture.approvals = [];
    fixture.notifications = [];
    fixture.entitlements.find((e) => e.employeeId === 1 && e.leaveTypeId === 1).year = Number(
      date.slice(0, 4),
    );
    await writeFile(file, JSON.stringify(fixture));
    const child = spawn(process.execPath, ['server/index.js'], {
      cwd: process.cwd(),
      env: { ...process.env, MOCK_PORT: '0', MOCK_HOST: '127.0.0.1', MOCK_DATA_FILE: file },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const stopped = new Promise((accept) => child.once('exit', () => accept()));
        child.kill('SIGTERM');
        await stopped;
      }
      assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
      await rm(folder, { recursive: true, force: true });
    });
    const base = await new Promise((accept, reject) => {
      let output = '',
        errors = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Upload API startup timed out: ' + errors));
      }, 10000);
      child.stderr.on('data', (chunk) => {
        errors += String(chunk);
      });
      child.stdout.on('data', (chunk) => {
        output += String(chunk);
        const match = output.match(/Mock API: (http:\/\/127\.0\.0\.1:\d+\/api)/);
        if (match) {
          clearTimeout(timer);
          accept(match[1]);
        }
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error('Upload API exited: ' + code + ': ' + errors));
      });
    });
    const login = await fetch(base + '/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee@demo.local', password: '1234' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    /**
     * @param {number} fileSize
     * @returns {AttachmentInput}
     */
    const attachment = (fileSize) => ({
      fileName: 'large.pdf',
      fileType: 'application/pdf',
      fileSize,
      dataUrl: dataPrefix,
    });
    /**
     * @param {AttachmentInput} a
     * @returns {RequestInput}
     */
    const input = (a) => ({
      leaveTypeId: 1,
      maternityCaseId: null,
      startDate: date,
      endDate: date,
      duration: 'Full',
      reason: 'เอกสารทดสอบขนาดใหญ่',
      attachment: a,
    });
    /**
     * @param {unknown} command
     */
    const send = (command) =>
      fetch(base + '/commands', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
    /**
     * @param {Iterable<string>} chunks
     * @param {any} [session]
     * @param {any} [path]
     */
    const stream = (chunks, session = cookie, path = '/commands') => {
      /**
       * @type {RequestInit & { duplex: 'half' }}
       */
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session ? { Cookie: session } : {}) },
        body: /** @type {ReadableStream} */ (Readable.toWeb(Readable.from(chunks))),
        duplex: 'half',
      };
      return fetch(base + path, options);
    };
    /**
     * @returns {Promise<Database>}
     */
    const read = async () => JSON.parse(await readFile(file, 'utf8'));
    await t.test(
      'A real 25 MiB PDF reaches command validation and is persisted unchanged',
      async () => {
        const response = await stream(
          streamedCommand(input(attachment(MAX_ATTACHMENT_BYTES)), MAX_ATTACHMENT_BYTES),
        );
        assert.equal(response.status, 200, await response.text());
        assert((await stat(file)).size > MAX_ATTACHMENT_BASE64_LENGTH);
        const db = await read();
        assert.equal(db.documents.length, 1);
        const document = db.documents[0];
        assert.equal(document.fileSize, MAX_ATTACHMENT_BYTES);
        assert.equal(document.dataUrl.length, dataPrefix.length + MAX_ATTACHMENT_BASE64_LENGTH);
        assert.equal(
          document.dataUrl.slice(0, dataPrefix.length + pdfHeader.length),
          dataPrefix + pdfHeader,
        );
        assert.equal(document.dataUrl.slice(-4), 'AA==');
        assert.equal(db.requests.find((r) => r.id === document.leaveId).employeeId, 1);
        await writeFile(file, JSON.stringify(fixture));
      },
    );
    await t.test(
      'The encoded payload cannot bypass 25 MiB by claiming a smaller fileSize',
      async () => {
        const response = await stream(
          streamedCommand(input(attachment(MAX_ATTACHMENT_BYTES)), MAX_ATTACHMENT_BYTES + 1),
        );
        assert.equal(response.status, 400);
        assert.match((await response.json()).message, /25 MB|ขนาดเอกสาร/);
        assert.deepEqual(await read(), fixture);
      },
    );
    await t.test(
      'Direct API requests reject declared oversize, malformed size and mismatched data',
      async () => {
        const validSmall = dataPrefix + Buffer.from('%PDF-1.7\n').toString('base64');
        for (const fileSize of [MAX_ATTACHMENT_BYTES + 1, -1, 0, 1.5, '9', null]) {
          const response = await send({
            type: 'submit',
            input: input(
              /** @type {AttachmentInput} */ ({ ...attachment(9), fileSize, dataUrl: validSmall }),
            ),
          });
          assert.equal(response.status, 400);
          assert.match((await response.json()).message, /25 MB|ข้อมูลเอกสาร|ขนาดเอกสาร/);
        }
        const mismatch = await send({
          type: 'submit',
          input: input({ ...attachment(8), dataUrl: validSmall }),
        });
        assert.equal(mismatch.status, 400);
        assert.match((await mismatch.json()).message, /ขนาดเอกสาร/);
        assert.deepEqual(await read(), fixture);
      },
    );
    await t.test(
      'Chunked command bodies exceeding the base64 allowance return readable JSON 413',
      async () => {
        function* tooLarge() {
          let remaining = MAX_COMMAND_BODY_BYTES + 1;
          while (remaining > 0) {
            const length = Math.min(remaining, zeroChunk.length);
            yield zeroChunk.slice(0, length);
            remaining -= length;
          }
        }
        const response = await stream(tooLarge());
        assert.equal(response.status, 413);
        assert.equal((await response.json()).code, 'PAYLOAD_TOO_LARGE');
        assert.deepEqual(await read(), fixture);
        assert.equal((await fetch(base + '/health')).status, 200);
      },
    );
    await t.test(
      'Login retains a small body limit and commands authenticate before reading large bodies',
      async () => {
        const declaredLength = await fetch(base + '/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'x'.repeat(64 * 1024 + 1),
        });
        assert.equal(declaredLength.status, 413);
        assert.equal((await declaredLength.json()).code, 'PAYLOAD_TOO_LARGE');
        const loginResponse = await stream(['x'.repeat(64 * 1024 + 1)], '', '/session');
        assert.equal(loginResponse.status, 413);
        assert.equal((await loginResponse.json()).code, 'PAYLOAD_TOO_LARGE');
        const unauthenticated = await stream(['x'.repeat(64 * 1024 + 1)], '');
        assert.equal(unauthenticated.status, 401);
        assert.equal((await unauthenticated.json()).code, 'UNAUTHENTICATED');
        assert.deepEqual(await read(), fixture);
      },
    );
  },
);
