// Uses an isolated in-memory PostgreSQL engine over its real wire protocol.
// Never reads .env or connects to the application's live Supabase database.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const { findGo } = await import('./go.mjs');
const db = new PGlite();
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
for (const name of ['setup-10-people.sql', '002-cloud-api.sql'])
  await db.exec(await readFile(new URL('../database/supabase/' + name, import.meta.url), 'utf8'));
const socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 });
await socket.start();
try {
  const url = 'postgresql://postgres:postgres@' + socket.getServerConn() + '/postgres';
  const child = spawn(
    findGo(),
    ['test', './internal/httpapi', '-run', '^TestPostgresTransport$', '-v', '-count=1'],
    {
      stdio: 'inherit',
      windowsHide: true,
      env: { ...process.env, GO_TEST_POSTGRES_URL: url, VERCEL: '' },
    },
  );
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', resolve);
  });
  if (code !== 0) process.exitCode = code ?? 1;
} finally {
  await socket.stop();
  await db.close();
}
