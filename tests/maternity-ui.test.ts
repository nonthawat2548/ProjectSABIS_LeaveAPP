import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createSeed } from '../src/domain/seed';
import { addDays, formatDate, today } from '../src/domain/date';
import { applyCommand, balance } from '../src/domain/service';
import type { Command, Database } from '../src/domain/types';

test('Maternity form explains eligibility and reviews the selected case before sending ISO dates', async t => {
    // Interaction verification in jsdom, not a real-browser layout or accessibility audit.
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/#/new' });
    const globals = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
    const saved = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    dom.window.scrollTo = () => { };
    const { createRoot } = await import('react-dom/client');
    const { LeaveForm, AdminPage } = await import('../src/pages');
    const root = createRoot(dom.window.document.getElementById('root')!);
    const document = dom.window.document;
    let mount = 0, commands: Command[] = [];
    function fixture() {
        const db = createSeed();
        db.requests = []; db.days = []; db.documents = []; db.approvals = []; db.notifications = [];
        db.maternityCases[0].maximumDays = 9;
        return db;
    }
    async function render(db: Database, actorId: number, editId?: number) {
        commands = [];
        const actor = structuredClone(db.employees.find(e => e.id === actorId)!);
        await act(() => root.render(createElement(LeaveForm, { key: ++mount, db, actor, editId, reload: async () => { }, run: async c => { commands.push(structuredClone(c)); return applyCommand(db, actorId, c) } })));
    }
    async function choose(id: string, value: string) {
        await act(() => { const select = document.getElementById(id) as HTMLSelectElement; select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })) });
    }
    async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
        await act(() => {
            const prototype = input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
            input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
    }
    async function submit(form = document.querySelector('form')!) {
        await act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve() });
    }
    const dates = () => [...document.querySelectorAll<HTMLInputElement>('.date-field input')];
    const text = () => document.getElementById('root')!.textContent!;
    const alert = () => document.querySelector('[role="alert"]')?.textContent;
    const review = () => document.querySelector('.page-heading h1')?.textContent === 'ตรวจสอบก่อนส่งคำขอ';
    function summary(label: string) {
        const row = [...document.querySelectorAll('.key-row')].find(row => row.firstElementChild?.textContent === label);
        return row?.querySelector('strong')?.textContent;
    }
    t.after(async () => {
        await act(() => root.unmount()); dom.window.close();
        for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name) }
    });

    await t.test('Male, Other and missing gender see a disabled maternity option and a specific explanation', async () => {
        for (const gender of ['Male', 'Other', undefined, 'invalid']) {
            const db = fixture(); Object.assign(db.employees.find(e => e.id === 2)!, { gender });
            for (const theme of ['light', 'dark']) {
                document.documentElement.dataset.theme = theme;
                await render(db, 2);
                const option = document.querySelector<HTMLOptionElement>('#leave-type option[value="4"]')!;
                assert(option && option.disabled);
                assert(text().includes(gender === 'Male' ? 'พนักงานชายไม่มีสิทธิ์ยื่นลาคลอด' : 'ติดต่อ HR เพื่อตรวจสอบข้อมูลเพศ'));
                assert.equal(document.querySelector('[name="gender"]'), null);
                // Even scripted attempts to select a disabled option cannot skip the stored-gender rule.
                await choose('leave-type', '4');
                await type(dates()[0], '');
                await submit();
                assert.match(alert()!, gender === 'Male' ? /พนักงานชาย/ : /ข้อมูลเพศ/);
                assert(!review()); assert.equal(commands.length, 0);
            }
        }
    });

    await t.test('A woman without a case receives HR contact links before an invalid-date error', async () => {
        const db = fixture(); await render(db, 1);
        await choose('leave-type', '4');
        assert((document.getElementById('leave-case') as HTMLSelectElement).disabled);
        assert(text().includes('ยังไม่มีกรณีลาคลอด กรุณาติดต่อ HR เพื่อเปิดกรณีก่อนยื่นคำขอ'));
        assert.equal(document.querySelector('.hr-contact a')?.getAttribute('href'), 'mailto:hr@demo.local');
        assert(document.querySelector('.hr-contact a[href^="tel:"]'));
        await type(dates()[0], 'invalid');
        await submit();
        assert.match(alert()!, /^ยังไม่มีกรณีลาคลอด/);
        assert(!review()); assert.equal(commands.length, 0);
    });

    await t.test('Case summaries use custom maximum, approved and pending totals for that case', async () => {
        const db = fixture(), start = addDays(today(), 40);
        const data = { leaveTypeId: 4, maternityCaseId: 1, startDate: start, endDate: addDays(start, 2), duration: 'Full' as const, reason: 'พักฟื้น' };
        const used = applyCommand(db, 3, { type: 'submit', input: data }).id!;
        applyCommand(db, 4, { type: 'approve', id: used, version: 1, comment: '' });
        applyCommand(db, 3, { type: 'submit', input: { ...data, startDate: addDays(start, 10), endDate: addDays(start, 10) } });
        db.maternityCases.push({ id: 2, employeeId: 3, caseNo: 2, maximumDays: 17 });
        await render(db, 3); await choose('leave-type', '4'); await choose('leave-case', '1');
        assert.equal(summary('กรณีที่เลือก'), 'กรณีที่ 1');
        assert.equal(summary('สิทธิ์ทั้งหมดของกรณี'), '9 วัน');
        assert.equal(summary('ใช้แล้ว'), '3 วัน');
        assert.equal(summary('รอพิจารณา'), '1 วัน');
        assert.equal(summary('คงเหลือ'), '6 วัน');
        assert.equal(summary('สิทธิ์ที่ขอเพิ่มได้'), '5 วัน');
        await choose('leave-case', '2');
        assert.equal(summary('สิทธิ์ทั้งหมดของกรณี'), '17 วัน');
        assert.equal(summary('ใช้แล้ว'), '0 วัน');
        assert.equal(summary('รอพิจารณา'), '0 วัน');
        assert.equal((document.getElementById('leave-duration') as HTMLSelectElement).options.length, 1);
        assert(text().includes('แม้ข้ามปี ไม่แยกเป็นโควตารายปี'));
    });

    await t.test('Review shows the case and BE dates; confirmation sends only ISO dates and case ID', async () => {
        const db = fixture(); await render(db, 3); await choose('leave-type', '4'); await choose('leave-case', '1');
        const year = Number(today().slice(0, 4)) + 1, start = year + '-12-31', end = (year + 1) + '-01-02';
        await type(dates()[0], formatDate(start)); await type(dates()[1], formatDate(end));
        await type(document.getElementById('leave-reason') as HTMLTextAreaElement, 'ลาเพื่อคลอดบุตร');
        await submit();
        assert(review()); assert.equal(commands.length, 0, 'Review is not a submit command');
        assert.equal(summary('กรณีลาคลอด'), 'กรณีที่ 1');
        assert.equal(summary('สิทธิ์ทั้งหมด'), '9 วัน');
        assert.equal(summary('จำนวนวันลา'), '3 วัน');
        assert(text().includes(formatDate(start)) && text().includes(formatDate(end)));
        const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('ยืนยันส่งคำขอ'))!;
        await act(async () => { confirm.click(); await Promise.resolve() });
        assert.equal(commands.length, 1);
        const command = commands[0]; assert.equal(command.type, 'submit');
        if (command.type !== 'submit') throw new Error('Expected submit');
        assert.equal(command.input.startDate, start); assert.equal(command.input.endDate, end);
        assert.equal(command.input.maternityCaseId, 1); assert.equal(command.input.duration, 'Full');
        assert(!('gender' in command.input));
        assert(text().includes('ส่งคำขอเรียบร้อย'));
        assert.equal(balance(db, 3, 4, 0, 1).used, 0);
        assert.equal(balance(db, 3, 4, 0, 1).pending, 3);
    });

    await t.test('Switching types clears maternity selection and errors while preserving normal leave', async () => {
        const db = fixture(); await render(db, 3); await choose('leave-type', '4'); await choose('leave-case', '1');
        await submit(); assert.match(alert()!, /ระบุเหตุผล/);
        await choose('leave-type', '2');
        assert.equal(alert(), undefined); assert.equal(document.getElementById('leave-case'), null);
        assert.equal((document.getElementById('leave-duration') as HTMLSelectElement).options.length, 3);
        await choose('leave-type', '4');
        assert.equal((document.getElementById('leave-case') as HTMLSelectElement).value, '');
        assert(text().includes('เลือกกรณีลาคลอดเพื่อดูสิทธิ์'));
        await choose('leave-type', '2');
        await type(document.getElementById('leave-reason') as HTMLTextAreaElement, 'พักรักษาตัว');
        await submit(); assert(review());
        const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('ยืนยันส่งคำขอ'))!;
        await act(async () => { confirm.click(); await Promise.resolve() });
        const command = commands[0];
        assert(command.type === 'submit'); assert.equal(command.input.leaveTypeId, 2); assert.equal(command.input.maternityCaseId, null);
    });

    await t.test('Editing a case with no spare capacity excludes the old request from displayed pending', async () => {
        const db = fixture(); db.maternityCases[0].maximumDays = 3;
        const start = addDays(today(), 40);
        const id = applyCommand(db, 3, { type: 'submit', input: { leaveTypeId: 4, maternityCaseId: 1, startDate: start, endDate: addDays(start, 2), duration: 'Full', reason: 'ลาเพื่อคลอดบุตร' } }).id!;
        await render(db, 3, id);
        assert.equal(summary('รอพิจารณา (ไม่รวมคำขอนี้)'), '0 วัน');
        assert.equal(summary('คำขอนี้'), '3 วัน');
        assert.equal(summary('สิทธิ์ที่ขอเพิ่มได้'), '3 วัน');
        await submit(); assert(review());
        const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('ยืนยันส่งคำขอ'))!;
        await act(async () => { confirm.click(); await Promise.resolve() });
        assert.equal(db.requests.find(r => r.id === id)!.version, 2);
        assert.equal(balance(db, 3, 4, 0, 1).pending, 3);
    });

    await t.test('HR case opening uses the selected employee and a policy default without fixed days', async () => {
        const db = fixture(); db.employees.find(e => e.id === 5)!.gender = 'Male'; db.leaveTypes.find(t => t.id === 4)!.defaultQuotaDays = 17;
        commands = [];
        await act(() => root.render(createElement(AdminPage, { key: ++mount, db, actor: db.employees.find(e => e.id === 5)!, reload: async () => { }, run: async c => { commands.push(structuredClone(c)); return applyCommand(db, 5, c) } })));
        assert.equal((document.getElementById('case-maximum') as HTMLInputElement).value, '17');
        await choose('admin-employee', '2');
        assert.equal(document.getElementById('case-maximum'), null); assert(text().includes('พนักงานชายไม่มีสิทธิ์'));
        await choose('admin-employee', '6');
        assert.equal(document.getElementById('case-maximum'), null); assert(text().includes('ติดต่อ HR เพื่อตรวจสอบข้อมูลเพศ'));
        await choose('admin-employee', '3');
        const maximum = document.getElementById('case-maximum') as HTMLInputElement;
        await type(maximum, '8'); await submit(maximum.closest('form')!);
        assert.deepEqual(commands[0], { type: 'maternity', employeeId: 3, maximumDays: 8 });
        assert(db.maternityCases.some(c => c.employeeId === 3 && c.maximumDays === 8));
    });
});
