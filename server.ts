import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import iomsRoutes from './server/routes/iomsRoutes';
import { getDb, isPostgres, getPgPool } from './server/database/db';
import {
  helmetMiddleware,
  csrfEnsure,
  htmlCsrfInjector,
  csrfValidate,
  twofaPending
} from './server/security';

dotenv.config();

export const app = express();
const PORT = 3000;

// Middleware — limit body size to prevent DoS
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Trust proxy for reverse proxy (Cloud Run / Netlify / AI Studio preview)
app.set('trust proxy', true);

// Security headers (CSP, HSTS, X-Frame-Options, ...)
app.use(helmetMiddleware);

// Cookie parsing (required for CSRF double-submit cookies)
app.use(cookieParser());

// CSRF: double-submit cookie — issue token, inject into HTML, then validate
// state-changing requests. Validation is re-enabled with stale-SW tolerance:
// tokens are network-first (SW v4) and offline queue refreshes token at sync.
app.use(csrfEnsure);
app.use(htmlCsrfInjector);
app.use(csrfValidate);

// Force req.headers['x-forwarded-proto'] = 'https' for express-session in proxy environment
app.use((req: Request, res: Response, next: NextFunction) => {
  req.headers['x-forwarded-proto'] = 'https';
  next();
});

// Session Store Setup (PostgreSQL for Supabase/Netlify or Memory fallback)
// Note: isPostgres() is false at import time when postgresAvailable is not yet tested.
// We check env presence directly so Netlify gets PG store when DATABASE_URL is set;
// otherwise MemoryStore is correct for local dev. If DATABASE_URL is set but PG is
// unreachable, the DB layer falls back to sql.js — sessions will be MemoryStore in
// that degraded mode (ephemeral, but app remains usable; warning logged below).
let sessionStore: session.Store | undefined;
const hasDbUrl = Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL);
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
  if (!sessionStore) {
    console.warn("WARNING: DATABASE_URL is set but PG session store failed — sessions are in-memory and will not persist across Lambda invocations. Check Supabase connectivity.");
  }
}

// Session configuration - works in both AI Studio iframe preview and Netlify.
// Cookies are marked Secure ONLY when actually running in production (https),
// mirroring the CSRF cookie policy: this keeps logins working over plain
// http://local-network addresses while staying fully secure on Netlify.
const isProdHttps = process.env.NODE_ENV === 'production';
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VECTOS_NO_LISTEN === '1';
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProdHttps) {
    throw new Error('SESSION_SECRET environment variable is required in production — set it in Netlify environment variables');
  }
  if (!isTestEnv) {
    console.warn('WARNING: SESSION_SECRET not set — using ephemeral secret. Sessions will not persist across restarts. Set SESSION_SECRET for production.');
  }
  sessionSecret = isTestEnv ? 'test-fallback-not-for-production' : crypto.randomBytes(32).toString('hex');
}
app.use(
  session({
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: isProdHttps && !isTestEnv,
      sameSite: ((isProdHttps && !isTestEnv) ? 'none' : 'lax') as 'lax' | 'none',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

// Make session user and active shop context available to all template views
app.use(async (req: Request, res: Response, next: NextFunction) => {
  res.locals.user = req.session?.user || null;
  res.locals.shop = null;
  res.locals.isSuperAdminAssisting = false;
  res.locals.dbPersistent = isPostgres();

  if (req.session?.user) {
    try {
      const { queryOne } = await import('./server/database/db');
      let shopId: number | null = null;
      if (req.session.user.role === 'superadmin' && req.session.user.shop_id) {
        shopId = req.session.user.shop_id;
      } else if (req.session.user.shop_id) {
        shopId = req.session.user.shop_id;
      } else {
        // No shop context (e.g., superadmin not assisting) — don't fallback to shop 1
        res.locals.shop = null;
        res.locals.isSuperAdminAssisting = false;
        return next();
      }
      const shop = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
      res.locals.shop = shop || null;
      res.locals.isSuperAdminAssisting = (req.session.user.role === 'superadmin' && Boolean(req.session.user.shop_id));
    } catch (err) {
      console.error('Error attaching shop to locals:', err);
    }
  }
  next();
});

// View Engine Setup (EJS)
app.set('view engine', 'ejs');
// Cache compiled templates in production for faster page renders on Lambda
if (process.env.NODE_ENV === 'production') {
  app.set('view cache', true);
}
app.set('views', path.join(process.cwd(), 'views'));

// Static Assets Serving (styles get short caching; icons/images longer)
app.use(express.static(path.join(process.cwd(), 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}styles${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    } else if (/\.(png|jpe?g|svg|ico|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  }
}));
app.use('/public', express.static(path.join(process.cwd(), 'public')));
app.use('/src', express.static(path.join(process.cwd(), 'src')));

// Redirect root route to dashboard or login
app.get('/', (req: Request, res: Response) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/login');
});

// Two-factor verification gate: privileged users must complete TOTP challenge
app.use((req: Request, res: Response, next: NextFunction) => {
  const allowed = ['/verify-2fa', '/logout', '/login', '/health'];
  if (twofaPending(req) && !allowed.some((p) => req.path === p)) {
    return res.redirect('/verify-2fa');
  }
  next();
});

 // Mount VectOS application routes
app.use('/', iomsRoutes);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).render('error', {
    title: '404 Page Not Found — VectOS',
    message: 'The requested resource or page could not be located in the system.',
    path: req.path
  });
});

// Global Error Handler — respects err.status, never leaks SQL/stack to users
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Server Error:', err);
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  const isUserError = status === 400 || status === 403 || status === 404;
  const safeMessage = isUserError && err.message ? err.message : 'An unexpected operational error occurred. Please try again or contact support.';
  res.status(status).render('error', {
    title: status === 403 ? 'Access Denied — VectOS' : 'System Server Error — VectOS',
    message: safeMessage,
    path: req.path
  });
});

// Initialize database asynchronously in background
// Resolves once schema + seed data are fully initialized (single-flight).
// Exported so tests and tooling can await a ready database deterministically.
export const dbReady = getDb()
  .then(() => {
    console.log('✅ Database initialized successfully');
  })
  .catch((err) => {
    console.error('Database initialization notice:', err);
  });

if (
  process.env.NETLIFY !== 'true' &&
  process.env.AWS_LAMBDA_FUNCTION_NAME === undefined &&
  process.env.VECTOS_NO_LISTEN !== '1'
) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏗️ VectOS running at http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ Port ${PORT} is currently occupied, reusing existing active listener.`);
    } else {
      console.error('Server listener error:', err);
    }
  });
}

