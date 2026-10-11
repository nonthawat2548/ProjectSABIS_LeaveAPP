import { createServer } from 'node:http';
import { createCloudHandler } from './cloudApi';
import { PostgresStore, closePostgresPool } from './postgresStore';
import { nodeBridge } from './webBridge';

const host = process.env.MOCK_HOST || '127.0.0.1',
  port = Number(process.env.MOCK_PORT || 3001);
const server = createServer(nodeBridge(createCloudHandler(new PostgresStore())));
server.listen(port, host, () => {
  const address = server.address();
  console.log(
    `Cloud API: http://${host}:${typeof address === 'object' && address ? address.port : port}/api`,
  );
});
const stop = () =>
  server.close(() => {
    void closePostgresPool().finally(() => process.exit(0));
  });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
