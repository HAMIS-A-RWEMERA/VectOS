import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import apiRoutes from './routes/apiRoutes';
import iomsRoutes from './routes/iomsRoutes';
import billingRoutes from './routes/billingRoutes';
import { getDb, isPostgres, getPgPool, isProduction } from './database/db';
import {
  helmetMiddleware,
  csrfEnsure,
  htmlCsrfInjector,
  csrfValidate
} from './security';

dotenv.config();

export const app = express();

// Enforce production security invariants early
const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || process.env.VECTOS_NO_LISTEN === '1';

if (isProd) {
  const secret = (process.env.SESSION_SECRET || '').trim();
  if (!secret || secret.length < 16) {
    console.warn('Notice [VectOS]: For production, set SESSION_SECRET in your environment variables for maximum session integrity.');
  }

  const hasSql = Boolean(
    (process.env.SQL_HOST && process.env.SQL_DB_NAME) ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DB_URL
  );
  if (!hasSql) {
    console.warn('⚠️ Notice [VectOS]: Running in production without POSTGRES_URL / DATABASE_URL. For Vercel, attach Vercel Postgres to ensure data persists across serverless function instances.');
  }
}

// Middleware — limit body size to prevent DoS
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Trust proxy for reverse proxy (Cloud Run / Vercel / AI Studio preview)
app.set('trust proxy', true);

// Security headers (CSP, HSTS, X-Frame-Options, ...)
app.use(helmetMiddleware);

// Cookie parsing (required for CSRF double-submit cookies)
app.use(cookieParser());

// CSRF: double-submit cookie
app.use(csrfEnsure);
app.use(htmlCsrfInjector);
app.use(csrfValidate);

// Force req.headers['x-forwarded-proto'] = 'https' for express-session in proxy environment
app.use((req: Request, res: Response, next: NextFunction) => {
  req.headers['x-forwarded-proto'] = 'https';
  next();
});

// Session Store Setup (PostgreSQL for Vercel Postgres / Neon / Cloud SQL or Memory fallback)
let sessionStore: session.Store | undefined;
const hasDbUrl = Boolean(
  (process.env.SQL_HOST && process.env.SQL_DB_NAME) ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.SUPABASE_DB_URL
);
if (hasDbUrl) {
  try {
    const PgSession = connectPgSimple(session);
    sessionStore = new PgSession({
      pool: getPgPool(),
      tableName: 'session',
      createTableIfMissing: true,
    });
  } catch (storeErr) {
    console.warn("Notice: Using standard session store fallback:", storeErr);
  }
}

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = isTest ? 'test-fallback-secret-at-least-32-chars-long' : crypto.randomBytes(32).toString('hex');
}

app.use(
  session({
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: !isTest,
      sameSite: (isTest ? 'lax' : 'none') as 'lax' | 'none',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }) as any
);

// View Engine Setup (EJS backward compatibility)
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));

// Static Assets Serving
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/public', express.static(path.join(process.cwd(), 'public')));

// 1. Mount JSON REST API routes FIRST
app.use('/api', apiRoutes);
app.use('/api', billingRoutes);

// 2. Mount Legacy SSR & Management routes
app.use('/legacy', iomsRoutes);
app.use(iomsRoutes);

// Upgraded Health check endpoint
app.get('/api/health', async (req: Request, res: Response) => {
  let dbHealthy = false;
  try {
    if (isPostgres()) {
      await getPgPool().query('SELECT 1');
      dbHealthy = true;
    } else {
      const db = await getDb();
      dbHealthy = Boolean(db);
    }
  } catch {
    dbHealthy = false;
  }

  let dlqCount = 0;
  let retryCount = 0;
  try {
    const { queryOne } = await import('./database/db');
    const dlq = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM webhook_events WHERE status = ?', ['DEAD_LETTER']);
    const retry = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM webhook_events WHERE status = ?', ['RETRY_PENDING']);
    dlqCount = dlq?.count || 0;
    retryCount = retry?.count || 0;
  } catch {}

  res.json({ 
    status: dbHealthy ? 'ok' : 'degraded',
    time: new Date().toISOString(), 
    database: isPostgres() ? 'PostgreSQL' : 'sql.js (SQLite)',
    dbHealthy,
    queues: {
      deadLetterWebhooks: dlqCount,
      pendingRetryWebhooks: retryCount
    },
    uptimeSec: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
});

app.use((err: any, req: Request, res: Response, next: any) => {
  console.log('EXPRESS UNHANDLED ERROR:', err?.message || err, err?.stack);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).render('error', { title: 'Server Error', message: err?.message || 'Internal error', path: req.path });
});

// Initialize database
export const dbReady = getDb()
  .then(() => {
    console.log('✅ Database initialized successfully');
  })
  .catch((err) => {
    console.error('Database initialization notice:', err);
    if (isProd && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
      console.warn('Continuing despite database initialization notice.');
    }
  });
