import { register } from 'node:module';

// Node regression tests render the same JSX as Vite and Jest, using Babel's React preset.
register('./jsx-loader.mjs', import.meta.url);
