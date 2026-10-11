import { readFile } from 'node:fs/promises';
import { transformSync } from '@babel/core';

/** Compile JSX for Node tests only; ordinary JavaScript uses Node's native loader. */
export async function load(url, context, nextLoad) {
  if (!url.endsWith('.jsx')) return nextLoad(url, context);
  const source = await readFile(new URL(url), 'utf8');
  const result = transformSync(source, {
    filename: new URL(url).pathname,
    babelrc: false,
    configFile: false,
    presets: [['@babel/preset-react', { runtime: 'automatic' }]],
    sourceMaps: 'inline',
  });
  return { format: 'module', source: result.code, shortCircuit: true };
}
