// Runs BEFORE any application code is imported.
// Forces the deterministic sql.js in-memory engine so the suite never touches
// a real database and behaves identically on every machine and in CI.
process.env.DATABASE_URL = '';
process.env.SUPABASE_DATABASE_URL = '';
process.env.SUPABASE_DB_URL = '';
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-production';
process.env.NODE_ENV = 'test';
process.env.VECTOS_NO_LISTEN = '1';
