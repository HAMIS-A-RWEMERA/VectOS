// Runs BEFORE any application code is imported.
// Default: forces deterministic sql.js in-memory engine so the suite never touches
// a real database and behaves identically on every machine and in CI.
// Explicit PG mode: VECTOS_USE_PG=1 with DATABASE_URL pointing to a dedicated
// test DB (e.g., vectos_test) will run the same suite against PostgreSQL.
if (!process.env.VECTOS_USE_PG) {
  process.env.DATABASE_URL = '';
  process.env.SUPABASE_DATABASE_URL = '';
  process.env.SUPABASE_DB_URL = '';
} else if (!process.env.DATABASE_URL) {
  console.warn('VECTOS_USE_PG=1 requires DATABASE_URL to be set to a dedicated test database (e.g., vectos_test)');
}
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-production';
process.env.NODE_ENV = 'test';
process.env.VECTOS_NO_LISTEN = '1';

// For PG parity, clean throttle state between tests to ensure deterministic lock test
import { beforeEach } from 'vitest';
if (process.env.VECTOS_USE_PG) {
  beforeEach(async () => {
    try {
      const { execute } = await import('../server/database/db.ts');
      await execute('DELETE FROM login_throttle');
    } catch {}
  });
}
