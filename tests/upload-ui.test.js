/**
 * @typedef {import('../src/domain/types.js').Command} Command
 * @typedef {import('../src/domain/types.js').LeaveDocument} LeaveDocument
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createSeed } from '../src/domain/seed.js';
import { applyCommand } from '../src/domain/service.js';
import { MAX_ATTACHMENT_BYTES } from '../src/domain/attachments.js';
test('Attachment UI uses the 25 MB limit and keeps readable documents when replacements fail', async (t) => {
  // FileReader is controlled here; real browser file I/O is verified separately.
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/#/new',
  });
  class ControlledReader {
    /**
     * @type {ControlledReader[]}
     */
    static pending = [];
    /**
     * @type {string | null}
     */
    result = null;
    /**
     * @type {(() => void) | null}
     */
    onload = null;
    /**
     * @type {(() => void) | null}
     */
    onerror = null;
    /**
     * @type {File}
     */
    file;
    /**
     * @param {File} file
     */
    readAsDataURL(file) {
      this.file = file;
      ControlledReader.pending.push(this);
    }
    /**
     * @param {string} dataUrl
     */
    complete(dataUrl) {
      this.result = dataUrl;
      this.onload?.();
    }
    fail() {
      this.onerror?.();
    }
  }
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    FileReader: ControlledReader,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = new Map(
    Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  for (const [name, value] of Object.entries(globals))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  dom.window.scrollTo = () => {};
  const { createRoot } = await import('react-dom/client');
  const { LeaveForm } = await import('../src/pages.jsx');
  const { DocumentRow } = await import('../src/components.jsx');
  const root = createRoot(dom.window.document.getElementById('root'));
  const document = dom.window.document;
  let mount = 0;
  function fixture() {
    const db = createSeed();
    db.requests = [];
    db.days = [];
    db.documents = [];
    db.approvals = [];
    db.notifications = [];
    return db;
  }
  const db = fixture(),
    actor = db.employees.find((e) => e.id === 1);
  /**
   * @type {Command[]}
   */
  const commands = [];
  async function renderForm() {
    ControlledReader.pending = [];
    commands.length = 0;
    await act(() =>
      root.render(
        createElement(LeaveForm, {
          key: ++mount,
          db,
          actor,
          reload: async () => {},
          run: async (command) => {
            commands.push(command);
            return applyCommand(db, actor.id, command);
          },
        }),
      ),
    );
  }
  const input = () => /** @type {HTMLInputElement} */ (document.getElementById('leave-document'));
  const alert = () => document.querySelector('[role="alert"]')?.textContent;
  const selected = () => document.querySelector('.file-row .file-info')?.textContent;
  const checkButton = () =>
    [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('ตรวจสอบคำขอ'),
    );
  /**
   * @param {number} size
   * @param {any} [name]
   * @param {any} [type]
   */
  async function chooseFile(size, name = 'certificate.pdf', type = 'application/pdf') {
    // Metadata is sufficient for testing early rejection; it does not allocate oversized files.
    await act(async () => {
      Object.defineProperty(input(), 'files', {
        configurable: true,
        value: [{ name, type, size }],
      });
      input().dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await Promise.resolve();
    });
  }
  /**
   * @param {string} dataUrl
   */
  async function completeReader(dataUrl) {
    await act(async () => {
      ControlledReader.pending.at(-1).complete(dataUrl);
      await Promise.resolve();
    });
  }
  async function failReader() {
    await act(async () => {
      ControlledReader.pending.at(-1).fail();
      await Promise.resolve();
    });
  }
  /**
   * @param {string} value
   */
  async function writeReason(value) {
    await act(() => {
      const field = /** @type {HTMLTextAreaElement} */ (document.getElementById('leave-reason'));
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(
        field,
        value,
      );
      field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  }
  const bytes = Buffer.alloc(3 * 1024 * 1024, 0x41);
  bytes.write('%PDF-1.7\n');
  const largePdf = 'data:application/pdf;base64,' + bytes.toString('base64');
  const tinyPdfBytes = Buffer.from('%PDF-1.7\nexisting document');
  const tinyPdf = 'data:application/pdf;base64,' + tinyPdfBytes.toString('base64');
  t.after(async () => {
    await act(() => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  await t.test(
    'A PDF larger than the previous 2 MB limit can be read, reviewed and submitted',
    async () => {
      await renderForm();
      assert(document.querySelector('.upload-box p')?.textContent?.includes('25 MB'));
      const picker = document.querySelector('button[aria-label="เลือกไฟล์เอกสารประกอบ"]');
      assert.equal(picker.textContent, 'เลือกไฟล์');
      assert.equal(input().hidden, true);
      let pickerClicks = 0;
      input().addEventListener('click', () => pickerClicks++);
      await act(() => picker.click());
      assert.equal(pickerClicks, 1, 'The translated control opens the native file input');
      await chooseFile(bytes.length, 'large-certificate.pdf');
      assert.equal(ControlledReader.pending.length, 1);
      assert.equal(input().disabled, true);
      assert.equal(checkButton().disabled, true);
      assert.equal(picker.disabled, true);
      await act(() => picker.click());
      assert.equal(
        pickerClicks,
        1,
        'File selection stays disabled while the previous file is being read',
      );
      assert.equal(document.querySelector('[role="status"]')?.textContent, 'กำลังอ่านเอกสาร…');
      await completeReader(largePdf);
      assert.equal(selected(), 'large-certificate.pdf');
      assert.equal(alert(), undefined);
      assert.equal(input().disabled, false);
      assert.equal(checkButton().disabled, false);
      await act(() => {
        const type = /** @type {HTMLSelectElement} */ (document.getElementById('leave-type'));
        type.value = '2';
        type.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
      await writeReason('พักรักษาตัวพร้อมใบรับรองแพทย์');
      await act(() =>
        document
          .querySelector('form')
          .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })),
      );
      assert.equal(document.querySelector('.page-heading h1')?.textContent, 'ตรวจสอบก่อนส่งคำขอ');
      const confirm = [...document.querySelectorAll('button')].find((button) =>
        button.textContent?.includes('ยืนยันส่งคำขอ'),
      );
      await act(async () => {
        confirm.click();
        await Promise.resolve();
      });
      const command = commands[0];
      assert.equal(command.type, 'submit');
      if (command.type !== 'submit') throw new Error('Expected submit command');
      assert.equal(command.input.attachment?.fileSize, bytes.length);
      assert.equal(command.input.attachment?.dataUrl, largePdf);
      assert.equal(db.documents[0].fileSize, bytes.length);
      assert(document.getElementById('root')?.textContent?.includes('ส่งคำขอเรียบร้อย'));
    },
  );
  await t.test(
    'Exactly 25 MB reaches the reader; larger, empty and unsupported files are rejected before reading',
    async () => {
      await renderForm();
      await chooseFile(MAX_ATTACHMENT_BYTES, 'maximum.pdf');
      assert.equal(ControlledReader.pending.length, 1);
      assert.equal(ControlledReader.pending[0].file?.size, MAX_ATTACHMENT_BYTES);
      assert.equal(alert(), undefined);
      await failReader();
      for (const [size, type] of /** @type {const} */ ([
        [MAX_ATTACHMENT_BYTES + 1, 'application/pdf'],
        [0, 'application/pdf'],
        [100, 'text/plain'],
      ])) {
        await chooseFile(size, 'invalid-file', type);
        assert.equal(
          ControlledReader.pending.length,
          1,
          'Rejected metadata must not start FileReader',
        );
        assert.match(alert(), /25 MB/);
        assert.equal(input().disabled, false);
        assert.equal(checkButton().disabled, false);
      }
    },
  );
  await t.test(
    'Failed or oversized replacements preserve the previous selected attachment',
    async () => {
      await renderForm();
      await chooseFile(tinyPdfBytes.length, 'previous.pdf');
      await completeReader(tinyPdf);
      assert.equal(selected(), 'previous.pdf');
      await chooseFile(MAX_ATTACHMENT_BYTES + 1, 'oversized.pdf');
      assert.equal(selected(), 'previous.pdf');
      assert.match(alert(), /25 MB/);
      await chooseFile(100, 'unreadable.pdf');
      assert.equal(selected(), 'previous.pdf');
      assert.equal(input().disabled, true);
      await failReader();
      assert.equal(selected(), 'previous.pdf');
      assert.match(alert(), /อ่านไฟล์ไม่สำเร็จ/);
      assert.equal(input().disabled, false);
      assert.equal(checkButton().disabled, false);
      const wrongContent = Buffer.from('not a PDF');
      await chooseFile(wrongContent.length, 'wrong-content.pdf');
      await completeReader('data:application/pdf;base64,' + wrongContent.toString('base64'));
      assert.equal(selected(), 'previous.pdf');
      assert.match(alert(), /เนื้อหาเอกสารไม่ตรงกับชนิดไฟล์/);
      await chooseFile(tinyPdfBytes.length, 'replacement.pdf');
      await completeReader(tinyPdf);
      assert.equal(selected(), 'replacement.pdf');
      assert.equal(alert(), undefined);
    },
  );
  await t.test(
    'Downloading a multi-chunk attachment preserves the exact bytes and displays its size in MB',
    async () => {
      /**
       * @type {LeaveDocument}
       */
      const documentInput = {
        id: 1,
        leaveId: 1,
        documentType: 'Medical Certificate',
        fileName: 'download.pdf',
        storageKey: 'local/1',
        fileType: 'application/pdf',
        fileSize: bytes.length,
        dataUrl: largePdf,
        uploadedAt: '2026-10-10T00:00:00.000Z',
      };
      let blob,
        download = '';
      const createObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
      const revokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
      const originalClick = dom.window.HTMLAnchorElement.prototype.click;
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: (value) => {
          blob = value;
          return 'blob:upload-test';
        },
      });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
      dom.window.HTMLAnchorElement.prototype.click = function () {
        download = this.download;
      };
      try {
        await act(() => root.render(createElement(DocumentRow, { document: documentInput })));
        assert(document.querySelector('.file-info small')?.textContent?.startsWith('3 MB'));
        await act(() => document.querySelector('button').click());
        assert.equal(download, 'download.pdf');
        assert.equal(blob?.type, 'application/pdf');
        assert.equal(blob?.size, bytes.length);
        assert.deepEqual(Buffer.from(await blob.arrayBuffer()), bytes);
        assert.equal(alert(), undefined);
        const demoText = 'DEMO medical certificate',
          demo = {
            ...documentInput,
            fileName: 'medical_certificate_DEMO.txt',
            storageKey: 'demo/certificate',
            fileType: 'text/plain',
            fileSize: demoText.length,
            dataUrl: 'data:text/plain;charset=utf-8,' + encodeURIComponent(demoText),
          };
        await act(() => root.render(createElement(DocumentRow, { document: demo })));
        await act(() => document.querySelector('button').click());
        assert.equal(download, demo.fileName);
        assert.equal(blob.type, 'text/plain');
        assert.equal(await blob.text(), demoText);
        assert(document.querySelector('.file-info small')?.textContent?.startsWith('1 KB'));
        assert.equal(alert(), undefined);
      } finally {
        dom.window.HTMLAnchorElement.prototype.click = originalClick;
        if (createObjectURL) Object.defineProperty(URL, 'createObjectURL', createObjectURL);
        else Reflect.deleteProperty(URL, 'createObjectURL');
        if (revokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', revokeObjectURL);
        else Reflect.deleteProperty(URL, 'revokeObjectURL');
      }
    },
  );
});
