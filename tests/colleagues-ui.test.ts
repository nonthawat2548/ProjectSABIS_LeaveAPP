import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createDemoDatabase } from '../src/data/demoDatabase';
import { formatDate, today } from '../src/domain/date';
import { visibleSnapshot } from '../src/domain/service';
import type { ColleagueStatus, Database } from '../src/domain/types';
import { repository } from '../src/data';
import { searchColleagues } from '../src/domain/colleagues';

test('Colleague search interactions show minimal availability with BE dates and handle loading, errors and refresh', async t => {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/#/colleagues' });
    const replacements = { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
    const originals = new Map(Object.keys(replacements).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const [name, value] of Object.entries(replacements)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    const { createRoot } = await import('react-dom/client');
    const { ColleaguesPage } = await import('../src/ColleaguesPage');
    const root = createRoot(dom.window.document.getElementById('root')!), document = dom.window.document;
    const originalLookup = repository.searchColleagues;
    const full = createDemoDatabase(), person = full.employees.find(e => e.id === 8)!;
    const row: ColleagueStatus = { employeeId: person.id, name: person.name, position: person.position, department: person.department, date: '2026-12-05', workStatus: 'WFH', leaveDuration: null, updatedAt: '2026-12-05T02:00:00.000Z' };
    const calls: Array<{ query: string; date: string }> = [];
    const all = async (query: string, date: string) => searchColleagues(full, actorId, query, date);
    let lookup: (query: string, date: string) => Promise<ColleagueStatus[]> = all;
    repository.searchColleagues = async (query, date) => { calls.push({ query, date }); return lookup(query, date) };
    let mount = 0, actorId = 1, snapshot = visibleSnapshot(full, actorId);
    async function render(reset = true, id = actorId, db: Database = snapshot, initialLookup = all) {
        if (reset) { mount++; calls.length = 0; actorId = id; snapshot = db; lookup = initialLookup }
        await act(() => root.render(createElement(ColleaguesPage, { key: mount, actor: full.employees.find(e => e.id === id)!, db, run: async () => ({ message: '' }), reload: async () => { } })));
    }
    async function type(input: HTMLInputElement, value: string) {
        await act(() => {
            Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
            input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
    }
    const query = () => document.getElementById('colleague-query') as HTMLInputElement;
    const date = () => document.querySelector<HTMLInputElement>('.date-field input')!;
    const text = () => document.getElementById('root')!.textContent!;
    const alert = () => document.querySelector('[role="alert"]')?.textContent;
    async function submit() {
        await act(async () => { document.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve() });
    }
    function deferred() {
        let resolve!: (value: ColleagueStatus[]) => void;
        const promise = new Promise<ColleagueStatus[]>(done => { resolve = done });
        return { promise, resolve };
    }
    t.after(async () => {
        await act(() => root.unmount()); repository.searchColleagues = originalLookup; dom.window.close();
        for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name) }
    });

    await t.test('All roles automatically see everyone with the current BE date in either theme', async () => {
        for (const id of [1, 4, 5]) for (const theme of ['light', 'dark']) {
            document.documentElement.dataset.theme = theme;
            await render(true, id, visibleSnapshot(full, id));
            assert.equal(date().value, formatDate(today()));
            assert.equal(document.querySelector('.page-heading h1')?.textContent, 'สถานะเพื่อนร่วมงาน');
            assert.equal(document.querySelectorAll('.colleague-results li').length, 10);
            assert.deepEqual(calls, [{ query: '', date: today() }]);
            assert(text().includes('พนักงานทั้งหมด 10 คน'));
            assert.equal(document.querySelector('.colleague-intro'), null);
        }
    });

    await t.test('A name search crosses departments through the repository, sends ISO dates and shows no private leave details', async () => {
        await render(true, 1, visibleSnapshot(full, 1));
        assert(!snapshot.employees.some(e => e.id === person.id));
        calls.length = 0;
        lookup = async () => [row];
        await type(query(), person.name.split(' ')[0]); await type(date(), '5/12/2569'); await submit();
        assert.deepEqual(calls, [{ query: person.name.split(' ')[0], date: '2026-12-05' }]);
        assert(text().includes(person.name)); assert(text().includes('EMP-00008'));
        assert(text().includes('ทำงานจากบ้าน (WFH)')); assert(text().includes('สถานะวันที่ 5/12/2569'));
        assert(text().includes('5/12/2569 · 09:00'));
        await act(() => date().dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })));
        assert(text().includes(person.name), 'Normalizing an unchanged date on blur must preserve search results');
        assert.equal(calls.length, 1);
        assert(!text().includes(person.email)); assert(!text().includes(person.phone));
        assert.equal(document.querySelector('.colleague-results a'), null);
        await type(query(), '8');
        assert(text().includes(person.name), 'Draft edits preserve the list until a filter is applied');
        await submit(); assert.equal(calls.at(-1)!.query, '8');
    });

    await t.test('Show everyone clears the filter and blank queries list all people for the chosen date', async () => {
        await render(); await type(query(), 'EMP-00008'); await type(date(), '5/12/2569'); await submit();
        assert.equal(document.querySelectorAll('.colleague-results li').length, 1);
        const reset = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'แสดงทุกคน')!;
        await act(async () => { reset.click(); await Promise.resolve() });
        assert.equal(query().value, ''); assert.equal(date().value, '5/12/2569');
        assert.deepEqual(calls.at(-1), { query: '', date: '2026-12-05' });
        assert.equal(document.querySelectorAll('.colleague-results li').length, 10);
        assert(text().includes('พนักงานทั้งหมด 10 คน · สถานะวันที่ 5/12/2569'));
        await type(query(), '   '); await type(date(), '1/1/2570'); await submit();
        assert.deepEqual(calls.at(-1), { query: '', date: '2027-01-01' });
        assert.equal(document.querySelectorAll('.colleague-results li').length, 10);
    });

    await t.test('The automatic initial load handles delays and failures and can retry without a search term', async () => {
        const pending = deferred();
        await render(true, 1, visibleSnapshot(full, 1), async () => pending.promise);
        assert.equal(query().disabled, true);
        assert(text().includes('กำลังโหลดสถานะเพื่อนร่วมงาน'));
        await act(async () => { pending.resolve(await all('', today())); await pending.promise });
        assert.equal(document.querySelectorAll('.colleague-results li').length, 10);
        assert.equal(query().disabled, false);
        await render(true, 1, snapshot, async () => { throw new Error('โหลดสถานะไม่สำเร็จ กรุณาลองอีกครั้ง') });
        assert.match(alert()!, /โหลดสถานะไม่สำเร็จ/); assert.equal(query().disabled, false);
        lookup = all; await submit();
        assert.equal(alert(), undefined); assert.equal(query().value, '');
        assert.equal(document.querySelectorAll('.colleague-results li').length, 10);
    });

    await t.test('Full and half-day leave remain explicit, while missing records do not become in-office', async () => {
        await render();
        lookup = async () => [
            { ...row, employeeId: 1, name: full.employees[0].name, workStatus: 'In-office' },
            { ...row, employeeId: 2, workStatus: 'Outside' },
            { ...row, employeeId: 3, workStatus: null, updatedAt: null },
            { ...row, employeeId: 4, workStatus: null, updatedAt: null, leaveDuration: 'Full' },
            { ...row, employeeId: 5, leaveDuration: 'AM' },
            { ...row, employeeId: 6, workStatus: null, updatedAt: null, leaveDuration: 'PM' },
        ];
        await type(query(), 'พนักงาน'); await submit();
        const cards = [...document.querySelectorAll('.colleague-results li')];
        assert.equal(cards.length, 6);
        assert(cards[0].textContent?.includes('· คุณ'));
        assert(cards[0].textContent?.includes('ทำงานที่สำนักงาน'));
        assert(cards[1].textContent?.includes('ปฏิบัติงานนอกสถานที่'));
        assert(cards[2].textContent?.includes('ยังไม่ได้ระบุสถานะ'));
        assert(cards[2].textContent?.includes('ยังไม่มีข้อมูลสถานะในวันที่เลือก'));
        assert.equal(cards[3].querySelector('.work-badge')?.textContent, 'ลาเต็มวัน');
        assert.deepEqual([...cards[4].querySelectorAll('.work-badge')].map(e => e.textContent), ['ทำงานจากบ้าน (WFH)', 'ลาครึ่งวันเช้า']);
        assert.deepEqual([...cards[5].querySelectorAll('.work-badge')].map(e => e.textContent), ['ยังไม่ได้ระบุสถานะ', 'ลาครึ่งวันบ่าย']);
        assert(cards[4].textContent?.includes('สถานะลาจากคำขอที่อนุมัติแล้ว'));
    });

    await t.test('Invalid inputs stop before the repository, and failures can be retried or replaced by an empty result', async () => {
        await render(); calls.length = 0;
        await type(query(), 'EMP-00008'); assert.equal(alert(), undefined);
        await type(date(), '31/2/2569'); await submit(); assert.match(alert()!, /วัน\/เดือน\/ปี พ.ศ./); assert.equal(calls.length, 0);
        await type(date(), '5/12/2569'); lookup = async () => { throw new Error('เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง') }; await submit();
        assert.match(alert()!, /เชื่อมต่อระบบไม่สำเร็จ/); assert.equal(query().disabled, false);
        lookup = async () => [row]; await submit(); assert.equal(alert(), undefined); assert(text().includes(person.name));
        await type(date(), '6/12/2569'); assert(text().includes('สถานะวันที่ 5/12/2569'));
        lookup = async () => []; await submit();
        assert(text().includes('พบ 0 คน')); assert(text().includes('ไม่พบพนักงานที่ตรงกับชื่อหรือรหัสนี้'));
    });

    await t.test('Pending lookups disable controls and ignore duplicate submissions until the response arrives', async () => {
        await render(); calls.length = 0; const pending = deferred(); lookup = async () => pending.promise;
        await type(query(), '8'); await submit();
        assert.equal(query().disabled, true); assert.equal(date().disabled, true);
        assert.equal(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!.disabled, true);
        assert(text().includes('กำลังโหลดสถานะเพื่อนร่วมงาน'));
        await submit(); assert.equal(calls.length, 1);
        await act(async () => { pending.resolve([row]); await pending.promise });
        assert.equal(query().disabled, false); assert(text().includes(person.name));
    });

    await t.test('Snapshot refresh updates the last search and a late older response cannot overwrite current availability', async () => {
        await render(); calls.length = 0; const first = deferred(), refreshed = deferred(); let requests = 0;
        lookup = async () => ++requests === 1 ? first.promise : refreshed.promise;
        await type(query(), 'EMP-00008'); await type(date(), '5/12/2569'); await submit();
        await render(false, actorId, structuredClone(snapshot));
        assert.deepEqual(calls, [{ query: 'EMP-00008', date: '2026-12-05' }, { query: 'EMP-00008', date: '2026-12-05' }]);
        await act(async () => { refreshed.resolve([{ ...row, workStatus: 'Outside' }]); await refreshed.promise });
        assert(text().includes('ปฏิบัติงานนอกสถานที่'));
        await act(async () => { first.resolve([row]); await first.promise });
        assert(text().includes('ปฏิบัติงานนอกสถานที่')); assert(!text().includes('ทำงานจากบ้าน (WFH)'));
        await type(query(), 'other'); await render(false, actorId, structuredClone(snapshot));
        assert.equal(calls.length, 3, 'Draft edits keep refreshing the last applied filter');
        assert.deepEqual(calls.at(-1), { query: 'EMP-00008', date: '2026-12-05' });
    });

    await t.test('A response that arrives after leaving the page is discarded', async () => {
        await render(); const pending = deferred(); lookup = async () => pending.promise;
        await type(query(), '8'); await submit();
        await act(() => root.render(null));
        await act(async () => { pending.resolve([row]); await pending.promise });
        assert.equal(text(), '');
    });
});
