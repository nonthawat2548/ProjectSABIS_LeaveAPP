import '@testing-library/jest-dom';
import { jest } from '@jest/globals';
import { TextDecoder, TextEncoder } from 'node:util';
import { deserialize, serialize } from 'node:v8';

globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
globalThis.structuredClone ??= (value) => deserialize(serialize(value));
// Freeze dates without changing browser event timers or file-reading callbacks.
jest.useFakeTimers({
  now: new Date('2026-10-11T05:00:00.000Z'),
  doNotFake: [
    'performance',
    'hrtime',
    'nextTick',
    'queueMicrotask',
    'setImmediate',
    'clearImmediate',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ],
});
window.scrollTo = jest.fn();
window.matchMedia = jest.fn((query) => ({
  matches: query === '(prefers-reduced-motion: reduce)',
  media: query,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));
