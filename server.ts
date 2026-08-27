import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import apiRoutes from './server/routes/apiRoutes';
import iomsRoutes from './server/routes/iomsRoutes';
import { getDb, isPostgres, getPgPool, isProduction } from './server/database/db';
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

// Enforce production security invariants early
const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || process.env.VECTOS_NO_LISTEN === '1';

if (isProd) {
  const secret = (process.env.SESSION_SECRET || '').trim();
  if (!secret || secret.length < 32) {
    console.error('FATAL [VectOS]: NODE_ENV=production requires a secure SESSION_SECRET of at least 32 characters.');
    throw new Error('Production configuration error: Insecure or missing SESSION_SECRET.');
  }

  const dbUrl = (process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim();
  if (!dbUrl) {
    console.error('FATAL [VectOS]: NODE_ENV=production requires a valid PostgreSQL DATABASE_URL.');
    throw new Error('Production configuration error: Persistent PostgreSQL DATABASE_URL is mandatory in production.');
  }
}

// Middleware — limit body size to prevent DoS
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Trust proxy for reverse proxy (Cloud Run / Netlify / AI Studio preview)
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

// Session Store Setup (PostgreSQL for Supabase/Production or Memory fallback)
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

// 2. Mount Legacy SSR & Management routes
app.use('/legacy', iomsRoutes);
app.use(iomsRoutes);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(), 
    database: isPostgres() ? 'PostgreSQL' : 'sql.js (SQLite)' 
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
    if (isProd) {
      process.exit(1);
    }
  });

// 3. Vite middleware for React Single Page Application (VectOS Modern UI)
async function setupViteAndListen() {
  if (isTest) {
    return;
  }

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (
    process.env.NETLIFY !== 'true' &&
    process.env.AWS_LAMBDA_FUNCTION_NAME === undefined &&
    process.env.VECTOS_NO_LISTEN !== '1'
  ) {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🏗️ VectOS React ERP running at http://0.0.0.0:${PORT}`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`⚠️ Port ${PORT} is currently occupied, reusing existing active listener.`);
      } else {
        console.error('Server listener error:', err);
      }
    });
  }
}

setupViteAndListen().catch(err => {
  console.error('Failed to start server:', err);
});
