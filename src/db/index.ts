import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env.local first, then .env for local schema and runtime tasks
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema';

// Support serverless connection pooling over WebSockets in Node.js / Vercel runtime
neonConfig.webSocketConstructor = ws;

declare global {
  var _neonPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._neonPool) {
    const connectionString = (
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      ''
    ).trim();

    global._neonPool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._neonPool.on('error', (err) => {
      console.error('Unexpected error on idle Neon pool client:', err);
    });
  }
  return global._neonPool;
};

const pool = createPool();

// Initialize Drizzle with Neon serverless WebSocket connection pool and schema
export const db = drizzle(pool, { schema });
export { pool };
