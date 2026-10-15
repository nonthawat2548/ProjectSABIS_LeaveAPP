/**
 * @typedef {import('../src/domain/types.js').Employee} Employee
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { BrowserRepository } from '../src/data/browserRepository.js';
import { getDemoAccounts } from '../src/data/demoDatabase.js';
import { DEMO_PASSWORD } from '../src/domain/seed.js';
import { loginUsername } from '../src/domain/auth.js';
import { formatPosition } from '../src/labels.js';
test('Login account controls submit the selected person to the connected repository', async (t) => {
  // A DOM interaction test; this does not verify layout in a real browser.
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
  });
  const replacements = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    sessionStorage: dom.window.sessionStorage,
    indexedDB: new IDBFactory(),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map(
    Object.keys(replacements).map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  for (const [name, value] of Object.entries(replacements))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  // Import React DOM after installing document so input change events are initialized correctly.
  const { createRoot } = await import('react-dom/client');
  const { Login } = await import('../src/App.jsx');
  const root = createRoot(dom.window.document.getElementById('root'));
  t.after(async () => {
    await act(() => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const repository = new BrowserRepository();
  const accounts = getDemoAccounts();
  /**
   * @type {{ email: string; password: string; actor: Employee }[]}
   */
  const signIns = [];
  /**
   * @type {Promise<void> | undefined}
   */
  let completion;
  /**
   * @param {string} email
   * @param {string} password
   */
  const onLogin = (email, password) => {
    completion = repository.login(email, password).then((actor) => {
      signIns.push({ email, password, actor });
    });
    return completion;
  };
  let mount = 0;
  /**
   * @param {any} [login]
   * @param {'light' | 'dark'} [theme]
   */
  async function render(login = onLogin, theme = 'light') {
    await act(() =>
      root.render(
        createElement(Login, {
          key: ++mount,
          onLogin: login,
          initialError: '',
          theme,
          onToggleTheme: () => {},
        }),
      ),
    );
  }
  const select = () => dom.window.document.querySelector('#login-account');
  const emailInput = () => dom.window.document.querySelector('#login-email');
  const passwordInput = () => dom.window.document.querySelector('#login-password');
  const roleButtons = () => [...dom.window.document.querySelectorAll('.demo-accounts button')];
  const roles = /** @type {const} */ (['Employee', 'Manager', 'HR']);
  const form = () => dom.window.document.querySelector('form');
  /**
   * @param {Employee['role']} role
   */
  async function chooseRole(role) {
    await act(() => roleButtons()[roles.indexOf(role)].click());
    const members = accounts.filter((account) => account.role === role);
    assert.deepEqual(
      [...select().options].filter((option) => option.value).map((option) => option.value),
      members.map((account) => account.email),
    );
    for (const account of members)
      assert.equal(
        select().querySelector(`option[value="${account.email}"]`)?.textContent,
        `${account.name} · ${loginUsername(account.email)} · ${formatPosition(account.position)}`,
      );
  }
  /**
   * @param {string} email
   */
  async function choose(email) {
    await act(() => {
      select().value = email;
      select().dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  }
  /**
   * @param {HTMLInputElement} input
   * @param {string} value
   */
  async function type(input, value) {
    await act(() => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(
        input,
        value,
      );
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  }
  async function submit() {
    completion = undefined;
    await act(async () => {
      form().dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      assert(completion, 'The form must invoke login');
      await completion.catch(() => {});
    });
  }
  await t.test(
    'Both themes start with no role or account list until a role is selected',
    async () => {
      for (const theme of /** @type {const} */ (['light', 'dark'])) {
        await render(onLogin, theme);
        assert(select().disabled);
        assert.equal(select().options.length, 1);
        assert.equal(select().options[0].textContent, 'เลือกบทบาทด้านบนก่อน');
        assert.equal(emailInput().value, '');
        assert.equal(passwordInput().value, '');
        assert.equal(emailInput().type, 'text');
        assert.equal(dom.window.document.querySelector('.login-note'), null);
        assert.deepEqual(
          roleButtons().map((button) => button.textContent),
          ['พนักงาน', 'ผู้จัดการ', 'ฝ่ายบุคคล (HR)'],
        );
        assert(roleButtons().every((button) => button.getAttribute('aria-pressed') === 'false'));
        assert(
          !form().checkValidity(),
          'An empty account cannot be submitted through native form validation',
        );
        for (const role of roles) {
          await chooseRole(role);
          assert(!select().disabled);
          assert.equal(emailInput().value, '');
          assert.equal(passwordInput().value, '');
          assert.equal(select().value, '');
          assert.deepEqual(
            roleButtons().map((button) => button.getAttribute('aria-pressed')),
            roles.map((value) => String(value === role)),
          );
        }
      }
    },
  );
  await t.test(
    'Every one of the ten role-filtered options fills credentials and authenticates that person',
    async () => {
      await render();
      for (const account of accounts) {
        await chooseRole(account.role);
        await choose(account.email);
        assert.equal(emailInput().value, loginUsername(account.email));
        assert.equal(passwordInput().value, DEMO_PASSWORD);
        assert.deepEqual(
          roleButtons().map((button) => button.getAttribute('aria-pressed')),
          roles.map((role) => String(role === account.role)),
        );
        await submit();
        const result = signIns.at(-1);
        assert.equal(result.email, loginUsername(account.email));
        assert.equal(result.password, DEMO_PASSWORD);
        assert.equal(result.actor.id, account.id);
        assert.equal(result.actor.role, account.role);
        assert.equal((await repository.session())?.id, account.id);
        await repository.logout();
      }
      assert.equal(signIns.length, 10);
    },
  );
  await t.test(
    'Role selection and manual email entry keep the account list in the correct category',
    async () => {
      await render();
      for (const role of roles) {
        await chooseRole(role);
        assert.equal(select().value, '');
        assert.equal(emailInput().value, '');
        assert.equal(passwordInput().value, '');
      }
      await type(emailInput(), 'SALES-MANAGER@DEMO.LOCAL');
      assert.equal(passwordInput().value, '', 'Typing an account must not fill a password');
      await type(passwordInput(), '1234');
      assert.equal(select().value, 'sales-manager@demo.local');
      assert.deepEqual(
        [...select().options].filter((option) => option.value).map((option) => option.value),
        accounts.filter((account) => account.role === 'Manager').map((account) => account.email),
      );
      await submit();
      assert.equal(
        signIns.at(-1).actor.id,
        accounts.find((account) => account.email === 'sales-manager@demo.local').id,
      );
      await repository.logout();
      await type(emailInput(), 'custom@example.com');
      assert.equal(select().value, '');
      assert.deepEqual(
        roleButtons().map((button) => button.getAttribute('aria-pressed')),
        ['false', 'true', 'false'],
      );
      await choose('');
      assert.equal(emailInput().value, '');
      assert.equal(passwordInput().value, '');
      await chooseRole('Employee');
      assert.equal(select().value, '');
      await type(emailInput(), ' THANAWAT ');
      assert.equal(select().value, 'manager@demo.local');
      assert.equal(passwordInput().value, '');
      await type(passwordInput(), '1234');
      assert(form().checkValidity(), 'A username must pass native form validation');
      await submit();
      assert.equal(signIns.at(-1).actor.role, 'Manager');
      await repository.logout();
    },
  );
  await t.test(
    'Choosing another account clears a login error and restores the demo password',
    async () => {
      await render(onLogin, 'dark');
      await chooseRole('Employee');
      await choose('employee@demo.local');
      await type(passwordInput(), 'wrong-password');
      await submit();
      assert(dom.window.document.querySelector('[role="alert"]'));
      await choose('chutima@demo.local');
      assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
      assert.equal(passwordInput().value, DEMO_PASSWORD);
      await submit();
      assert.equal(signIns.at(-1).actor.email, 'chutima@demo.local');
      await repository.logout();
    },
  );
  await t.test('Account and credential controls are disabled while login is pending', async () => {
    /**
     * @type {() => void}
     */
    let finish;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    await render(() => pending);
    await chooseRole('Employee');
    await choose('employee@demo.local');
    await act(() => {
      form().dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    const submitButton = dom.window.document.querySelector('.login-submit');
    assert(
      select().disabled &&
        emailInput().disabled &&
        passwordInput().disabled &&
        submitButton.disabled,
    );
    assert(roleButtons().every((button) => button.disabled));
    await act(async () => {
      finish();
      await pending;
    });
    assert(
      !select().disabled &&
        !emailInput().disabled &&
        !passwordInput().disabled &&
        !submitButton.disabled,
    );
  });
});
