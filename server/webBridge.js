/**
 * @typedef {import('node:http').IncomingMessage} IncomingMessage
 * @typedef {import('node:http').ServerResponse} ServerResponse
 */
// @ts-check
import { Readable } from 'node:stream';
/**
 * Local development/test bridge; production uses Vercel's Web Request handler directly.
 *
 * @param {(request: Request) => Promise<Response>} handler
 * @returns {(req: IncomingMessage, res: ServerResponse) => Promise<void>}
 */
export function nodeBridge(handler) {
  return async (req, res) => {
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
      /**
       * @type {RequestInit & { duplex?: 'half' }}
       */
      const input = { method, headers };
      if (!['GET', 'HEAD'].includes(method)) {
        input.body = /** @type {ReadableStream<Uint8Array>} */ (Readable.toWeb(req));
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
              await new Promise((resolve, reject) => {
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
