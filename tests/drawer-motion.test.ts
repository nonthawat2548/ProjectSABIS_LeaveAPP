import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement, useState } from 'react';
import { JSDOM } from 'jsdom';
import { WorkspaceNavigation } from '../src/Navigation';
import { createDemoDatabase } from '../src/data/demoDatabase';

test('Phone drawer motion keeps closing controls inaccessible and supports interruption', async t => {
    // Synthetic DOM plus mocked time verifies lifecycle and focus, not browser layout or animation.
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/#/dashboard' });
    const replacements = {
        window: dom.window,
        document: dom.window.document,
        HTMLElement: dom.window.HTMLElement,
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    const originals = new Map(Object.keys(replacements).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const [name, value] of Object.entries(replacements)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    let reducedMotion = false;
    let phone = true;
    const viewportListeners = new Set<() => void>();
    const viewport = {
        get matches() { return phone },
        media: '(max-width: 760px)',
        addEventListener: (_: string, listener: () => void) => viewportListeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => viewportListeners.delete(listener),
    };
    dom.window.matchMedia = query => query === '(max-width: 760px)' ? viewport as unknown as MediaQueryList : ({
        matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
        media: query,
        addEventListener: () => { },
        removeEventListener: () => { },
    } as unknown as MediaQueryList);
    const { createRoot } = await import('react-dom/client');
    const root = createRoot(dom.window.document.getElementById('root')!);
    const document = dom.window.document;
    const actor = createDemoDatabase().employees[0];
    function Harness() {
        const [open, setOpen] = useState(false);
        return createElement('div', null,
            createElement(WorkspaceNavigation, {
                actor, route: '/dashboard', menus: [{ path: '/dashboard', label: 'หน้าหลัก', icon: null }],
                unread: 0, open, onClose: () => setOpen(false), onLogout: () => { },
            }),
            createElement('main', { inert: open }, createElement('button', { id: 'toggle', onClick: () => setOpen(true) }, 'เปิดเมนู')));
    }
    let mount = 0;
    const toggle = () => document.querySelector<HTMLButtonElement>('#toggle')!;
    const panel = () => document.querySelector<HTMLElement>('#workspace-navigation')!;
    const closeButton = () => document.querySelector<HTMLButtonElement>('.mobile-menu-close')!;
    const backdrop = () => document.querySelector<HTMLButtonElement>('.mobile-menu-backdrop');
    async function render(tc: TestContext) {
        reducedMotion = false;
        phone = true;
        document.body.style.overflow = 'auto';
        tc.mock.timers.enable({ apis: ['setTimeout'] });
        tc.after(async () => { await act(() => root.render(null)) });
        await act(() => root.render(createElement(Harness, { key: ++mount })));
    }
    async function open() {
        toggle().focus();
        await act(() => toggle().click());
    }
    async function close() { await act(() => closeButton().click()) }
    async function advance(tc: TestContext, milliseconds: number) {
        await act(async () => { tc.mock.timers.tick(milliseconds) });
    }
    t.after(async () => {
        await act(() => root.unmount());
        assert.equal(viewportListeners.size, 0);
        dom.window.close();
        for (const [name, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else Reflect.deleteProperty(globalThis, name);
        }
    });

    await t.test('Closing retains the visual for 180 ms while immediately restoring page focus and scroll', async tc => {
        await render(tc);
        await open();
        assert.equal(panel().getAttribute('role'), 'dialog');
        assert.equal(document.activeElement, closeButton());
        assert.equal(document.body.style.overflow, 'hidden');
        await close();
        assert(panel().classList.contains('mobile-closing'));
        assert(panel().hasAttribute('inert'));
        assert.equal(panel().getAttribute('aria-hidden'), 'true');
        assert.equal(panel().getAttribute('role'), null);
        assert.equal(panel().getAttribute('aria-modal'), null);
        assert(backdrop()?.classList.contains('is-closing'));
        assert(backdrop()?.disabled);
        assert.equal(backdrop()?.getAttribute('aria-hidden'), 'true');
        assert(!document.querySelector('main')?.hasAttribute('inert'));
        assert.equal(document.body.style.overflow, 'auto');
        assert.equal(document.activeElement, toggle());
        await advance(tc, 179);
        assert(panel().classList.contains('mobile-closing'));
        assert(backdrop());
        await advance(tc, 1);
        assert(!panel().classList.contains('mobile-closing'));
        assert(!panel().hasAttribute('inert'));
        assert.equal(panel().getAttribute('aria-hidden'), null);
        assert.equal(backdrop(), null);
        assert.equal(document.activeElement, toggle());
    });

    await t.test('Reopening during an exit cancels the stale timer before a subsequent close', async tc => {
        await render(tc);
        await open();
        await close();
        await advance(tc, 80);
        await open();
        assert(panel().classList.contains('mobile-open'));
        assert(!panel().classList.contains('mobile-closing'));
        assert(!panel().hasAttribute('inert'));
        assert.equal(panel().getAttribute('aria-hidden'), null);
        assert.equal(panel().getAttribute('role'), 'dialog');
        assert.equal(panel().getAttribute('aria-modal'), 'true');
        assert(!backdrop()?.disabled);
        assert(!backdrop()?.classList.contains('is-closing'));
        assert(document.querySelector('main')?.hasAttribute('inert'));
        assert.equal(document.body.style.overflow, 'hidden');
        assert.equal(document.activeElement, closeButton());
        await advance(tc, 20);
        await close();
        // At the old exit deadline, a newer exit must still have its full remaining duration.
        await advance(tc, 80);
        assert(panel().classList.contains('mobile-closing'));
        assert(backdrop());
        await advance(tc, 99);
        assert(panel().classList.contains('mobile-closing'));
        await advance(tc, 1);
        assert(!panel().classList.contains('mobile-closing'));
        assert.equal(backdrop(), null);
        assert.equal(document.body.style.overflow, 'auto');
        assert.equal(document.activeElement, toggle());
    });

    await t.test('Reduced motion dismisses the visual immediately without delaying page access', async tc => {
        await render(tc);
        reducedMotion = true;
        await open();
        await close();
        assert(!panel().classList.contains('mobile-open'));
        assert(!panel().classList.contains('mobile-closing'));
        assert.equal(backdrop(), null);
        assert.equal(panel().getAttribute('role'), null);
        assert.equal(panel().getAttribute('aria-modal'), null);
        assert(!panel().hasAttribute('inert'));
        assert(!document.querySelector('main')?.hasAttribute('inert'));
        assert.equal(document.body.style.overflow, 'auto');
        assert.equal(document.activeElement, toggle());
        await advance(tc, 1000);
        assert.equal(backdrop(), null);
        assert(!panel().classList.contains('mobile-closing'));
    });

    await t.test('Resizing to desktop during an exit restores persistent navigation immediately', async tc => {
        await render(tc);
        await open();
        await close();
        await advance(tc, 80);
        assert(panel().classList.contains('mobile-closing'));
        assert(panel().hasAttribute('inert'));
        assert.equal(panel().getAttribute('aria-hidden'), 'true');
        await act(() => { phone = false; viewportListeners.forEach(listener => listener()) });
        assert(!panel().classList.contains('mobile-closing'));
        assert(!panel().hasAttribute('inert'));
        assert.equal(panel().getAttribute('aria-hidden'), null);
        assert.equal(panel().getAttribute('role'), null);
        assert.equal(panel().getAttribute('aria-modal'), null);
        assert.equal(backdrop(), null);
        assert(!document.querySelector('main')?.hasAttribute('inert'));
        assert.equal(document.body.style.overflow, 'auto');
        const navigationLink = panel().querySelector<HTMLAnchorElement>('nav a')!;
        navigationLink.focus();
        await advance(tc, 100);
        assert.equal(document.activeElement, navigationLink);
        assert(!panel().hasAttribute('inert'));
        assert.equal(panel().getAttribute('aria-hidden'), null);
        assert.equal(backdrop(), null);
    });
});
