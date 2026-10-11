import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { createDemoDatabase } from '../src/data/demoDatabase';
import { visibleSnapshot } from '../src/domain/service';
import type { Database } from '../src/domain/types';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline });
    return { promise, resolve, reject };
}

test('Sign-in prepares the workspace before revealing it and remains recoverable', async t => {
    // React DOM and mocked time verify interaction/state, not real browser layout or animation.
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/#/dashboard' });
    const replacements = {
        window: dom.window,
        document: dom.window.document,
        HTMLElement: dom.window.HTMLElement,
        sessionStorage: dom.window.sessionStorage,
        localStorage: dom.window.localStorage,
        location: dom.window.location,
        BroadcastChannel: undefined,
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    const originals = new Map(Object.keys(replacements).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const [name, value] of Object.entries(replacements)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    let reducedMotion = false;
    dom.window.matchMedia = query => ({
        matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
        media: query,
        addEventListener: () => { },
        removeEventListener: () => { },
    } as unknown as MediaQueryList);
    dom.window.scrollTo = () => { };
    const { createRoot } = await import('react-dom/client');
    const { default: App, Login } = await import('../src/App');
    const { repository } = await import('../src/data');
    const root = createRoot(dom.window.document.getElementById('root')!);
    const originalMethods = { login: repository.login, session: repository.session, snapshot: repository.snapshot, logout: repository.logout };
    const full = createDemoDatabase();
    const actor = full.employees[0];
    const snapshot = visibleSnapshot(full, actor.id);
    const document = dom.window.document;
    const transition = () => document.querySelector<HTMLElement>('.entry-transition');
    const workspace = () => document.querySelector<HTMLElement>('.app-shell');
    const form = () => document.querySelector<HTMLFormElement>('form')!;
    let mount = 0;
    async function render(tc: TestContext) {
        reducedMotion = false;
        repository.session = async () => null;
        repository.login = async () => actor;
        repository.snapshot = async () => snapshot;
        repository.logout = async () => { };
        tc.mock.timers.enable({ apis: ['setTimeout'] });
        tc.after(async () => { await act(() => root.render(null)) });
        await act(() => root.render(createElement(App, { key: ++mount })));
        assert(form(), 'An unauthenticated app must show the sign-in form');
        await act(() => document.querySelector<HTMLButtonElement>('.demo-accounts button')!.click());
        await choosePerson();
    }
    async function choosePerson() {
        await act(() => {
            const select = document.querySelector<HTMLSelectElement>('#login-account')!;
            select.value = 'employee@demo.local';
            select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        });
    }
    async function submit() {
        await act(async () => {
            form().dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
            await Promise.resolve();
        });
    }
    async function advance(tc: TestContext, ms: number) {
        await act(async () => { tc.mock.timers.tick(ms) });
    }
    t.after(async () => {
        await act(() => root.unmount());
        Object.assign(repository, originalMethods);
        dom.window.close();
        for (const [name, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else Reflect.deleteProperty(globalThis, name);
        }
    });

    await t.test('A fast sign-in shows checking, confirmation, then the protected workspace in order', async tc => {
        await render(tc);
        await submit();
        assert(transition()?.classList.contains('phase-checking'));
        assert.equal(workspace(), null);
        const status = transition()!.matches('[role="status"]') ? transition()! : transition()!.querySelector('[role="status"]');
        assert(status, 'Sign-in progress must be announced accessibly');
        assert.equal(status.getAttribute('aria-live'), 'polite');
        assert(transition()!.contains(document.activeElement));
        await advance(tc, 649);
        assert(transition()?.classList.contains('phase-checking'));
        assert.equal(workspace(), null);
        await advance(tc, 1);
        assert(transition()?.classList.contains('phase-ready'));
        assert.equal(workspace(), null, 'Confirmation must finish before committing workspace state');
        await advance(tc, 319);
        assert.equal(workspace(), null);
        await advance(tc, 1);
        assert(transition()?.classList.contains('phase-leaving'));
        assert(workspace(), 'The workspace should be ready underneath the departing overlay');
        assert(workspace()!.hasAttribute('inert'), 'The departing overlay must keep workspace controls unavailable');
        await act(() => { dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })) });
        assert.equal(document.querySelector('.command-search'), null, 'Quick search cannot interrupt the entry transition');
        await advance(tc, 239);
        assert(transition());
        await advance(tc, 1);
        assert.equal(transition(), null);
        assert(!workspace()!.hasAttribute('inert'));
        assert.equal(document.activeElement, document.querySelector('main'));
        await act(() => { dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })) });
        assert(document.querySelector('.command-search'), 'Quick search is available once the workspace opens');
    });

    await t.test('A slow snapshot never reports ready or reveals a partially loaded workspace', async tc => {
        await render(tc);
        const pending = deferred<Database>();
        let snapshotCalls = 0;
        repository.snapshot = () => { snapshotCalls++; return pending.promise };
        await submit();
        assert.equal(snapshotCalls, 1);
        await advance(tc, 5000);
        assert(transition()?.classList.contains('phase-checking'));
        assert.equal(workspace(), null);
        await act(async () => { pending.resolve(snapshot); await pending.promise });
        assert(transition()?.classList.contains('phase-ready'));
        assert.equal(workspace(), null);
        await advance(tc, 320);
        assert(workspace());
        await advance(tc, 240);
        assert.equal(transition(), null);
    });

    await t.test('Rejected credentials return to an enabled form and allow a successful retry', async tc => {
        await render(tc);
        let attempts = 0;
        repository.login = async () => { if (++attempts === 1) throw new Error('Invalid credentials'); return actor };
        await submit();
        assert.equal(transition(), null);
        assert.equal(workspace(), null);
        assert.equal(document.querySelector('[role="alert"]')?.textContent, 'Invalid credentials');
        assert(!document.querySelector<HTMLButtonElement>('.login-submit')!.disabled);
        assert.equal(document.activeElement, document.getElementById('login-email'));
        await submit();
        assert.equal(attempts, 2);
        assert.equal(document.querySelector('[role="alert"]'), null);
        await advance(tc, 650);
        await advance(tc, 320);
        await advance(tc, 240);
        assert(workspace());
        assert.equal(transition(), null);
    });

    await t.test('Snapshot failure rolls back authentication even when logout itself fails', async tc => {
        await render(tc);
        let rollbacks = 0;
        repository.snapshot = async () => { throw new Error('Workspace unavailable') };
        repository.logout = async () => { rollbacks++; throw new Error('Logout unavailable') };
        await submit();
        assert.equal(rollbacks, 1);
        assert.equal(workspace(), null);
        assert.equal(transition(), null);
        assert.equal(document.querySelector('[role="alert"]')?.textContent, 'Workspace unavailable');
        assert(!document.querySelector<HTMLButtonElement>('.login-submit')!.disabled);
        await advance(tc, 5000);
        assert.equal(workspace(), null, 'A stale animation timer cannot reveal a failed sign-in');
    });

    await t.test('Two submit events in the same turn invoke authentication only once', async tc => {
        await render(tc);
        const pending = deferred<void>();
        let calls = 0;
        await act(() => root.render(createElement(Login, { onLogin: () => { calls++; return pending.promise }, initialError: '', theme: 'dark', onToggleTheme: () => { } })));
        await act(() => document.querySelector<HTMLButtonElement>('.demo-accounts button')!.click());
        await choosePerson();
        await act(() => {
            const loginForm = form();
            loginForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
            loginForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        });
        assert.equal(calls, 1);
        assert(document.querySelector<HTMLButtonElement>('.login-submit')!.disabled);
        await act(async () => { pending.resolve(); await pending.promise });
        assert(!document.querySelector<HTMLButtonElement>('.login-submit')!.disabled);
    });

    await t.test('Reduced motion skips presentation delays while still awaiting the snapshot', async tc => {
        await render(tc);
        reducedMotion = true;
        const pending = deferred<Database>();
        repository.snapshot = () => pending.promise;
        await submit();
        assert.equal(workspace(), null);
        assert(transition()?.classList.contains('phase-checking'));
        await act(async () => { pending.resolve(snapshot); await pending.promise });
        // No clock advancement: reduction applies to the artificial waits, not the actual data fetch.
        assert(workspace());
        assert.equal(transition(), null);
        assert.equal(document.activeElement, document.querySelector('main'));
    });

    for (const phase of ['checking', 'ready'] as const) {
        await t.test(`Unmounting during ${phase} cannot reveal a workspace after a pending callback`, async tc => {
            await render(tc);
            const pending = deferred<Database>();
            if (phase === 'checking') repository.snapshot = () => pending.promise;
            await submit();
            if (phase === 'ready') await advance(tc, 650);
            assert(transition()?.classList.contains(`phase-${phase}`));
            await act(() => root.render(null));
            if (phase === 'checking') await act(async () => { pending.resolve(snapshot); await pending.promise });
            await advance(tc, 10000);
            assert.equal(transition(), null);
            assert.equal(workspace(), null);
            assert.equal(document.getElementById('root')!.childElementCount, 0);
        });
    }
});
