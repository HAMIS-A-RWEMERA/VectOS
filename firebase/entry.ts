import path from 'node:path';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import serverless from 'serverless-http';

process.env.NODE_ENV = 'production';

const databaseUrl = defineSecret('DATABASE_URL');
const sessionSecret = defineSecret('SESSION_SECRET');

type HttpHandler = (req: any, res: any) => Promise<unknown> | unknown;

let ready: Promise<HttpHandler> | null = null;

function boot(): Promise<HttpHandler> {
  ready ??= (async () => {
    try {
      process.chdir(path.dirname(process.argv[1] ?? process.cwd()));
    } catch {
      // Cloud Functions already runs from the function directory.
    }
    const mod = await import('../server');
    return serverless(mod.app);
  })();
  return ready;
}

export const vectos = onRequest(
  { secrets: [databaseUrl, sessionSecret], timeoutSeconds: 60, memory: '256MiB' },
  async (req, res) => {
    try {
      const handler = await boot();
      await handler(req, res);
    } catch (err: any) {
      const detail = (err && (err.message || err.toString())) || String(err);
      console.error('VectOS boot failure:', detail);
      if (!res.headersSent) {
        res.status(500).send(`Server boot failed: ${detail}`);
      }
    }
  }
);