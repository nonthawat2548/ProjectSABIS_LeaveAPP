import { createCloudHandler } from '../server/cloudApi.js';
import { PostgresStore } from '../server/postgresStore.js';

const handler=createCloudHandler(new PostgresStore());
export default { fetch: handler };
