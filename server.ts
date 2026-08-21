import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import path from 'path';
import dotenv from 'dotenv';
import iomsRoutes from './server/routes/iomsRoutes';
import { getDb, isPostgres, getPgPool } from './server/database/db';

dotenv.config();

export const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy for reverse proxy (Cloud Run / Netlify / AI Studio preview)
app.set('trust proxy', true);

// Force req.headers['x-forwarded-proto'] = 'https' for express-session in proxy environment
app.use((req: Request, res: Response, next: NextFunction) => {
  req.headers['x-forwarded-proto'] = 'https';
  next();
});

// Session Store Setup (PostgreSQL for Supabase/Netlify or Memory fallback)
let sessionStore: session.Store | undefined;
if (isPostgres()) {
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

// Session configuration - works in both AI Studio iframe preview and Netlify
app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'quincaille-kigali-ioms-secret-2026',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: true,
      sameSite: 'none',
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
      const shopId = req.session.user.role === 'superadmin' && req.session.user.shop_id 
        ? req.session.user.shop_id 
        : (req.session.user.shop_id || 1);
      
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

// Static Assets Serving
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/public', express.static(path.join(process.cwd(), 'public')));
app.use('/src', express.static(path.join(process.cwd(), 'src')));

// Redirect root route to dashboard or login
app.get('/', (req: Request, res: Response) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/login');
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

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Server Error:', err);
  res.status(500).render('error', {
    title: 'System Server Error — VectOS',
    message: err.message || 'An unexpected operational error occurred.',
    path: req.path
  });
});

// Initialize database asynchronously in background
getDb()
  .then(() => {
    console.log('✅ Database initialized successfully');
  })
  .catch((err) => {
    console.error('Database initialization notice:', err);
  });

if (process.env.NETLIFY !== 'true' && process.env.AWS_LAMBDA_FUNCTION_NAME === undefined) {
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

