import { createCloudHandler } from '../server/cloudApi';
import { PostgresStore } from '../server/postgresStore';

const handler=createCloudHandler(new PostgresStore());
export default { fetch: handler };
