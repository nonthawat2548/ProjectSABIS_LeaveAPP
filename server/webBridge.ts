import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Local development/test bridge; production uses Vercel's Web Request handler directly. */
export function nodeBridge(handler: (request: Request) => Promise<Response>) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const headers = new Headers();
      for (let i = 0; i < req.rawHeaders.length; i += 2)
        headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
      let host = req.headers.host ?? '127.0.0.1';
      const forwarded = String(req.headers['x-forwarded-host'] ?? '').split(',')[0];
      if (
        forwarded &&
        ['localhost', '127.0.0.1', '[::1]'].includes(new URL('http://' + forwarded).hostname)
      )
        host = forwarded;
      const method = req.method ?? 'GET';
      const input: RequestInit & { duplex?: 'half' } = { method, headers };
      if (!['GET', 'HEAD'].includes(method)) {
        input.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
        input.duplex = 'half';
      }
      const response = await handler(new Request(new URL(req.url ?? '/', `http://${host}`), input));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      const reader = response.body?.getReader();
      if (reader)
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            if (!res.write(part.value))
              await new Promise<void>((resolve, reject) => {
                res.once('drain', resolve);
                res.once('error', reject);
              });
          }
        } finally {
          reader.releaseLock();
        }
      res.end();
    } catch {
      if (!res.headersSent)
        res.writeHead(500, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
      res.end('{"message":"ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง"}');
    }
  };
}
