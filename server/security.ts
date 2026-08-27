import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { queryOne, execute } from './database/db';

// ---------------------------------------------------------------------------
// 1. SECURITY HEADERS
// ---------------------------------------------------------------------------
export const helmetMiddleware = helmet({
  frameguard: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://cdn.tailwindcss.com',
        'https://unpkg.com',
        'https://cdn.jsdelivr.net'
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://fonts.googleapis.com',
        'https://unpkg.com'
      ],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://unpkg.com'],
      frameAncestors: ["'self'", 'https://*.netlify.app', 'https://*.aistudio.google.com', 'https://*.google.com', 'https://*.run.app', 'https://*.googleusercontent.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'same-origin' }
});

// ---------------------------------------------------------------------------
// 2. CSRF PROTECTION — Double-Submit Cookie pattern
//    A random token lives in a strict cookie AND must be echoed back in the
//    form body (_csrf) or X-CSRF-Token header. Cross-site attackers cannot
//    read or set our cookie, so forged POSTs fail.
// ---------------------------------------------------------------------------

const CSRF_COOKIE = 'vcsrf';

function issueToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Ensures every visitor carries a CSRF cookie; exposes token to templates. */
export function csrfEnsure(req: Request, res: Response, next: NextFunction): void {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = issueToken();
    const isProdHttps = process.env.NODE_ENV === 'production';
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: (isProdHttps ? 'none' : 'lax') as 'lax' | 'none',
      secure: isProdHttps,
      path: '/'
    });
  }
  res.locals.csrfToken = token;
  next();
}

/**
 * Rewrites outgoing HTML so every <form> carries the CSRF hidden input and
 * <head> exposes a meta tag for fetch/htmx calls.
 */
export function htmlCsrfInjector(req: Request, res: Response, next: NextFunction): void {
  const originalSend = res.send.bind(res);
  let injected = false;

  (res as any).send = function (body: any) {
    const ctype = res.getHeader('Content-Type');
    if (!injected && typeof body === 'string' && ctype && String(ctype).includes('text/html')) {
      injected = true;
      const token = res.locals.csrfToken as string;
      const hiddenInput = `<input type="hidden" name="_csrf" value="${token}">`;
      const metaTag = `<meta name="csrf-token" content="${token}">`;
      body = body.replace(/<head([^>]*)>/i, (m) => `${m}${metaTag}`);
      if (body.includes('</form>')) {
        body = body.split('</form>').join(`${hiddenInput}</form>`);
      }
    }
    return originalSend(body);
  };
  next();
}

/** Rejects state-changing requests without a matching CSRF token. */
export function csrfValidate(req: Request, res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const supplied = req.body?._csrf || req.headers['x-csrf-token'];

  // Multipart uploads parse AFTER this middleware — body._csrf not yet available.
  // Require X-CSRF-Token header for multipart; do not bypass unconditionally.
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    if (!cookieToken || !req.headers['x-csrf-token'] || req.headers['x-csrf-token'] !== cookieToken) {
      return res.status(403).render('error', {
        title: 'Security Check Failed',
        message: 'Your session token was missing or expired. Please go back, refresh the page, and try again.',
        path: req.path
      });
    }
    return next();
  }

  if (!cookieToken || !supplied || supplied !== cookieToken) {
    return res.status(403).render('error', {
      title: 'Security Check Failed',
      message: 'Your session token was missing or expired. Please go back, refresh the page, and try again.',
      path: req.path
    });
  }
  next();
}

// ---------------------------------------------------------------------------
// 3. LOGIN THROTTLE — persistent, works across Lambda instances
//    8 failed attempts per identity within 15 minutes locks it for 15 minutes.
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 8;
const WINDOW_MINUTES = 15;

interface ThrottleRow {
  attempts: number;
  locked_until: string | null;
}

function parseThrottleDate(value: any): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const str = String(value);
  if (str.includes('Z') || str.includes('+')) return new Date(str).getTime();
  // SQLite CURRENT_TIMESTAMP is 'YYYY-MM-DD HH:MM:SS' in UTC
  return new Date(str.replace(' ', 'T') + 'Z').getTime();
}
function isLocked(row: ThrottleRow): boolean {
  if (!row.locked_until) return false;
  return parseThrottleDate(row.locked_until) > Date.now();
}

export async function throttleCheck(identity: string): Promise<{ ok: boolean; retryAfterMin?: number }> {
  try {
    const row = await queryOne<ThrottleRow>(
      'SELECT attempts, locked_until FROM login_throttle WHERE identity = ?',
      [identity.toLowerCase()]
    );
    if (row && isLocked(row)) {
      const remaining = Math.ceil(
        (parseThrottleDate(row.locked_until) - Date.now()) / 60000
      );
      return { ok: false, retryAfterMin: Math.max(1, remaining) };
    }
    return { ok: true };
  } catch {
    return { ok: true }; // fail-open: never lock users out due to infra hiccups
  }
}

export async function throttleFail(identity: string): Promise<void> {
  const id = identity.toLowerCase();
  try {
    const row = await queryOne<ThrottleRow & { updated_at?: string }>(
      'SELECT attempts, locked_until, updated_at FROM login_throttle WHERE identity = ?',
      [id]
    );
    const cutoff = new Date(Date.now() - WINDOW_MINUTES * 60000);
    if (row && isLocked(row)) return;
    const rowUpdated = parseThrottleDate(row?.updated_at);
    const attempts = row && rowUpdated > cutoff.getTime()
      ? row.attempts + 1
      : 1;
    const locked = attempts >= MAX_ATTEMPTS
      ? new Date(Date.now() + WINDOW_MINUTES * 60000).toISOString()
      : null;
    if (row) {
      await execute(
        'UPDATE login_throttle SET attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE identity = ?',
        [attempts, locked, id]
      );
    } else {
      await execute(
        'INSERT INTO login_throttle (identity, attempts, locked_until) VALUES (?, ?, ?)',
        [id, attempts, locked]
      );
    }
  } catch {
    /* fail-open */
  }
}

export async function throttleClear(identity: string): Promise<void> {
  try {
    await execute('DELETE FROM login_throttle WHERE identity = ?', [identity.toLowerCase()]);
  } catch {
    /* non-critical */
  }
}

// ---------------------------------------------------------------------------
// 4. TWO-FACTOR AUTH GATE (TOTP) for privileged accounts
// ---------------------------------------------------------------------------

export function twofaPending(req: Request): boolean {
  const user = (req.session as any)?.user;
  if (!user) return false;
  return Boolean(user.twofa_enabled) && !(req.session as any).twofa_verified;
}
