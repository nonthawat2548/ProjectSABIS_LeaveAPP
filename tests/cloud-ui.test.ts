import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import type { LeaveDocument } from '../src/domain/types';

test('Remote document UI prevents duplicate downloads, handles failure and retries with the original filename', async () => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
  });
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = new Map(
    Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const { createRoot } = await import('react-dom/client');
  const { DocumentRow } = await import('../src/components');
  const { repository } = await import('../src/data');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const original = repository.downloadDocument;
  const createUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
    revokeUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  let filename = '',
    calls = 0,
    resolve!: (blob: Blob) => void,
    reject!: (error: Error) => void;
  repository.downloadDocument = () => {
    calls++;
    return new Promise<Blob>((ok, no) => {
      resolve = ok;
      reject = no;
    });
  };
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => 'blob:remote-document',
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
  dom.window.HTMLAnchorElement.prototype.click = function () {
    filename = this.download;
  };
  try {
    const doc: LeaveDocument = {
      id: 4,
      leaveId: 1,
      fileName: 'หลักฐาน.pdf',
      documentType: 'Supporting Document',
      storageKey: 'cloud/4',
      fileType: 'application/pdf',
      fileSize: 10,
      uploadedAt: '2026-10-10T05:00:00.000Z',
      dataUrl: '',
      remote: true,
    };
    await act(() => root.render(createElement(DocumentRow, { document: doc })));
    const button = () => dom.window.document.querySelector<HTMLButtonElement>('button')!;
    await act(() => {
      button().click();
      button().click();
    });
    assert.equal(calls, 1);
    assert(button().disabled);
    assert.match(button().textContent!, /กำลังดาวน์โหลด/);
    await act(async () => {
      reject(new Error('การเชื่อมต่อขัดข้อง'));
      await Promise.resolve();
    });
    assert.equal(button().disabled, false);
    assert.match(
      dom.window.document.querySelector('[role=alert]')!.textContent!,
      /การเชื่อมต่อขัดข้อง/,
    );
    await act(() => button().click());
    assert.equal(calls, 2);
    assert.equal(dom.window.document.querySelector('[role=alert]'), null);
    await act(async () => {
      resolve(new Blob(['%PDF-1.7'], { type: 'application/pdf' }));
      await Promise.resolve();
    });
    assert.equal(filename, 'หลักฐาน.pdf');
    assert.equal(button().disabled, false);
  } finally {
    await act(() => root.unmount());
    if (original) repository.downloadDocument = original;
    else delete repository.downloadDocument;
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
    if (createUrl) Object.defineProperty(URL, 'createObjectURL', createUrl);
    if (revokeUrl) Object.defineProperty(URL, 'revokeObjectURL', revokeUrl);
    dom.window.close();
    for (const [key, value] of saved)
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
  }
});
