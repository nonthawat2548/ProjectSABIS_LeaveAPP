// @ts-check
// Previous Node cloud entrypoint, retained for migration contract/boot tests.
// The Vercel function now lives in api/go.go.
import { createCloudHandler } from './cloudApi.js';
import { PostgresStore } from './postgresStore.js';
const handler = createCloudHandler(new PostgresStore());
export default { fetch: handler };
