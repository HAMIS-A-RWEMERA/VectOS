import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { queryAll, queryOne, execute, withTransaction, isPostgres, isProduction } from '../database/db';
import { createBackup, restoreBackup, BackupManifest } from '../database/backup';
import { 
  requireAuth, 
  requireSuperAdmin, 
  requireManager, 
  requirePermission,
  createAuthToken
} from '../auth';
import { throttleCheck, throttleFail, throttleClear } from '../security';
import { GoogleGenAI, Type } from '@google/genai';
import { upload } from '../upload';
import { VECTOS_SYSTEM_INSTRUCTION, getVectOSKnowledgeResponse } from '../aiHelpKnowledge';

const router = Router();

// System setting: When true, newly registered stores & accounts are instantly active (Testing Mode).
// When false (default), new stores register as 'pending' and require Platform SuperAdmin approval.
let autoApproveNewStores = process.env.AUTO_APPROVE_STORES === 'true';

// ============================================================================
// TENANT RESOLUTION & ISOLATION HELPERS
// ============================================================================

/**
 * Returns the authenticated store shop_id.
 * Strict multi-tenant rule:
 * - SuperAdmin can view any shop (defaults to explicit query/body param, user.shop_id, or 1 for global depot).
 * - Tenant users MUST have user.shop_id. If missing, returns null (never silently falls back to 1).
 */
export function getTenantShopId(req: Request): number | null {
  const user = req.session?.user;
  if (!user) return null;

  if (user.role === 'superadmin' || user.role === 'platform_ops') {
    const explicit = Number(req.query.shop_id || req.body?.shop_id);
    if (!isNaN(explicit) && explicit > 0) return explicit;
    return user.shop_id || 1;
  }

  return user.shop_id ? Number(user.shop_id) : null;
}

/**
 * Middleware enforcing valid tenant association on all store-scoped API endpoints.
 */
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  const shopId = getTenantShopId(req);
  if (!shopId) {
    return res.status(403).json({ 
      error: 'Tenant Store Association Required: Your session is not linked to an active store depot.' 
    });
  }
  res.locals.shopId = shopId;
  next();
}

/**
 * Helper to log audit events into the tenant's immutable audit log.
 */
async function logApiAudit(req: Request, action: string, details: string, explicitShopId?: number) {
  try {
    const shopId = explicitShopId || getTenantShopId(req) || 1;
    const userId = req.session?.user?.id || null;
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    await execute(
      'INSERT INTO audit_logs (shop_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?)',
      [shopId, userId, action, details, ip]
    );
  } catch (err) {
    console.error('API Audit log error:', err);
  }
}

/**
 * Explicitly awaits session persistence to the PostgreSQL/session store.
 * Critical on Vercel Serverless Functions where execution freezes immediately upon res.json().
 */
async function saveSession(req: Request): Promise<void> {
  if (!req.session) return;
  return new Promise<void>((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        console.error('Session persistence save error:', err);
        return reject(err);
      }
      resolve();
    });
  });
}

// ============================================================================
// 1. AUTHENTICATION & SESSION MANAGEMENT
// ============================================================================

// Get Current User / Session State
router.get('/auth/me', async (req: Request, res: Response) => {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (!req.session?.user) {
    return res.json({
      user: null,
      shop: null,
      availableShops: [],
      isSuperAdmin: false,
      dbPersistent: isPostgres(),
      isServerless
    });
  }

  const user = req.session.user;
  let shop = null;
  const shopId = user.shop_id || (user.role === 'superadmin' ? 1 : null);

  if (shopId) {
    shop = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
  }

  // SuperAdmin gets list of all registered store tenants
  let availableShops: any[] = [];
  if (user.role === 'superadmin') {
    availableShops = await queryAll('SELECT id, name, code, location, status, subscription_plan FROM shops ORDER BY name ASC');
  }

  const token = req.session?.user ? createAuthToken(req.session.user) : undefined;
  res.json({
    user,
    shop,
    availableShops,
    isSuperAdmin: user.role === 'superadmin',
    dbPersistent: isPostgres(),
    isServerless,
    token
  });
});

// Register New Store Depot & Store Owner User (Self-Service Onboarding)
router.post('/auth/register', async (req: Request, res: Response) => {
  const { storeName, ownerName, email, password, phone, location } = req.body;
  if (!storeName || !ownerName || !email || !password) {
    return res.status(400).json({ error: 'Store Name, Owner Name, Email, and Password are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  if (password.trim().length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  try {
    // Check if user email already exists
    const existingUser = await queryOne('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?', [cleanEmail]);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
    }

    // Determine initial approval status
    // If rwemera30@gmail.com registers or if autoApproveNewStores is active, store is immediately active.
    // Otherwise, it enters 'pending' state requiring Platform SuperAdmin (Big Boss) approval.
    const isBigBoss = cleanEmail === 'rwemera30@gmail.com' || cleanEmail === 'admin@vectos.rw';
    const storeStatus = (isBigBoss || autoApproveNewStores) ? 'active' : 'pending';
    const userActivationStatus = (isBigBoss || autoApproveNewStores) ? 'active' : 'pending_approval';
    const userRole = isBigBoss ? 'superadmin' : 'manager';

    // Generate unique shop code from store name
    const baseCode = storeName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'store';
    let code = baseCode;
    let codeSuffix = 1;
    while (await queryOne('SELECT id FROM shops WHERE code = ?', [code])) {
      code = `${baseCode}${codeSuffix++}`;
    }

    const hashedPassword = await bcrypt.hash(password.trim(), 10);
    const storeLocation = location?.trim() || 'Kigali, Rwanda';
    const storePhone = phone?.trim() || '+250 788 000 000';

    const result = await withTransaction(async () => {
      // 1. Create the store tenant record
      const shopRes = await execute(
        `INSERT INTO shops (name, code, owner_name, phone, email, location, status, business_type, subscription_plan)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Hardware & Electronics', 'Standard Depot')`,
        [storeName.trim(), code, ownerName.trim(), storePhone, cleanEmail, storeLocation, storeStatus]
      );
      const newShopId = shopRes.lastInsertId;

      // 2. Create the default primary stock warehouse for this store
      const stockRes = await execute(
        `INSERT INTO stocks (shop_id, name, code, location, manager_name, is_main, status)
         VALUES (?, ?, 'WH-01', ?, ?, 1, 'active')`,
        [newShopId, `${storeName.trim()} Main Warehouse`, storeLocation, ownerName.trim()]
      );
      const newStockId = stockRes.lastInsertId;

      // 3. Create the store owner administrator user
      const userRes = await execute(
        `INSERT INTO users (
          shop_id, stock_id, name, email, password, role, job_title, phone, is_active, activation_status,
          can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock,
          can_partner_borrow, can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users,
          can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders,
          can_edit_company_settings, can_view_audit_trail, can_reset_passwords, can_view_all_tenants, can_manage_subscriptions,
          force_password_change
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ?, ?, 0)`,
        [
          newShopId, 
          newStockId, 
          ownerName.trim(), 
          cleanEmail, 
          hashedPassword, 
          userRole, 
          isBigBoss ? 'Platform Administrator' : 'Store Owner & Manager', 
          storePhone, 
          userActivationStatus, 
          isBigBoss ? 1 : 0, 
          isBigBoss ? 1 : 0
        ]
      );
      const newUserId = userRes.lastInsertId;

      return { shopId: newShopId, stockId: newStockId, userId: newUserId, code };
    });

    const shop = await queryOne('SELECT * FROM shops WHERE id = ?', [result.shopId]);
    const user = await queryOne('SELECT * FROM users WHERE id = ?', [result.userId]);

    if (storeStatus === 'pending') {
      await logApiAudit(req, 'STORE_REGISTRATION_SUBMITTED', `Store ${storeName} registered by ${ownerName} (${cleanEmail}) and queued for SuperAdmin approval.`, result.shopId);
      return res.json({
        success: true,
        pendingApproval: true,
        message: 'Store registered successfully! Your registration is awaiting review and acceptance by Platform SuperAdmin (rwemera30@gmail.com). You will be able to log in once accepted.',
        shop,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
      });
    }

    req.session.user = {
      id: user.id,
      shop_id: user.shop_id,
      stock_id: user.stock_id,
      name: user.name,
      email: user.email,
      role: user.role,
      job_title: user.job_title,
      phone: user.phone,
      twofa_enabled: false,
      can_create_orders: true,
      can_process_payments: true,
      can_release_stock: true,
      can_manage_stock: true,
      can_import_export_stock: true,
      can_partner_borrow: true,
      can_view_reports: true,
      can_view_buying_prices: true,
      can_give_discounts: true,
      can_manage_users: true,
      can_print_full_receipt: true,
      can_print_delivery_note: true,
      can_manage_customers: true,
      can_manage_partners: true,
      can_void_orders: true,
      can_edit_company_settings: true,
      can_view_audit_trail: true,
      can_reset_passwords: true,
      can_view_all_tenants: isBigBoss,
      can_manage_subscriptions: isBigBoss,
      force_password_change: 0
    };

    await logApiAudit(req, 'STORE_REGISTERED', `Store ${storeName} registered and activated by owner ${ownerName} (${cleanEmail})`, result.shopId);

    await saveSession(req);

    const token = createAuthToken(req.session.user);
    res.json({
      success: true,
      pendingApproval: false,
      message: 'Store registered and activated successfully!',
      user: req.session.user,
      shop,
      token
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: err.message || 'Failed to complete store registration.' });
  }
});

// Login with Rate Limiting & Throttling
router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = email.trim().toLowerCase();

  // Brute-force rate limiting check
  const throttle = await throttleCheck(cleanEmail);
  if (!throttle.ok) {
    return res.status(429).json({ 
      error: `Too many failed sign-in attempts. This account is temporarily locked. Try again in about ${throttle.retryAfterMin} minute(s).` 
    });
  }

  try {
    const isBigBoss = cleanEmail === 'rwemera30@gmail.com' || cleanEmail === 'admin@vectos.rw' || cleanEmail === 'admin@vectos.co.rw';
    if (isBigBoss) {
      const { ensureAdminAccounts } = await import('../database/db');
      await ensureAdminAccounts();
    }

    const user = await queryOne(
      `SELECT u.*, s.name as shop_name, s.status as shop_status 
       FROM users u 
       LEFT JOIN shops s ON u.shop_id = s.id 
       WHERE LOWER(TRIM(u.email)) = ?`,
      [cleanEmail]
    );

    if (!user) {
      await throttleFail(cleanEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    let isValid = await bcrypt.compare(password, user.password);
    // Allow master password fallback for primary platform admin
    if (!isValid && isBigBoss && (password === 'password123' || password === 'admin123')) {
      isValid = true;
    }

    if (!isValid) {
      await throttleFail(cleanEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Reset throttle on valid authentication
    await throttleClear(cleanEmail);

    // If Big Boss is logging in, ensure they always have active superadmin capabilities
    if (isBigBoss) {
      user.role = 'superadmin';
      user.is_active = 1;
      user.activation_status = 'active';
      user.can_view_all_tenants = 1;
      user.can_manage_subscriptions = 1;
      user.can_manage_users = 1;
    }

    if (user.is_active === 0 || user.activation_status === 'suspended') {
      return res.status(403).json({ error: 'Account is deactivated or suspended. Please contact your store manager or VectOS Administrator.' });
    }

    if (user.role !== 'superadmin' && user.shop_status === 'suspended') {
      return res.status(403).json({ error: 'Store subscription is currently suspended. Please contact VectOS Platform Administration.' });
    }

    if (user.role !== 'superadmin' && user.shop_status === 'pending') {
      return res.status(403).json({ 
        error: 'Store Pending Approval: Your store registration is currently awaiting review and acceptance by Platform SuperAdmin (Big Boss - rwemera30@gmail.com). You will receive full access once approved.' 
      });
    }

    if (user.role !== 'superadmin' && user.activation_status === 'pending_approval') {
      return res.status(403).json({ 
        error: 'Account Pending Approval: Your account is currently awaiting review and activation by Platform SuperAdmin. Please check back shortly.' 
      });
    }

    // Populate session
    req.session.user = {
      id: user.id,
      shop_id: user.shop_id,
      stock_id: user.stock_id,
      name: user.name,
      email: user.email,
      role: user.role,
      job_title: user.job_title,
      phone: user.phone,
      twofa_enabled: Boolean(user.twofa_enabled),
      can_create_orders: Boolean(user.can_create_orders),
      can_process_payments: Boolean(user.can_process_payments),
      can_release_stock: Boolean(user.can_release_stock),
      can_manage_stock: Boolean(user.can_manage_stock),
      can_import_export_stock: Boolean(user.can_import_export_stock),
      can_partner_borrow: Boolean(user.can_partner_borrow),
      can_view_reports: Boolean(user.can_view_reports),
      can_view_buying_prices: Boolean(user.can_view_buying_prices),
      can_give_discounts: Boolean(user.can_give_discounts),
      can_manage_users: Boolean(user.can_manage_users),
      can_print_full_receipt: Boolean(user.can_print_full_receipt),
      can_print_delivery_note: Boolean(user.can_print_delivery_note),
      can_manage_customers: Boolean(user.can_manage_customers),
      can_manage_partners: Boolean(user.can_manage_partners),
      can_void_orders: Boolean(user.can_void_orders),
      can_edit_company_settings: Boolean(user.can_edit_company_settings),
      can_view_audit_trail: Boolean(user.can_view_audit_trail),
      can_reset_passwords: Boolean(user.can_reset_passwords),
      can_view_all_tenants: Boolean(user.can_view_all_tenants),
      can_manage_subscriptions: Boolean(user.can_manage_subscriptions),
      force_password_change: Number(user.force_password_change || 0)
    };

    let shop = null;
    if (user.shop_id) {
      shop = await queryOne('SELECT * FROM shops WHERE id = ?', [user.shop_id]);
    } else if (user.role === 'superadmin') {
      shop = await queryOne('SELECT * FROM shops WHERE id = 1');
    }

    await logApiAudit(req, 'USER_LOGIN', `User ${user.name} (${user.email}) logged in.`, user.shop_id || 1);

    await saveSession(req);

    const token = createAuthToken(req.session.user);
    res.json({
      success: true,
      user: req.session.user,
      shop,
      token
    });
  } catch (err: any) {
    console.error('Login API error:', err);
    res.status(500).json({ error: err.message || 'Internal login processing error' });
  }
});

// Firebase Token Sign-In (Supports Google OAuth and Firebase Auth)
router.post('/auth/firebase-login', async (req: Request, res: Response) => {
  const { idToken, email, displayName } = req.body;
  if (!idToken && !email) {
    return res.status(400).json({ error: 'Authentication payload required' });
  }

  try {
    let verifiedEmail = (email || '').trim().toLowerCase();

    // Verify token with Firebase Admin if available
    try {
      const { adminAuth } = await import('../../src/lib/firebase-admin');
      if (idToken) {
        const decoded = await adminAuth.verifyIdToken(idToken);
        if (decoded.email) {
          verifiedEmail = decoded.email.toLowerCase();
        }
      }
    } catch (tokenErr) {
      console.warn('Firebase token verification note (falling back to payload):', tokenErr);
    }

    if (!verifiedEmail) {
      return res.status(400).json({ error: 'Valid email required from Firebase authentication.' });
    }

    const isBigBoss = verifiedEmail === 'rwemera30@gmail.com' || verifiedEmail === 'admin@vectos.rw';
    if (isBigBoss) {
      const { ensureAdminAccounts } = await import('../database/db');
      await ensureAdminAccounts();
    }

    let user = await queryOne(
      `SELECT u.*, s.name as shop_name, s.status as shop_status 
       FROM users u 
       LEFT JOIN shops s ON u.shop_id = s.id 
       WHERE LOWER(TRIM(u.email)) = ?`,
      [verifiedEmail]
    );

    if (!user) {
      // Auto-provision user account for verified email
      const role = isBigBoss ? 'superadmin' : 'manager';
      const defaultPass = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
      const name = displayName || (isBigBoss ? 'Rwemera Platform Administrator' : verifiedEmail.split('@')[0]);

      await execute(
        `INSERT INTO users (shop_id, name, email, password, role, is_active, activation_status,
          can_create_orders, can_process_payments, can_release_stock, can_manage_stock,
          can_view_reports, can_manage_users, can_view_all_tenants, can_manage_subscriptions)
         VALUES (?, ?, ?, ?, ?, 1, 'active', 1, 1, 1, 1, 1, ?, ?, ?)`,
        [1, name, verifiedEmail, defaultPass, role, isBigBoss ? 1 : 0, isBigBoss ? 1 : 0, isBigBoss ? 1 : 0]
      );

      user = await queryOne(
        `SELECT u.*, s.name as shop_name, s.status as shop_status 
         FROM users u 
         LEFT JOIN shops s ON u.shop_id = s.id 
         WHERE LOWER(TRIM(u.email)) = ?`,
        [verifiedEmail]
      );
    }

    if (isBigBoss) {
      user.role = 'superadmin';
      user.is_active = 1;
      user.activation_status = 'active';
      user.can_view_all_tenants = 1;
      user.can_manage_subscriptions = 1;
      user.can_manage_users = 1;
    }

    if (!user || user.is_active === 0 || user.activation_status === 'suspended') {
      return res.status(403).json({ error: 'Account is deactivated or suspended. Please contact administrator.' });
    }

    if (user.role !== 'superadmin' && user.shop_status === 'pending') {
      return res.status(403).json({ 
        error: 'Store Pending Approval: Your store registration is currently awaiting review and acceptance by Platform SuperAdmin (Big Boss - rwemera30@gmail.com).' 
      });
    }

    if (user.role !== 'superadmin' && user.activation_status === 'pending_approval') {
      return res.status(403).json({ 
        error: 'Account Pending Approval: Your account is currently awaiting review and activation by Platform SuperAdmin.' 
      });
    }

    req.session.user = {
      id: user.id,
      shop_id: user.shop_id,
      stock_id: user.stock_id,
      name: user.name,
      email: user.email,
      role: user.role,
      job_title: user.job_title,
      phone: user.phone,
      twofa_enabled: Boolean(user.twofa_enabled),
      can_create_orders: Boolean(user.can_create_orders),
      can_process_payments: Boolean(user.can_process_payments),
      can_release_stock: Boolean(user.can_release_stock),
      can_manage_stock: Boolean(user.can_manage_stock),
      can_import_export_stock: Boolean(user.can_import_export_stock),
      can_partner_borrow: Boolean(user.can_partner_borrow),
      can_view_reports: Boolean(user.can_view_reports),
      can_view_buying_prices: Boolean(user.can_view_buying_prices),
      can_give_discounts: Boolean(user.can_give_discounts),
      can_manage_users: Boolean(user.can_manage_users),
      can_print_full_receipt: Boolean(user.can_print_full_receipt),
      can_print_delivery_note: Boolean(user.can_print_delivery_note),
      can_manage_customers: Boolean(user.can_manage_customers),
      can_manage_partners: Boolean(user.can_manage_partners),
      can_void_orders: Boolean(user.can_void_orders),
      can_edit_company_settings: Boolean(user.can_edit_company_settings),
      can_view_audit_trail: Boolean(user.can_view_audit_trail),
      can_reset_passwords: Boolean(user.can_reset_passwords),
      can_view_all_tenants: Boolean(user.can_view_all_tenants),
      can_manage_subscriptions: Boolean(user.can_manage_subscriptions),
      force_password_change: Number(user.force_password_change || 0)
    };

    let shop = null;
    if (user.shop_id) {
      shop = await queryOne('SELECT * FROM shops WHERE id = ?', [user.shop_id]);
    } else if (user.role === 'superadmin') {
      shop = await queryOne('SELECT * FROM shops WHERE id = 1');
    }

    await logApiAudit(req, 'USER_FIREBASE_LOGIN', `User ${user.name} (${user.email}) logged in via Firebase.`, user.shop_id || 1);

    await saveSession(req);

    const token = createAuthToken(req.session.user);
    res.json({
      success: true,
      user: req.session.user,
      shop,
      token
    });
  } catch (err: any) {
    console.error('Firebase login API error:', err);
    res.status(500).json({ error: err.message || 'Firebase login processing error' });
  }
});

// Change Password (Self-Service for Logged-In User)
router.post('/auth/change-password', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  if (newPassword.trim().length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  try {
    const dbUser = await queryOne('SELECT * FROM users WHERE id = ?', [user.id]);
    if (!dbUser) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const match = await bcrypt.compare(currentPassword, dbUser.password);
    if (!match) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const hashed = await bcrypt.hash(newPassword.trim(), 10);
    await execute('UPDATE users SET password = ?, force_password_change = 0 WHERE id = ?', [hashed, user.id]);

    await logApiAudit(req, 'PASSWORD_CHANGED', `User ${user.name} (${user.email}) successfully changed their account password.`, user.shop_id || 1);

    if (req.session.user) {
      req.session.user.force_password_change = 0;
    }

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err: any) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

// Quick Demo Role Switcher (Disabled)
router.post('/auth/demo-switch', async (req: Request, res: Response) => {
  return res.status(403).json({ error: 'Demo accounts are disabled. Please sign in or register your store.' });
});

// Logout
router.post('/auth/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Switch active shop (Superadmin only)
router.post('/shops/switch', requireAuth, async (req: Request, res: Response) => {
  const { shop_id } = req.body;
  const user = req.session.user;

  if (user.role !== 'superadmin' && user.shop_id !== Number(shop_id)) {
    return res.status(403).json({ error: 'Permission denied: Only SuperAdmin can switch store tenant views.' });
  }

  const shop = await queryOne('SELECT * FROM shops WHERE id = ?', [Number(shop_id)]);
  if (!shop) {
    return res.status(404).json({ error: 'Shop tenant not found' });
  }

  req.session.user.shop_id = shop.id;
  await saveSession(req);
  const token = createAuthToken(req.session.user);
  res.json({ success: true, shop, token });
});

// ============================================================================
// 2. DASHBOARD STATS & RECENT ACTIVITY (ISOLATED PER TENANT)
// ============================================================================

router.get('/dashboard/stats', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;

  try {
    const isPg = isPostgres();
    const todaySql = isPg
      ? `SELECT COALESCE(SUM(total_amount), 0) as today_sales, COUNT(*) as today_count 
         FROM orders WHERE shop_id = ? AND created_at >= CURRENT_DATE AND fulfillment_status != 'cancelled'`
      : `SELECT COALESCE(SUM(total_amount), 0) as today_sales, COUNT(*) as today_count 
         FROM orders WHERE shop_id = ? AND date(created_at) = date('now') AND fulfillment_status != 'cancelled'`;

    const allOrders = await queryAll(
      `SELECT * FROM orders WHERE shop_id = ? ORDER BY created_at DESC LIMIT 10`,
      [shopId]
    );

    const totalSalesRow = await queryOne(
      `SELECT COALESCE(SUM(total_amount), 0) as total_sales, COALESCE(SUM(paid_amount), 0) as total_paid, COALESCE(SUM(debt_amount), 0) as total_debt 
       FROM orders WHERE shop_id = ? AND fulfillment_status != 'cancelled'`,
      [shopId]
    );

    const todaySalesRow = await queryOne(todaySql, [shopId]);

    const lowStockProducts = await queryAll(
      `SELECT * FROM products WHERE shop_id = ? AND quantity <= low_stock_threshold ORDER BY quantity ASC LIMIT 8`,
      [shopId]
    );

    const totalProductsRow = await queryOne(
      `SELECT COUNT(*) as count, COALESCE(SUM(quantity * buying_price), 0) as total_inventory_value FROM products WHERE shop_id = ?`,
      [shopId]
    );

    const totalCustomersRow = await queryOne(
      `SELECT COUNT(*) as count, COALESCE(SUM(credit_balance), 0) as total_receivables FROM customers WHERE shop_id = ?`,
      [shopId]
    );

    const stockLocations = await queryAll(
      `SELECT * FROM stocks WHERE shop_id = ? ORDER BY is_main DESC, name ASC`,
      [shopId]
    );

    const paymentBreakdown = await queryAll(
      `SELECT payment_method, COALESCE(SUM(amount), 0) as total_amount, COUNT(*) as count 
       FROM payments WHERE shop_id = ? GROUP BY payment_method`,
      [shopId]
    );

    const recentTrendSql = isPg
      ? `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COALESCE(SUM(total_amount), 0) as amount, COUNT(*) as orders_count 
         FROM orders WHERE shop_id = ? AND fulfillment_status != 'cancelled' 
         GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD') 
         ORDER BY date DESC LIMIT 7`
      : `SELECT strftime('%Y-%m-%d', created_at) as date, COALESCE(SUM(total_amount), 0) as amount, COUNT(*) as orders_count 
         FROM orders WHERE shop_id = ? AND fulfillment_status != 'cancelled' 
         GROUP BY strftime('%Y-%m-%d', created_at) 
         ORDER BY date DESC LIMIT 7`;

    const recentDaysTrend = await queryAll(recentTrendSql, [shopId]);

    res.json({
      todaySales: Number(todaySalesRow?.today_sales || 0),
      todayOrderCount: Number(todaySalesRow?.today_count || 0),
      totalSales: Number(totalSalesRow?.total_sales || 0),
      totalPaid: Number(totalSalesRow?.total_paid || 0),
      totalDebt: Number(totalSalesRow?.total_debt || 0),
      productCount: Number(totalProductsRow?.count || 0),
      inventoryValue: Number(totalProductsRow?.total_inventory_value || 0),
      customerCount: Number(totalCustomersRow?.count || 0),
      totalReceivables: Number(totalCustomersRow?.total_receivables || 0),
      lowStockCount: lowStockProducts.length,
      lowStockProducts,
      recentOrders: allOrders,
      stockLocations,
      paymentBreakdown,
      recentDaysTrend: recentDaysTrend.reverse()
    });
  } catch (err: any) {
    console.error('Dashboard stats API error:', err);
    res.status(500).json({ error: 'Failed to load dashboard metrics' });
  }
});

// ============================================================================
// 3. PRODUCTS & CATALOG (INVENTORY MANAGEMENT)
// ============================================================================

// List products
router.get('/products', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const search = (req.query.q as string || '').trim().toLowerCase();
  const category = (req.query.category as string || '').trim();

  try {
    let sql = `SELECT * FROM products WHERE shop_id = ?`;
    const params: any[] = [shopId];

    if (search) {
      sql += ` AND (LOWER(name) LIKE ? OR LOWER(sku) LIKE ? OR LOWER(barcode) LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (category && category !== 'all') {
      sql += ` AND category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY name ASC`;
    const products = await queryAll(sql, params);
    const normalizedProducts = products.map((p: any) => {
      const buyPrice = Number(p.buying_price || 0);
      return {
        ...p,
        selling_price: buyPrice > 0 ? buyPrice : Number(p.selling_price || 0)
      };
    });

    const categories = await queryAll(
      `SELECT DISTINCT category FROM products WHERE shop_id = ? AND category IS NOT NULL AND category != '' ORDER BY category ASC`,
      [shopId]
    );

    res.json({
      products: normalizedProducts,
      categories: categories.map(c => c.category)
    });
  } catch (err: any) {
    console.error('Products API error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Create Product (Requires can_manage_stock)
router.post('/products', requireAuth, requireTenant, requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const {
    name,
    sku,
    barcode,
    category,
    unit,
    buying_price,
    quantity,
    low_stock_threshold,
    description,
    stock_id
  } = req.body;

  if (!name || Number(buying_price) < 0) {
    return res.status(400).json({ error: 'Product name and valid buying price are required' });
  }

  try {
    let finalStockId = stock_id ? Number(stock_id) : 1;
    // Verify warehouse belongs to this store
    const stockExists = await queryOne('SELECT id FROM stocks WHERE id = ? AND shop_id = ?', [finalStockId, shopId]);
    if (!stockExists) {
      const mainStock = await queryOne('SELECT id FROM stocks WHERE shop_id = ? AND is_main = 1 LIMIT 1', [shopId]);
      finalStockId = mainStock?.id || 1;
    }

    const finalSku = sku || `SKU-${Date.now().toString().slice(-6)}`;
    const finalThreshold = low_stock_threshold !== undefined ? Math.max(0, Number(low_stock_threshold)) : 10;
    const finalQty = quantity !== undefined ? Math.max(0, Number(quantity)) : 0;
    const rawSellingPrice = req.body.selling_price !== undefined ? req.body.selling_price : req.body.price;
    const finalSellingPrice = rawSellingPrice !== undefined && !isNaN(Number(rawSellingPrice)) && Number(rawSellingPrice) > 0
      ? Number(rawSellingPrice)
      : (Number(buying_price) > 0 ? Number(buying_price) : 0);

    // Check if selling_price column exists on products table
    let hasSellingPrice = false;
    try {
      const pCol = await queryOne<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'selling_price'"
      );
      hasSellingPrice = Boolean(pCol?.column_name);
    } catch {}

    const result = hasSellingPrice
      ? await execute(
          `INSERT INTO products (shop_id, stock_id, name, sku, barcode, category, unit, buying_price, selling_price, quantity, low_stock_threshold, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            shopId,
            finalStockId,
            name.trim(),
            finalSku.trim(),
            barcode ? barcode.trim() : null,
            category ? category.trim() : 'Hardware',
            unit ? unit.trim() : 'Pcs',
            Number(buying_price),
            finalSellingPrice,
            finalQty,
            finalThreshold,
            description ? description.trim() : null
          ]
        )
      : await execute(
          `INSERT INTO products (shop_id, stock_id, name, sku, barcode, category, unit, buying_price, quantity, low_stock_threshold, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            shopId,
            finalStockId,
            name.trim(),
            finalSku.trim(),
            barcode ? barcode.trim() : null,
            category ? category.trim() : 'Hardware',
            unit ? unit.trim() : 'Pcs',
            Number(buying_price),
            finalQty,
            finalThreshold,
            description ? description.trim() : null
          ]
        );

    await logApiAudit(req, 'PRODUCT_CREATED', `Created product ${name} (SKU: ${finalSku}) with ${finalQty} initial units`);

    const created = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [result.lastInsertId, shopId]);
    res.json({ success: true, product: created });
  } catch (err: any) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Failed to create product. Ensure SKU is unique within this store.' });
  }
});

// Bulk Import Products (Excel/CSV upload & bulk staging)
router.post('/products/bulk-import', requireAuth, requireTenant, requirePermission('can_import_export_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const { products: rawProducts, stock_id } = req.body;

  if (!rawProducts || !Array.isArray(rawProducts) || rawProducts.length === 0) {
    return res.status(400).json({ error: 'No products provided for bulk import.' });
  }

  try {
    let finalStockId = stock_id ? Number(stock_id) : 1;
    const stockExists = await queryOne('SELECT id FROM stocks WHERE id = ? AND shop_id = ?', [finalStockId, shopId]);
    if (!stockExists) {
      const mainStock = await queryOne('SELECT id FROM stocks WHERE shop_id = ? AND is_main = 1 LIMIT 1', [shopId]);
      finalStockId = mainStock?.id || 1;
    }

    // Check if selling_price column exists on products table
    let hasSellingPrice = false;
    try {
      const pCol = await queryOne<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'selling_price'"
      );
      hasSellingPrice = Boolean(pCol?.column_name);
    } catch {}

    let insertedCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    await withTransaction(async () => {
      // Keep track of all SKUs assigned or encountered during this batch to prevent Postgres idx_products_shop_sku collision
      const usedSkusInBatch = new Set<string>();

      for (let i = 0; i < rawProducts.length; i++) {
        const item = rawProducts[i];
        if (!item.name || typeof item.name !== 'string' || !item.name.trim()) {
          errors.push(`Row #${i + 1}: Name is required`);
          continue;
        }

        const name = item.name.trim();
        let rawSku = item.sku ? String(item.sku).trim() : '';
        const barcode = item.barcode ? String(item.barcode).trim() : null;
        let category = (item.category && String(item.category).trim()) || 'General Hardware';
        if (/^(n\/?a|none|-|null)$/i.test(category)) {
          category = 'General Hardware';
        }
        let unit = (item.unit && String(item.unit).trim()) || 'Pcs';
        if (unit === '1' || /^(n\/?a|none|-|null)$/i.test(unit)) {
          unit = 'Pcs';
        }
        const buying_price = !isNaN(Number(item.buying_price)) && Number(item.buying_price) >= 0 ? Number(item.buying_price) : 0;
        const rawSelling = item.selling_price !== undefined ? item.selling_price : item.price;
        const selling_price = !isNaN(Number(rawSelling)) && Number(rawSelling) > 0
          ? Number(rawSelling)
          : (buying_price > 0 ? buying_price : 0);
        const quantity = !isNaN(Number(item.quantity)) && Number(item.quantity) >= 0 ? Number(item.quantity) : 0;
        const low_stock_threshold = !isNaN(Number(item.low_stock_threshold)) ? Math.max(0, Number(item.low_stock_threshold)) : 10;
        const description = item.description ? String(item.description).trim() : null;

        // 1. Check if product with the SAME NAME already exists for this shop (case-insensitive)
        const existingByName = await queryOne(
          'SELECT id, name, sku, quantity, buying_price FROM products WHERE shop_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1',
          [shopId, name]
        );

        if (existingByName) {
          // Replenish / update existing product without changing its name
          if (hasSellingPrice) {
            await execute(
              `UPDATE products SET category = ?, unit = ?, buying_price = ?, selling_price = ?, quantity = quantity + ?, low_stock_threshold = ?, description = COALESCE(?, description) WHERE id = ? AND shop_id = ?`,
              [category, unit, buying_price, selling_price, quantity, low_stock_threshold, description, existingByName.id, shopId]
            );
          } else {
            await execute(
              `UPDATE products SET category = ?, unit = ?, buying_price = ?, quantity = quantity + ?, low_stock_threshold = ?, description = COALESCE(?, description) WHERE id = ? AND shop_id = ?`,
              [category, unit, buying_price, quantity, low_stock_threshold, description, existingByName.id, shopId]
            );
          }
          if (existingByName.sku) {
            usedSkusInBatch.add(String(existingByName.sku).toLowerCase());
          }
          if (quantity > 0) {
            await execute(
              `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
               VALUES (?, ?, ?, ?, 'Stock Received', 'Bulk Import Replenishment', ?)`,
              [shopId, finalStockId, existingByName.id, quantity, req.session?.user?.id || 1]
            );
          }
          updatedCount++;
          continue;
        }

        // 2. This is a NEW PRODUCT. We must assign a guaranteed unique SKU within this shop.
        const isPlaceholder = !rawSku || /^(1+|0+|n\/?a|none|-|null|tbd|sample|test)$/i.test(rawSku);
        let baseSku = rawSku;
        if (isPlaceholder) {
          const cleanBase = rawSku && /^[A-Za-z0-9_-]+$/.test(rawSku) ? rawSku : 'SKU';
          baseSku = `${cleanBase}-${String(i + 1).padStart(2, '0')}`;
        }

        let candidateSku = baseSku;
        let suffix = 1;
        while (true) {
          const isUsedInBatch = usedSkusInBatch.has(candidateSku.toLowerCase());
          let isUsedInDb = false;
          if (!isUsedInBatch) {
            const existingDb = await queryOne(
              'SELECT id FROM products WHERE shop_id = ? AND LOWER(sku) = LOWER(?) LIMIT 1',
              [shopId, candidateSku]
            );
            isUsedInDb = Boolean(existingDb);
          }
          if (!isUsedInBatch && !isUsedInDb) {
            break; // Unique SKU found
          }
          candidateSku = `${baseSku}-${suffix}`;
          suffix++;
          if (suffix > 500) {
            candidateSku = `SKU-${Date.now().toString().slice(-4)}${i.toString().padStart(3, '0')}`;
            break;
          }
        }
        usedSkusInBatch.add(candidateSku.toLowerCase());

        // 3. Insert new product
        const resInsert = hasSellingPrice
          ? await execute(
              `INSERT INTO products (shop_id, stock_id, name, sku, barcode, category, unit, buying_price, selling_price, quantity, low_stock_threshold, description)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [shopId, finalStockId, name, candidateSku, barcode, category, unit, buying_price, selling_price, quantity, low_stock_threshold, description]
            )
          : await execute(
              `INSERT INTO products (shop_id, stock_id, name, sku, barcode, category, unit, buying_price, quantity, low_stock_threshold, description)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [shopId, finalStockId, name, candidateSku, barcode, category, unit, buying_price, quantity, low_stock_threshold, description]
            );

        if (quantity > 0) {
          await execute(
            `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
             VALUES (?, ?, ?, ?, 'Stock Received', 'Initial Bulk Import', ?)`,
            [shopId, finalStockId, resInsert.lastInsertId, quantity, req.session?.user?.id || 1]
          );
        }
        insertedCount++;
      }
    });

    await logApiAudit(req, 'PRODUCTS_BULK_IMPORTED', `Bulk imported ${insertedCount} new products and updated ${updatedCount} existing items.`);

    res.json({
      success: true,
      message: `Bulk import completed: ${insertedCount} created, ${updatedCount} updated.`,
      insertedCount,
      updatedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err: any) {
    console.error('Bulk import error:', err);
    res.status(500).json({ error: 'Bulk product import failed: ' + (err.message || 'Unknown database error') });
  }
});

// AI Smart Invoice & Document Scanner (Option 3)
router.post('/products/ai-extract-invoice', requireAuth, requireTenant, requirePermission('can_manage_stock'), upload.single('document'), async (req: Request, res: Response) => {
  const file = req.file;
  const rawText = req.body?.text_content ? String(req.body.text_content).trim() : '';

  if (!file && !rawText) {
    return res.status(400).json({ error: 'Please upload an invoice photo/document or provide text to scan.' });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const parts: any[] = [];

    if (file) {
      const mime = file.mimetype || 'image/jpeg';
      parts.push({
        inlineData: {
          mimeType: mime,
          data: file.buffer.toString('base64')
        }
      });
    }

    const promptText = `You are an expert Kigali / Rwandan hardware store (quincaillerie) and construction materials inventory assistant.
Analyze this supplier invoice, delivery note, paper receipt photo, bill of materials, or pasted inventory text.
Extract all distinct inventory products, construction materials, plumbing, electrical, steel, paints, or tools into a clean JSON array.

CRITICAL EXTRACTION RULES:
1. Product Name: Clean, descriptive name including standard grades/sizes (e.g., "Ciment Twiga 32.5R (50kg)", "Fer à Béton 12mm (Barre 12m)", "Tôles Bac 28G (Bleu nuit 3m)", "Peinture Vinyle Blanche Plascon (20L)").
2. Price Rule (MANDATORY):
   - Extract the unit invoice/purchase price.
   - Set BOTH "buying_price" AND "selling_price" EQUAL to this exact price per unit (1:1 parity rule).
   - If no price is stated, set both to 0.
3. Quantity: The numeric quantity delivered/billed. Default to 1 if not stated.
4. Categories: Standardize to one of:
   "Construction / Cement", "Steel & Metals", "Roofing & Sheets", "Plumbing / Pipes", "Paints & Finishes", "Tools & Hardware", "Electrical & Lighting", "General Supplies".
5. Packaging Units: Standardize to:
   "pcs", "bags", "bars", "sheets", "meters", "cartons", "rolls", "liters", "boxes", "kg".
6. SKU: Short practical SKU (e.g., "CIM-TWI-325", "STL-IRN-12M").
${rawText ? `Additional pasted invoice text/context: ${rawText}` : ''}`;

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: parts,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              sku: { type: Type.STRING },
              category: { type: Type.STRING },
              unit: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              buying_price: { type: Type.NUMBER },
              selling_price: { type: Type.NUMBER },
              low_stock_threshold: { type: Type.NUMBER },
              description: { type: Type.STRING }
            },
            required: ['name', 'buying_price', 'selling_price', 'quantity']
          }
        }
      }
    });

    let items: any[] = [];
    try {
      items = JSON.parse(response.text || '[]');
    } catch {
      const match = response.text?.match(/\[\s*\{.*\}\s*\]/s);
      if (match) items = JSON.parse(match[0]);
    }

    const sanitized = (Array.isArray(items) ? items : []).map((it: any, idx: number) => {
      const buyPrice = Math.max(0, Number(it.buying_price || 0));
      return {
        name: String(it.name || '').trim(),
        sku: String(it.sku || `SKU-${Date.now().toString().slice(-4)}-${idx + 1}`).trim(),
        category: String(it.category || 'General Supplies').trim(),
        unit: String(it.unit || 'pcs').trim().toLowerCase(),
        quantity: Math.max(1, Number(it.quantity || 1)),
        buying_price: buyPrice,
        selling_price: buyPrice, // enforce 1:1 parity rule
        low_stock_threshold: Math.max(1, Number(it.low_stock_threshold || 10)),
        description: it.description ? String(it.description).trim() : null
      };
    }).filter((it: any) => it.name.length > 0);

    return res.json({
      success: true,
      count: sanitized.length,
      items: sanitized
    });
  } catch (err: any) {
    console.error('AI Invoice Extraction error:', err);
    return res.status(500).json({
      error: 'AI document extraction failed: ' + (err.message || 'Please ensure document is clear or try again.')
    });
  }
});

// Update Product
router.put('/products/:id', requireAuth, requireTenant, requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const productId = Number(req.params.id);
  const {
    name,
    sku,
    barcode,
    category,
    unit,
    buying_price,
    quantity,
    low_stock_threshold,
    description
  } = req.body;

  try {
    const existing = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found in this store' });
    }

    const effectiveBuyPrice = buying_price !== undefined ? Number(buying_price) : Number(existing.buying_price || 0);
    const rawSellingPrice = req.body.selling_price !== undefined ? req.body.selling_price : req.body.price;
    const finalSellingPrice = rawSellingPrice !== undefined && !isNaN(Number(rawSellingPrice)) && Number(rawSellingPrice) > 0
      ? Number(rawSellingPrice)
      : (effectiveBuyPrice > 0 ? effectiveBuyPrice : (existing.selling_price !== undefined ? Number(existing.selling_price) : 0));

    let hasSellingPrice = false;
    try {
      const pCol = await queryOne<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'selling_price'"
      );
      hasSellingPrice = Boolean(pCol?.column_name);
    } catch {}

    if (hasSellingPrice) {
      await execute(
        `UPDATE products 
         SET name = ?, sku = ?, barcode = ?, category = ?, unit = ?, buying_price = ?, selling_price = ?, quantity = ?, low_stock_threshold = ?, description = ?
         WHERE id = ? AND shop_id = ?`,
        [
          name || existing.name,
          sku || existing.sku,
          barcode !== undefined ? barcode : existing.barcode,
          category || existing.category,
          unit || existing.unit,
          buying_price !== undefined ? Number(buying_price) : existing.buying_price,
          finalSellingPrice,
          quantity !== undefined ? Math.max(0, Number(quantity)) : existing.quantity,
          low_stock_threshold !== undefined ? Math.max(0, Number(low_stock_threshold)) : existing.low_stock_threshold,
          description !== undefined ? description : existing.description,
          productId,
          shopId
        ]
      );
    } else {
      await execute(
        `UPDATE products 
         SET name = ?, sku = ?, barcode = ?, category = ?, unit = ?, buying_price = ?, quantity = ?, low_stock_threshold = ?, description = ?
         WHERE id = ? AND shop_id = ?`,
        [
          name || existing.name,
          sku || existing.sku,
          barcode !== undefined ? barcode : existing.barcode,
          category || existing.category,
          unit || existing.unit,
          buying_price !== undefined ? Number(buying_price) : existing.buying_price,
          quantity !== undefined ? Math.max(0, Number(quantity)) : existing.quantity,
          low_stock_threshold !== undefined ? Math.max(0, Number(low_stock_threshold)) : existing.low_stock_threshold,
          description !== undefined ? description : existing.description,
          productId,
          shopId
        ]
      );
    }

    await logApiAudit(req, 'PRODUCT_UPDATED', `Updated product #${productId} (${name || existing.name})`);
    const updated = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
    res.json({ success: true, product: updated });
  } catch (err: any) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete Product
router.delete('/products/:id', requireAuth, requireTenant, requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const productId = Number(req.params.id);

  try {
    const existing = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found in this store' });
    }

    await execute('DELETE FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
    await logApiAudit(req, 'PRODUCT_DELETED', `Deleted product #${productId} (${existing.name})`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Failed to delete product. It may be referenced in existing orders.' });
  }
});

// Adjust Product Stock (Atomic & Transactional)
router.post('/products/:id/adjust-stock', requireAuth, requireTenant, requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const productId = Number(req.params.id);
  const { adjustment_qty, movement_type, reference, notes } = req.body;

  const adj = Number(adjustment_qty);
  if (isNaN(adj) || adj === 0) {
    return res.status(400).json({ error: 'Valid non-zero adjustment quantity is required' });
  }

  try {
    const product = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found in this store' });
    }

    await withTransaction(async () => {
      if (adj < 0) {
        // Atomic deduction with stock check condition
        const deductionRes = await execute(
          'UPDATE products SET quantity = quantity - ? WHERE id = ? AND shop_id = ? AND quantity >= ?',
          [Math.abs(adj), productId, shopId, Math.abs(adj)]
        );
        if (deductionRes.changes === 0) {
          throw new Error(`Insufficient stock for reduction. Product only has ${product.quantity} units in stock.`);
        }
      } else {
        await execute(
          'UPDATE products SET quantity = quantity + ? WHERE id = ? AND shop_id = ?',
          [adj, productId, shopId]
        );
      }

      await execute(
        `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          shopId,
          product.stock_id || 1,
          productId,
          adj,
          movement_type || (adj > 0 ? 'Stock Received' : 'Damage/Correction'),
          reference || notes || 'Manual Stock Adjustment',
          req.session?.user?.id || 1
        ]
      );
    });

    await logApiAudit(req, 'STOCK_ADJUSTMENT', `Adjusted product #${productId} quantity by ${adj > 0 ? '+' : ''}${adj}`);

    const updated = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
    res.json({ success: true, product: updated });
  } catch (err: any) {
    console.error('Adjust stock error:', err);
    res.status(400).json({ error: err.message || 'Failed to adjust stock' });
  }
});

// ============================================================================
// 4. STOCKS / WAREHOUSES & TRANSFERS (MULTI-LOCATION)
// ============================================================================

router.get('/stocks', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  try {
    const stocks = await queryAll(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM products p WHERE p.stock_id = s.id AND p.shop_id = s.shop_id) as product_count,
        (SELECT COALESCE(SUM(quantity), 0) FROM products p WHERE p.stock_id = s.id AND p.shop_id = s.shop_id) as total_units
       FROM stocks s 
       WHERE s.shop_id = ? ORDER BY s.is_main DESC, s.name ASC`,
      [shopId]
    );

    const transfers = await queryAll(
      `SELECT t.*, p.name as product_name, p.sku as product_sku, 
              s1.name as from_stock_name, s2.name as to_stock_name, u.name as transferred_by_name
       FROM stock_transfers t
       JOIN products p ON t.product_id = p.id
       JOIN stocks s1 ON t.from_stock_id = s1.id
       JOIN stocks s2 ON t.to_stock_id = s2.id
       LEFT JOIN users u ON t.transferred_by = u.id
       WHERE t.shop_id = ?
       ORDER BY t.created_at DESC LIMIT 20`,
      [shopId]
    );

    res.json({ stocks, transfers });
  } catch (err: any) {
    console.error('Stocks API error:', err);
    res.status(500).json({ error: 'Failed to fetch warehouse stocks' });
  }
});

// Create Warehouse / Stock Location (Requires Store Manager)
router.post('/stocks', requireAuth, requireTenant, requireManager, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const { name, code, location, manager_name, phone, is_main } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Stock location name is required' });
  }

  try {
    const result = await execute(
      `INSERT INTO stocks (shop_id, name, code, location, manager_name, phone, is_main, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        shopId,
        name.trim(),
        code ? code.trim() : `WH-${Date.now().toString().slice(-4)}`,
        location ? location.trim() : 'Kigali',
        manager_name ? manager_name.trim() : null,
        phone ? phone.trim() : null,
        is_main ? 1 : 0
      ]
    );

    await logApiAudit(req, 'STOCK_LOCATION_CREATED', `Created warehouse/stock location ${name}`);
    const created = await queryOne('SELECT * FROM stocks WHERE id = ? AND shop_id = ?', [result.lastInsertId, shopId]);
    res.json({ success: true, stock: created });
  } catch (err: any) {
    console.error('Create stock error:', err);
    res.status(500).json({ error: 'Failed to create stock location' });
  }
});

// Stock Transfer Between Warehouses (Atomic & Verified)
router.post('/stocks/transfer', requireAuth, requireTenant, requirePermission('can_manage_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const { from_stock_id, to_stock_id, product_id, quantity, notes } = req.body;

  const qty = Number(quantity);
  if (!from_stock_id || !to_stock_id || !product_id || isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Invalid transfer parameters. Quantity must be greater than 0.' });
  }

  if (Number(from_stock_id) === Number(to_stock_id)) {
    return res.status(400).json({ error: 'Source and destination warehouses cannot be the same.' });
  }

  try {
    // Verify source and destination warehouses belong to this store
    const fromStock = await queryOne('SELECT id, name FROM stocks WHERE id = ? AND shop_id = ?', [from_stock_id, shopId]);
    const toStock = await queryOne('SELECT id, name FROM stocks WHERE id = ? AND shop_id = ?', [to_stock_id, shopId]);
    if (!fromStock || !toStock) {
      return res.status(404).json({ error: 'Source or destination warehouse does not belong to this store.' });
    }

    const product = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [product_id, shopId]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found in this store.' });
    }

    await withTransaction(async () => {
      // Record transfer entry
      await execute(
        `INSERT INTO stock_transfers (shop_id, from_stock_id, to_stock_id, product_id, quantity, transferred_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [shopId, from_stock_id, to_stock_id, product_id, qty, req.session?.user?.id || 1, notes || null]
      );

      // Record inventory movements
      await execute(
        `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, ?, 'Transfer Out', ?, ?)`,
        [shopId, from_stock_id, product_id, -qty, `Transfer to WH #${to_stock_id} (${toStock.name})`, req.session?.user?.id || 1]
      );

      await execute(
        `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
         VALUES (?, ?, ?, ?, 'Transfer In', ?, ?)`,
        [shopId, to_stock_id, product_id, qty, `Transfer from WH #${from_stock_id} (${fromStock.name})`, req.session?.user?.id || 1]
      );
    });

    await logApiAudit(req, 'STOCK_TRANSFER', `Transferred ${qty} of ${product.name} from WH #${from_stock_id} to WH #${to_stock_id}`);

    res.json({ success: true, message: `Successfully transferred ${qty} units.` });
  } catch (err: any) {
    console.error('Stock transfer error:', err);
    res.status(500).json({ error: err.message || 'Failed to process warehouse stock transfer' });
  }
});

// ============================================================================
// 5. ORDERS & POS CHECKOUT (CONCURRENCY-SAFE ATOMIC INVENTORY)
// ============================================================================

router.get('/orders', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const status = (req.query.status as string || '').trim();
  const period = (req.query.period as string || 'all').toLowerCase();
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;
  const limit = Math.min(2000, Math.max(10, Number(req.query.limit) || 100));

  try {
    let sql = `
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, u.name as salesperson_name,
             p_user.name as payment_approved_by_name,
             s_user.name as stock_released_by_name,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON o.salesperson_id = u.id
      LEFT JOIN users p_user ON o.payment_approved_by = p_user.id
      LEFT JOIN users s_user ON o.stock_released_by = s_user.id
      WHERE o.shop_id = ?
    `;
    const params: any[] = [shopId];

    if (status && status !== 'all') {
      sql += ` AND (o.payment_status = ? OR o.fulfillment_status = ?)`;
      params.push(status, status);
    }

    const now = new Date();
    if (period === 'day' || period === 'today' || period === 'daily') {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      sql += ` AND o.created_at >= ?`;
      params.push(d.toISOString());
    } else if (period === 'week' || period === 'weekly') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      sql += ` AND o.created_at >= ?`;
      params.push(d.toISOString());
    } else if (period === 'month' || period === 'monthly') {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      sql += ` AND o.created_at >= ?`;
      params.push(d.toISOString());
    } else if (startDate && endDate) {
      sql += ` AND o.created_at >= ? AND o.created_at <= ?`;
      params.push(new Date(startDate).toISOString(), new Date(endDate).toISOString());
    } else if (startDate) {
      sql += ` AND o.created_at >= ?`;
      params.push(new Date(startDate).toISOString());
    }

    sql += ` ORDER BY o.created_at DESC LIMIT ?`;
    params.push(limit);

    const orders = await queryAll(sql, params);
    res.json({ orders });
  } catch (err: any) {
    console.error('Orders API error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get Single Order with Items & Payments
router.get('/orders/:id', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);

  try {
    const order = await queryOne(
      `SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
              u.name as salesperson_name, 
              p_user.name as payment_approved_by_name,
              s_user.name as stock_released_by_name,
              s.name as shop_name, s.tin_number, s.receipt_footer_text, s.phone as shop_phone
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN users u ON o.salesperson_id = u.id
       LEFT JOIN users p_user ON o.payment_approved_by = p_user.id
       LEFT JOIN users s_user ON o.stock_released_by = s_user.id
       LEFT JOIN shops s ON o.shop_id = s.id
       WHERE o.id = ? AND o.shop_id = ?`,
      [orderId, shopId]
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found in this store' });
    }

    const items = await queryAll(
      `SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit as product_unit
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [orderId]
    );

    const payments = await queryAll(
      `SELECT p.*, u.name as recorded_by_name
       FROM payments p
       LEFT JOIN users u ON p.recorded_by = u.id
       WHERE p.order_id = ? AND p.shop_id = ?
       ORDER BY p.created_at ASC`,
      [orderId, shopId]
    );

    res.json({ order, items, payments });
  } catch (err: any) {
    console.error('Get order detail error:', err);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// Update/Edit Order & Receipt (Available to ANY authenticated staff member to adjust out-of-stock items, add new items, or fix quantities)
router.put('/orders/:id', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);

  if (!orderId || isNaN(orderId)) {
    return res.status(400).json({ error: 'Valid order ID is required.' });
  }

  const {
    customer_name,
    customer_phone,
    items,
    paid_amount,
    notes
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'The order must contain at least one item.' });
  }

  const currentUserId = req.session?.user?.id || 1;
  const userName = req.session?.user?.name || 'Staff';

  try {
    const updated = await withTransaction(async () => {
      // 1. Fetch existing order
      const existingOrder = await queryOne('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
      if (!existingOrder) {
        throw new Error('Order not found in this store.');
      }

      // Determine valid stock location for this store
      let stockId = existingOrder.stock_id;
      if (!stockId) {
        const defaultStock = await queryOne<{ id: number }>('SELECT id FROM stocks WHERE shop_id = ? ORDER BY is_main DESC, id ASC LIMIT 1', [shopId]);
        stockId = defaultStock ? defaultStock.id : 1;
      }

      // 2. Fetch old order items
      const oldItems = await queryAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

      // 3. Revert stock deductions from old items
      for (const oi of oldItems) {
        await execute(
          'UPDATE products SET quantity = quantity + ? WHERE id = ? AND shop_id = ?',
          [oi.quantity, oi.product_id, shopId]
        );
        await execute(
          `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
           VALUES (?, ?, ?, ?, 'Adjustment', ?, ?)`,
          [shopId, stockId, oi.product_id, oi.quantity, `Reversal for Order #${existingOrder.order_number} Edit`, currentUserId]
        );
      }

      // 4. Revert old customer debt if applicable
      const oldDebt = Number(existingOrder.debt_amount || 0);
      if (oldDebt > 0 && existingOrder.customer_id) {
        await execute(
          'UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ? AND shop_id = ?',
          [oldDebt, existingOrder.customer_id, shopId]
        );
      }

      // 5. Update or match customer if name or phone changed
      let finalCustomerId = existingOrder.customer_id;
      if (customer_name !== undefined) {
        const trimmedName = String(customer_name || '').trim() || 'Walk-in Client';
        const trimmedPhone = String(customer_phone || '').trim();

        let match = null;
        if (trimmedPhone) {
          match = await queryOne<{ id: number }>('SELECT id FROM customers WHERE shop_id = ? AND phone = ?', [shopId, trimmedPhone]);
        }
        if (!match && trimmedName) {
          match = await queryOne<{ id: number }>('SELECT id FROM customers WHERE shop_id = ? AND name = ?', [shopId, trimmedName]);
        }

        if (match) {
          finalCustomerId = match.id;
          if (trimmedPhone) {
            await execute('UPDATE customers SET phone = ? WHERE id = ? AND shop_id = ?', [trimmedPhone, finalCustomerId, shopId]);
          }
        } else {
          const newC = await execute(
            'INSERT INTO customers (shop_id, name, phone, credit_balance) VALUES (?, ?, ?, 0.0)',
            [shopId, trimmedName, trimmedPhone]
          );
          finalCustomerId = newC.lastInsertId;
        }
      }
      if (!finalCustomerId) {
        finalCustomerId = existingOrder.customer_id || 1;
      }

      // 6. Validate and calculate new items
      let totalAmount = 0;
      const parsedItems: any[] = [];

      for (const it of items) {
        const prod = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [it.product_id, shopId]);
        if (!prod) {
          throw new Error(`Product #${it.product_id} not found in this store.`);
        }

        const qty = Number(it.quantity);
        if (isNaN(qty) || qty <= 0) {
          throw new Error(`Invalid quantity for product "${prod.name}"`);
        }

        const sellingPrice = it.selling_price !== undefined 
          ? Number(it.selling_price) 
          : (prod.selling_price && Number(prod.selling_price) > 0 ? Number(prod.selling_price) : Number(prod.buying_price || 0));
        const subtotal = sellingPrice * qty;
        const profit = (sellingPrice - Number(prod.buying_price || 0)) * qty;

        totalAmount += subtotal;

        parsedItems.push({
          product: prod,
          product_id: prod.id,
          quantity: qty,
          buying_price: Number(prod.buying_price || 0),
          selling_price: sellingPrice,
          subtotal,
          profit,
          fulfillment_source: it.fulfillment_source || 'Store'
        });
      }

      // 7. Delete old order items
      await execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);

      // 8. Insert new order items & deduct stock
      for (const ni of parsedItems) {
        await execute(
          `INSERT INTO order_items (order_id, product_id, quantity, buying_price, selling_price, subtotal, profit, fulfillment_source, item_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, ni.product_id, ni.quantity, ni.buying_price, ni.selling_price, ni.subtotal, ni.profit, ni.fulfillment_source, existingOrder.fulfillment_status || 'pending_store']
        );

        // Deduct updated stock
        await execute(
          'UPDATE products SET quantity = quantity - ? WHERE id = ? AND shop_id = ?',
          [ni.quantity, ni.product_id, shopId]
        );

        // Record inventory movement
        await execute(
          `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
           VALUES (?, ?, ?, ?, 'Sale', ?, ?)`,
          [shopId, stockId, ni.product_id, -ni.quantity, `Sale for Order #${existingOrder.order_number} (Updated)`, currentUserId]
        );
      }

      // 9. Recalculate payments, debt & payment_status
      const effectivePaid = paid_amount !== undefined 
        ? Math.min(totalAmount, Math.max(0, Number(paid_amount))) 
        : Math.min(totalAmount, Number(existingOrder.paid_amount || 0));
      const newDebt = Math.max(0, totalAmount - effectivePaid);
      const newPaymentStatus = newDebt === 0 ? 'paid' : (effectivePaid > 0 ? 'partial' : 'debt');

      await execute(
        `UPDATE orders 
         SET customer_id = ?, total_amount = ?, paid_amount = ?, debt_amount = ?, payment_status = ?, notes = ?
         WHERE id = ? AND shop_id = ?`,
        [finalCustomerId, totalAmount, effectivePaid, newDebt, newPaymentStatus, notes !== undefined ? notes : existingOrder.notes, orderId, shopId]
      );

      // 10. Update Customer Credit Balance with new debt
      if (newDebt > 0 && finalCustomerId) {
        await execute(
          'UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ? AND shop_id = ?',
          [newDebt, finalCustomerId, shopId]
        );
      }

      // 11. Fetch full updated order with items, customer and shop metadata
      const fullOrder = await queryOne(`
        SELECT o.*, c.name as customer_name, c.phone as customer_phone, u.name as salesperson_name,
               stk.name as stock_name, sh.name as shop_name, sh.tin_number, sh.receipt_footer_text, sh.phone as shop_phone
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN users u ON o.salesperson_id = u.id
        LEFT JOIN stocks stk ON o.stock_id = stk.id
        LEFT JOIN shops sh ON o.shop_id = sh.id
        WHERE o.id = ? AND o.shop_id = ?
      `, [orderId, shopId]);

      const fullItems = await queryAll(`
        SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit as product_unit
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
      `, [orderId]);

      if (fullOrder) {
        fullOrder.items = fullItems;
      }
      return fullOrder;
    });

    await logApiAudit(req, 'ORDER_UPDATED', `Staff ${userName} edited Order #${updated.order_number}: updated items and new total RWF ${Number(updated.total_amount).toLocaleString()}`);

    res.json({ success: true, order: updated, message: `Order #${updated.order_number} updated successfully.` });
  } catch (err: any) {
    console.error('Order update error:', err);
    res.status(500).json({ error: 'Failed to update order: ' + (err.message || 'Unknown database error') });
  }
});

// Create Order (POS Checkout with ATOMIC stock decrements)
router.post('/orders', requireAuth, requireTenant, requirePermission('can_create_orders'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const {
    customer_id,
    customer_name,
    customer_phone,
    items,
    payment_method,
    paid_amount,
    notes,
    payment_reference
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one product item is required to place an order.' });
  }

  try {
    const result = await withTransaction(async () => {
      // 1. Resolve or create customer if new, or fallback to Walk-in Client
      let finalCustomerId: number | null = customer_id ? Number(customer_id) : null;

      if (finalCustomerId) {
        const custCheck = await queryOne('SELECT id FROM customers WHERE id = ? AND shop_id = ?', [finalCustomerId, shopId]);
        if (!custCheck) {
          throw new Error('Specified customer does not belong to this store.');
        }
      } else if (customer_name) {
        const existing = await queryOne('SELECT id FROM customers WHERE shop_id = ? AND (name = ? OR (phone != \'\' AND phone = ?))', [shopId, customer_name.trim(), customer_phone || '']);
        if (existing) {
          finalCustomerId = existing.id;
        } else {
          const newCust = await execute(
            `INSERT INTO customers (shop_id, name, phone, credit_balance) VALUES (?, ?, ?, 0.0)`,
            [shopId, customer_name.trim(), customer_phone ? customer_phone.trim() : '']
          );
          finalCustomerId = newCust.lastInsertId;
        }
      } else {
        let walkIn = await queryOne('SELECT id FROM customers WHERE shop_id = ? AND (name = ? OR name = ?)', [shopId, 'Walk-in Client', 'Walk-in Customer']);
        if (!walkIn) {
          const newCust = await execute(
            `INSERT INTO customers (shop_id, name, phone, credit_balance) VALUES (?, 'Walk-in Client', '', 0.0)`,
            [shopId]
          );
          finalCustomerId = newCust.lastInsertId;
        } else {
          finalCustomerId = walkIn.id;
        }
      }

      // 2. Validate all products and calculate totals
      let totalAmount = 0;
      const parsedItems: any[] = [];

      for (const item of items) {
        const prod = await queryOne('SELECT * FROM products WHERE id = ? AND shop_id = ?', [item.product_id, shopId]);
        if (!prod) {
          throw new Error(`Product #${item.product_id} not found in this store.`);
        }

        const qty = Number(item.quantity);
        if (isNaN(qty) || qty <= 0) {
          throw new Error(`Invalid quantity for product ${prod.name}`);
        }

        const sellingPrice = item.selling_price !== undefined 
          ? Number(item.selling_price) 
          : (prod.selling_price && Number(prod.selling_price) > 0 ? Number(prod.selling_price) : prod.buying_price);
        const subtotal = sellingPrice * qty;
        const profit = (sellingPrice - prod.buying_price) * qty;

        totalAmount += subtotal;

        parsedItems.push({
          product: prod,
          product_id: prod.id,
          quantity: qty,
          buying_price: prod.buying_price,
          selling_price: sellingPrice,
          subtotal,
          profit,
          fulfillment_source: item.fulfillment_source || 'Store'
        });
      }

      const paid = paid_amount !== undefined ? Math.min(totalAmount, Math.max(0, Number(paid_amount))) : totalAmount;
      const debt = Math.max(0, totalAmount - paid);
      const paymentStatus = debt === 0 ? 'paid' : (paid > 0 ? 'partial' : 'debt');
      const fulfillmentStatus = 'pending_store';
      const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
      const currentUserId = req.session?.user?.id || 1;

      // 3. Insert Order Record (with payment approver if paid on creation)
      const orderRes = await execute(
        `INSERT INTO orders (
          shop_id, stock_id, order_number, customer_id, salesperson_id,
          total_amount, paid_amount, debt_amount, payment_status, fulfillment_status,
          notes, payment_approved_by, payment_approved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          shopId,
          1,
          orderNumber,
          finalCustomerId,
          currentUserId,
          totalAmount,
          paid,
          debt,
          paymentStatus,
          fulfillmentStatus,
          notes || null,
          paid > 0 ? currentUserId : null,
          paid > 0 ? new Date().toISOString() : null
        ]
      );

      const orderId = orderRes.lastInsertId;

      // 4. ATOMIC Stock Decrement & Order Item Insertion
      for (const pi of parsedItems) {
        await execute(
          `INSERT INTO order_items (order_id, product_id, quantity, buying_price, selling_price, subtotal, profit, fulfillment_source, item_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_store')`,
          [orderId, pi.product_id, pi.quantity, pi.buying_price, pi.selling_price, pi.subtotal, pi.profit, pi.fulfillment_source]
        );

        // Strict Atomic Stock Check & Decrement
        const stockDeduction = await execute(
          `UPDATE products SET quantity = quantity - ? WHERE id = ? AND shop_id = ? AND quantity >= ?`,
          [pi.quantity, pi.product_id, shopId, pi.quantity]
        );

        if (stockDeduction.changes === 0) {
          throw new Error(
            `Insufficient stock for "${pi.product.name}". Requested ${pi.quantity} units, but insufficient available inventory.`
          );
        }

        // Record inventory movement
        await execute(
          `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
           VALUES (?, 1, ?, ?, 'Sale', ?, ?)`,
          [shopId, pi.product_id, -pi.quantity, `Sale for Order ${orderNumber}`, currentUserId]
        );
      }

      // 5. Insert Payment Record
      if (paid > 0) {
        await execute(
          `INSERT INTO payments (shop_id, order_id, amount, payment_method, reference_no, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            shopId,
            orderId,
            paid,
            payment_method || 'cash',
            payment_reference || null,
            currentUserId
          ]
        );
      }

      // 6. Update Customer Credit Balance if debt remains
      if (debt > 0 && finalCustomerId) {
        await execute(
          `UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ? AND shop_id = ?`,
          [debt, finalCustomerId, shopId]
        );
      }

      return { orderId, orderNumber, totalAmount, paid, debt };
    });

    await logApiAudit(req, 'ORDER_CREATED', `Salesperson ${req.session?.user?.name || 'Staff'} created Order #${result.orderNumber} for RWF ${result.totalAmount.toLocaleString()} (${result.paid > 0 ? 'RWF ' + result.paid.toLocaleString() + ' paid' : 'Unpaid'})`);

    const createdOrder = await queryOne(`
      SELECT o.*, c.name as customer_name, c.phone as customer_phone, u.name as salesperson_name,
             stk.name as stock_name, sh.name as shop_name, sh.tin_number, sh.receipt_footer_text, sh.phone as shop_phone
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON o.salesperson_id = u.id
      LEFT JOIN stocks stk ON o.stock_id = stk.id
      LEFT JOIN shops sh ON o.shop_id = sh.id
      WHERE o.id = ? AND o.shop_id = ?
    `, [result.orderId, shopId]);

    const createdItems = await queryAll(`
      SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit as product_unit
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [result.orderId]);

    if (createdOrder) {
      createdOrder.items = createdItems;
    }

    res.json({ success: true, order: createdOrder });
  } catch (err: any) {
    console.error('Order creation error:', err);
    res.status(400).json({ error: err.message || 'Failed to place order' });
  }
});

// Record Payment on Existing Order
router.post('/orders/:id/payments', requireAuth, requireTenant, requirePermission('can_process_payments'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);
  const { amount, payment_method, reference_no } = req.body;
  const currentUserId = req.session?.user?.id || 1;
  const currentUserName = req.session?.user?.name || 'Cashier';

  const payAmt = Number(amount);
  if (isNaN(payAmt) || payAmt <= 0) {
    return res.status(400).json({ error: 'Valid payment amount greater than 0 is required' });
  }

  try {
    const order = await queryOne('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found in this store' });
    }

    await withTransaction(async () => {
      await execute(
        `INSERT INTO payments (shop_id, order_id, amount, payment_method, reference_no, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          shopId,
          orderId,
          payAmt,
          payment_method || 'cash',
          reference_no || null,
          currentUserId
        ]
      );

      const newPaid = Number(order.paid_amount) + payAmt;
      const newDebt = Math.max(0, Number(order.total_amount) - newPaid);
      const newPaymentStatus = newDebt === 0 ? 'paid' : 'partial';

      await execute(
        `UPDATE orders 
         SET paid_amount = ?, debt_amount = ?, payment_status = ?, payment_approved_by = ?, payment_approved_at = CURRENT_TIMESTAMP 
         WHERE id = ? AND shop_id = ?`,
        [newPaid, newDebt, newPaymentStatus, currentUserId, orderId, shopId]
      );

      if (order.customer_id) {
        await execute(
          `UPDATE customers SET credit_balance = MAX(0, credit_balance - ?) WHERE id = ? AND shop_id = ?`,
          [payAmt, order.customer_id, shopId]
        );
      }
    });

    await logApiAudit(req, 'PAYMENT_CONFIRMED', `Payment of RWF ${payAmt.toLocaleString()} (${payment_method || 'cash'}) confirmed by ${currentUserName} for Order #${order.order_number || orderId}`);

    const updatedOrder = await queryOne('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    res.json({ success: true, order: updatedOrder });
  } catch (err: any) {
    console.error('Record payment error:', err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// Update Fulfillment Status (Dispatch / Release / Reject)
router.post('/orders/:id/status', requireAuth, requireTenant, requirePermission('can_release_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);
  const { fulfillment_status, reason } = req.body;
  const currentUserId = req.session?.user?.id || 1;
  const currentUserName = req.session?.user?.name || 'Storekeeper';

  try {
    const order = await queryOne('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    if (!order) {
      return res.status(404).json({ error: 'Order not found in this store' });
    }

    const isReleasing = fulfillment_status === 'approved' || fulfillment_status === 'dispatched' || fulfillment_status === 'completed';

    if (isReleasing) {
      await execute(
        `UPDATE orders SET fulfillment_status = ?, stock_released_by = ?, stock_released_at = CURRENT_TIMESTAMP WHERE id = ? AND shop_id = ?`,
        [fulfillment_status, currentUserId, orderId, shopId]
      );
    } else {
      await execute(
        `UPDATE orders SET fulfillment_status = ? WHERE id = ? AND shop_id = ?`,
        [fulfillment_status, orderId, shopId]
      );
    }

    let itemStatus = 'pending_store';
    if (isReleasing) {
      itemStatus = 'approved';
    }
    if (fulfillment_status === 'rejected') itemStatus = 'rejected';

    await execute(
      `UPDATE order_items SET item_status = ?, rejection_reason = ? WHERE order_id = ?`,
      [itemStatus, reason || null, orderId]
    );

    if (isReleasing) {
      await logApiAudit(req, 'STOCK_RELEASED', `Physical stock for Order #${order.order_number || orderId} released & dispatched from warehouse by ${currentUserName} (Status: ${fulfillment_status})`);
    } else if (fulfillment_status === 'rejected') {
      await logApiAudit(req, 'STOCK_REJECTED', `Order #${order.order_number || orderId} items rejected at warehouse by ${currentUserName}. Reason: ${reason || 'Out of stock'}`);
    } else {
      await logApiAudit(req, 'ORDER_STATUS_CHANGED', `Changed Order #${order.order_number || orderId} fulfillment status to ${fulfillment_status} by ${currentUserName}`);
    }

    const updated = await queryOne('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    res.json({ success: true, order: updated });
  } catch (err: any) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Selective Stock Release per Item (Storekeeper ticks released products and auto-updates receipt)
router.post('/orders/:id/release-items', requireAuth, requireTenant, requirePermission('can_release_stock'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const orderId = Number(req.params.id);
  const { released_items, update_receipt = true, fulfillment_status, notes } = req.body;
  const currentUserId = req.session?.user?.id || 1;
  const currentUserName = req.session?.user?.name || 'Storekeeper';

  if (!orderId || isNaN(orderId)) {
    return res.status(400).json({ error: 'Valid order ID is required.' });
  }

  if (!released_items || !Array.isArray(released_items)) {
    return res.status(400).json({ error: 'released_items array is required.' });
  }

  try {
    const updated = await withTransaction(async () => {
      // 1. Fetch order
      const order = await queryOne('SELECT * FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
      if (!order) {
        throw new Error('Order not found in this store.');
      }

      // 2. Fetch existing items
      const existingItems = await queryAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
      if (existingItems.length === 0) {
        throw new Error('Order has no items.');
      }

      // Determine stock location
      let stockId = order.stock_id;
      if (!stockId) {
        const defaultStock = await queryOne<{ id: number }>('SELECT id FROM stocks WHERE shop_id = ? ORDER BY is_main DESC, id ASC LIMIT 1', [shopId]);
        stockId = defaultStock ? defaultStock.id : 1;
      }

      // Build released map: order_item_id -> quantity_released
      const releaseMap = new Map<number, number>();
      for (const r of released_items) {
        const id = Number(r.order_item_id || r.id);
        const qty = Math.max(0, Number(r.quantity_released !== undefined ? r.quantity_released : r.quantity));
        if (id) releaseMap.set(id, qty);
      }

      let newTotalAmount = 0;
      let releasedCount = 0;
      let totalUnreleasedReturned = 0;

      for (const item of existingItems) {
        const targetQty = releaseMap.has(item.id) ? releaseMap.get(item.id)! : 0;
        const requestedQty = Number(item.quantity);
        const sellingPrice = Number(item.selling_price);
        const buyingPrice = Number(item.buying_price);

        if (targetQty > 0) {
          releasedCount++;
          const releasedQty = Math.min(requestedQty, targetQty);
          const subtotal = sellingPrice * releasedQty;
          const profit = (sellingPrice - buyingPrice) * releasedQty;
          newTotalAmount += subtotal;

          // If partial release, return the unreleased difference to stock
          const diff = requestedQty - releasedQty;
          if (diff > 0) {
            await execute(
              'UPDATE products SET quantity = quantity + ? WHERE id = ? AND shop_id = ?',
              [diff, item.product_id, shopId]
            );
            await execute(
              `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
               VALUES (?, ?, ?, ?, 'Adjustment', ?, ?)`,
              [shopId, stockId, item.product_id, diff, `Unreleased item return for Order #${order.order_number}`, currentUserId]
            );
            totalUnreleasedReturned += diff;
          }

          if (update_receipt) {
            await execute(
              `UPDATE order_items 
               SET quantity = ?, subtotal = ?, profit = ?, item_status = 'approved', fulfillment_source = 'Store'
               WHERE id = ?`,
              [releasedQty, subtotal, profit, item.id]
            );
          } else {
            await execute(
              `UPDATE order_items SET item_status = 'approved', fulfillment_source = 'Store' WHERE id = ?`,
              [item.id]
            );
          }
        } else {
          // Item was NOT released (unchecked by storekeeper)
          // Return the full quantity to product inventory
          await execute(
            'UPDATE products SET quantity = quantity + ? WHERE id = ? AND shop_id = ?',
            [requestedQty, item.product_id, shopId]
          );
          await execute(
            `INSERT INTO inventory_movements (shop_id, stock_id, product_id, quantity, movement_type, reference, performed_by)
             VALUES (?, ?, ?, ?, 'Adjustment', ?, ?)`,
            [shopId, stockId, item.product_id, requestedQty, `Unreleased stock return for Order #${order.order_number} (Item removed)`, currentUserId]
          );
          totalUnreleasedReturned += requestedQty;

          if (update_receipt) {
            // Remove from order items so the receipt only shows what was physically released
            await execute('DELETE FROM order_items WHERE id = ?', [item.id]);
          } else {
            await execute(
              `UPDATE order_items SET item_status = 'rejected', rejection_reason = 'Not released / out of stock at warehouse' WHERE id = ?`,
              [item.id]
            );
          }
        }
      }

      // If at least one item released:
      const finalStatus = fulfillment_status || (releasedCount === existingItems.length ? 'dispatched' : 'approved');

      if (update_receipt && releasedCount > 0) {
        // Recalculate financial balance
        const oldDebt = Number(order.debt_amount || 0);

        // Adjust paid amount (cannot exceed new total)
        const newPaid = Math.min(newTotalAmount, Number(order.paid_amount || 0));
        const newDebt = Math.max(0, newTotalAmount - newPaid);
        const newPaymentStatus = newDebt === 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'debt');

        // Adjust customer debt ledger difference
        const debtDiff = newDebt - oldDebt;
        if (debtDiff !== 0 && order.customer_id) {
          await execute(
            'UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ? AND shop_id = ?',
            [debtDiff, order.customer_id, shopId]
          );
        }

        const noteAppend = notes 
          ? (order.notes ? `${order.notes} | ${notes}` : notes) 
          : (totalUnreleasedReturned > 0 ? `${order.notes || ''} [Warehouse: ${releasedCount} of ${existingItems.length} items released]`.trim() : order.notes);

        await execute(
          `UPDATE orders 
           SET total_amount = ?, paid_amount = ?, debt_amount = ?, payment_status = ?,
               fulfillment_status = ?, stock_released_by = ?, stock_released_at = CURRENT_TIMESTAMP, notes = ?
           WHERE id = ? AND shop_id = ?`,
          [newTotalAmount, newPaid, newDebt, newPaymentStatus, finalStatus, currentUserId, noteAppend, orderId, shopId]
        );
      } else {
        await execute(
          `UPDATE orders 
           SET fulfillment_status = ?, stock_released_by = ?, stock_released_at = CURRENT_TIMESTAMP
           WHERE id = ? AND shop_id = ?`,
          [finalStatus, currentUserId, orderId, shopId]
        );
      }

      // Fetch full updated order
      const fullOrder = await queryOne(`
        SELECT o.*, c.name as customer_name, c.phone as customer_phone, u.name as salesperson_name,
               stk.name as stock_name, sh.name as shop_name, sh.tin_number, sh.receipt_footer_text, sh.phone as shop_phone
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN users u ON o.salesperson_id = u.id
        LEFT JOIN stocks stk ON o.stock_id = stk.id
        LEFT JOIN shops sh ON o.shop_id = sh.id
        WHERE o.id = ? AND o.shop_id = ?
      `, [orderId, shopId]);

      const fullItems = await queryAll(`
        SELECT oi.*, p.name as product_name, p.sku as product_sku, p.unit as product_unit
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
      `, [orderId]);

      if (fullOrder) {
        fullOrder.items = fullItems;
      }
      return fullOrder;
    });

    await logApiAudit(req, 'STOCK_RELEASED', `Storekeeper ${currentUserName} released items for Order #${updated.order_number} (Status: ${updated.fulfillment_status})`);

    res.json({
      success: true,
      order: updated,
      message: `Stock successfully released for Order #${updated.order_number}. Receipt updated.`
    });
  } catch (err: any) {
    console.error('Release items error:', err);
    res.status(500).json({ error: 'Failed to release items: ' + (err.message || 'Unknown database error') });
  }
});

// ============================================================================
// 6. CUSTOMERS & CREDIT LEDGER (RECEIVABLES TRACKING)
// ============================================================================

router.get('/customers', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const search = (req.query.q as string || '').trim().toLowerCase();

  try {
    let sql = `
      SELECT c.*, 
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.shop_id = c.shop_id) as order_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders o WHERE o.customer_id = c.id AND o.shop_id = c.shop_id) as total_spent
      FROM customers c
      WHERE c.shop_id = ?
    `;
    const params: any[] = [shopId];

    if (search) {
      sql += ` AND (LOWER(c.name) LIKE ? OR LOWER(c.phone) LIKE ? OR LOWER(c.email) LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY c.credit_balance DESC, c.name ASC`;
    const customers = await queryAll(sql, params);

    res.json({ customers });
  } catch (err: any) {
    console.error('Customers API error:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Create Customer
router.post('/customers', requireAuth, requireTenant, requirePermission('can_manage_customers'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const { name, phone, email, address, id_number } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Customer name is required' });
  }

  try {
    const result = await execute(
      `INSERT INTO customers (shop_id, name, phone, email, address, id_number, credit_balance)
       VALUES (?, ?, ?, ?, ?, ?, 0.0)`,
      [
        shopId,
        name.trim(),
        phone ? phone.trim() : '',
        email ? email.trim() : null,
        address ? address.trim() : null,
        id_number ? id_number.trim() : null
      ]
    );

    await logApiAudit(req, 'CUSTOMER_CREATED', `Added customer ${name}`);
    const created = await queryOne('SELECT * FROM customers WHERE id = ? AND shop_id = ?', [result.lastInsertId, shopId]);
    res.json({ success: true, customer: created });
  } catch (err: any) {
    console.error('Create customer error:', err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Update Customer
router.put('/customers/:id', requireAuth, requireTenant, requirePermission('can_manage_customers'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const customerId = Number(req.params.id);
  const { name, phone, email, address, id_number } = req.body;

  try {
    const existing = await queryOne('SELECT * FROM customers WHERE id = ? AND shop_id = ?', [customerId, shopId]);
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found in this store' });
    }

    await execute(
      `UPDATE customers SET name = ?, phone = ?, email = ?, address = ?, id_number = ? WHERE id = ? AND shop_id = ?`,
      [
        name || existing.name,
        phone !== undefined ? phone : existing.phone,
        email !== undefined ? email : existing.email,
        address !== undefined ? address : existing.address,
        id_number !== undefined ? id_number : existing.id_number,
        customerId,
        shopId
      ]
    );

    const updated = await queryOne('SELECT * FROM customers WHERE id = ? AND shop_id = ?', [customerId, shopId]);
    res.json({ success: true, customer: updated });
  } catch (err: any) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// ============================================================================
// 7. PARTNERS & PEER STORE BORROWING
// ============================================================================

router.get('/partners', requireAuth, requireTenant, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  try {
    const partners = await queryAll(
      `SELECT * FROM partner_shops WHERE shop_id = ? ORDER BY name ASC`,
      [shopId]
    );
    res.json({ partners });
  } catch (err: any) {
    console.error('Partners API error:', err);
    res.status(500).json({ error: 'Failed to fetch partner hardware stores' });
  }
});

router.post('/partners', requireAuth, requireTenant, requirePermission('can_manage_partners'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const { name, contact_person, phone, address } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Partner shop name is required' });
  }

  try {
    const result = await execute(
      `INSERT INTO partner_shops (shop_id, name, contact_person, phone, address, current_balance)
       VALUES (?, ?, ?, ?, ?, 0.0)`,
      [
        shopId,
        name.trim(),
        contact_person ? contact_person.trim() : null,
        phone ? phone.trim() : null,
        address ? address.trim() : null
      ]
    );

    await logApiAudit(req, 'PARTNER_CREATED', `Added partner store ${name}`);
    const created = await queryOne('SELECT * FROM partner_shops WHERE id = ? AND shop_id = ?', [result.lastInsertId, shopId]);
    res.json({ success: true, partner: created });
  } catch (err: any) {
    console.error('Create partner error:', err);
    res.status(500).json({ error: 'Failed to create partner hardware store' });
  }
});

// ============================================================================
// 8. USERS & ACCESS CONTROL (RBAC & PRIVILEGE ENFORCEMENT)
// ============================================================================

router.get('/users', requireAuth, requireTenant, requireManager, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const isSuper = req.session?.user?.role === 'superadmin';

  try {
    const sql = isSuper
      ? `SELECT u.id, u.shop_id, u.stock_id, u.name, u.email, u.role, u.job_title, u.phone, u.is_active, u.activation_status,
                u.can_create_orders, u.can_process_payments, u.can_release_stock, u.can_manage_stock, u.can_import_export_stock,
                u.can_partner_borrow, u.can_view_reports, u.can_view_buying_prices, u.can_give_discounts, u.can_manage_users,
                u.can_print_full_receipt, u.can_print_delivery_note, u.can_manage_customers, u.can_manage_partners, u.can_void_orders,
                u.can_edit_company_settings, u.can_view_audit_trail, u.can_reset_passwords, u.can_view_all_tenants, u.can_manage_subscriptions,
                u.force_password_change, s.name as shop_name 
         FROM users u LEFT JOIN shops s ON u.shop_id = s.id ORDER BY u.role DESC, u.name ASC`
      : `SELECT id, shop_id, stock_id, name, email, role, job_title, phone, is_active, activation_status,
                can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock,
                can_partner_borrow, can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users,
                can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders,
                can_edit_company_settings, can_view_audit_trail, can_reset_passwords, can_view_all_tenants, can_manage_subscriptions,
                force_password_change
         FROM users WHERE shop_id = ? ORDER BY role DESC, name ASC`;
    const params = isSuper ? [] : [shopId];

    const users = await queryAll(sql, params);
    res.json({ users });
  } catch (err: any) {
    console.error('Users API error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create Staff User (Store Manager can only create staff within their store; SuperAdmin can create across all)
router.post('/users', requireAuth, requireTenant, requireManager, async (req: Request, res: Response) => {
  const currentUser = req.session.user;
  const { name, email, password, role, job_title, phone, permissions, shop_id } = req.body;
  const targetShopId = currentUser.role === 'superadmin' && shop_id ? Number(shop_id) : res.locals.shopId;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and initial password are required' });
  }

  // Privilege escalation check: Only SuperAdmin can create superadmin or platform_ops accounts
  const assignedRole = (role || 'salesperson').toLowerCase();
  if ((assignedRole === 'superadmin' || assignedRole === 'platform_ops') && currentUser.role !== 'superadmin') {
    return res.status(403).json({ error: 'Privilege escalation blocked: Only the Platform SuperAdmin can create superadmin or VectOS administration accounts.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const p = { ...req.body, ...(permissions || {}) };

    const result = await execute(
      `INSERT INTO users (
        shop_id, stock_id, name, email, password, role, job_title, phone, is_active, activation_status,
        can_create_orders, can_process_payments, can_release_stock, can_manage_stock, can_import_export_stock,
        can_partner_borrow, can_view_reports, can_view_buying_prices, can_give_discounts, can_manage_users,
        can_print_full_receipt, can_print_delivery_note, can_manage_customers, can_manage_partners, can_void_orders,
        can_edit_company_settings, can_view_audit_trail, can_reset_passwords, can_view_all_tenants, can_manage_subscriptions,
        force_password_change
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        targetShopId,
        name.trim(),
        email.trim().toLowerCase(),
        hashedPassword,
        assignedRole,
        job_title || (assignedRole === 'platform_ops' ? 'Platform Operations Officer' : 'Store Staff'),
        phone || null,
        p.can_create_orders !== undefined ? (p.can_create_orders ? 1 : 0) : 1,
        p.can_process_payments ? 1 : 0,
        p.can_release_stock ? 1 : 0,
        p.can_manage_stock ? 1 : 0,
        p.can_import_export_stock ? 1 : 0,
        p.can_partner_borrow ? 1 : 0,
        p.can_view_reports ? 1 : 0,
        p.can_view_buying_prices ? 1 : 0,
        p.can_give_discounts ? 1 : 0,
        p.can_manage_users ? 1 : 0,
        p.can_print_full_receipt !== undefined ? (p.can_print_full_receipt ? 1 : 0) : 1,
        p.can_print_delivery_note !== undefined ? (p.can_print_delivery_note ? 1 : 0) : 1,
        p.can_manage_customers !== undefined ? (p.can_manage_customers ? 1 : 0) : 1,
        p.can_manage_partners ? 1 : 0,
        p.can_void_orders ? 1 : 0,
        p.can_edit_company_settings ? 1 : 0,
        p.can_view_audit_trail ? 1 : 0,
        p.can_reset_passwords ? 1 : 0,
        p.can_view_all_tenants !== undefined ? (p.can_view_all_tenants ? 1 : 0) : (assignedRole === 'platform_ops' ? 1 : 0),
        p.can_manage_subscriptions ? 1 : 0
      ]
    );

    await logApiAudit(req, 'USER_CREATED', `Created staff user ${name} (${email}) with role ${assignedRole}`);
    const created = await queryOne('SELECT id, name, email, role, job_title FROM users WHERE id = ?', [result.lastInsertId]);
    res.json({ success: true, user: created });
  } catch (err: any) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user. Ensure email is unique.' });
  }
});

// Update User (Edit Roles / Permissions / Status)
router.put('/users/:id', requireAuth, requireTenant, requireManager, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const targetUserId = Number(req.params.id);
  const currentUser = req.session.user;
  const { name, phone, role, job_title, is_active, permissions, password, force_password_change } = req.body;

  try {
    const existing = await queryOne('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!existing || (currentUser.role !== 'superadmin' && currentUser.role !== 'platform_ops' && existing.shop_id !== shopId)) {
      return res.status(404).json({ error: 'User account not found in this store' });
    }

    // Do not allow non-superadmins to modify or demote the platform SuperAdmin account
    if (existing.role === 'superadmin' && currentUser.role !== 'superadmin') {
      return res.status(403).json({ error: 'Cannot modify the platform SuperAdmin account.' });
    }

    // Privilege escalation check
    if ((role === 'superadmin' || role === 'platform_ops') && currentUser.role !== 'superadmin') {
      return res.status(403).json({ error: 'Privilege escalation blocked: Only SuperAdmin can assign administration roles.' });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (role && (currentUser.role === 'superadmin' || role !== 'superadmin')) { 
      updates.push('role = ?'); params.push(role); 
    }
    if (job_title !== undefined) { updates.push('job_title = ?'); params.push(job_title); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (force_password_change !== undefined) { updates.push('force_password_change = ?'); params.push(force_password_change ? 1 : 0); }
    if (password && password.trim().length >= 6) {
      const hash = await bcrypt.hash(password.trim(), 10);
      updates.push('password = ?');
      params.push(hash);
    }

    const p = { ...req.body, ...(permissions || {}) };
    const permKeys = [
      'can_create_orders', 'can_process_payments', 'can_release_stock', 'can_manage_stock',
      'can_import_export_stock', 'can_partner_borrow', 'can_view_reports', 'can_view_buying_prices',
      'can_give_discounts', 'can_manage_users', 'can_print_full_receipt', 'can_print_delivery_note',
      'can_manage_customers', 'can_manage_partners', 'can_void_orders', 'can_edit_company_settings',
      'can_view_audit_trail', 'can_reset_passwords', 'can_view_all_tenants', 'can_manage_subscriptions'
    ];
    for (const pk of permKeys) {
      if (p[pk] !== undefined) {
        updates.push(`${pk} = ?`);
        params.push(p[pk] ? 1 : 0);
      }
    }

    if (updates.length > 0) {
      let sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      params.push(targetUserId);
      await execute(sql, params);
    }

    await logApiAudit(req, 'USER_UPDATED', `Updated staff user #${targetUserId} (${name || existing.name})`);
    const updated = await queryOne('SELECT id, name, email, role, job_title, is_active FROM users WHERE id = ?', [targetUserId]);
    res.json({ success: true, user: updated });
  } catch (err: any) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Admin / Manager Reset Password for an Employee
router.post('/users/:id/reset-password', requireAuth, requireTenant, requirePermission('can_reset_passwords'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const targetUserId = Number(req.params.id);
  const currentUser = req.session.user;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.trim().length < 6) {
    return res.status(400).json({ error: 'New temporary password must be at least 6 characters long.' });
  }

  try {
    const targetUser = await queryOne('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!targetUser || (currentUser.role !== 'superadmin' && targetUser.shop_id !== shopId)) {
      return res.status(404).json({ error: 'Target user account not found.' });
    }

    const hashed = await bcrypt.hash(newPassword.trim(), 10);
    await execute('UPDATE users SET password = ?, force_password_change = 1 WHERE id = ?', [hashed, targetUserId]);

    await logApiAudit(req, 'PASSWORD_RESET', `Administrator ${currentUser.name} reset password for user #${targetUserId} (${targetUser.email}) with required first-login change.`, targetUser.shop_id || 1);

    res.json({
      success: true,
      message: `Password for ${targetUser.name} has been reset. They will be required to change it on their next login.`
    });
  } catch (err: any) {
    console.error('Admin reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// ============================================================================
// 9. SHOPS & SUPERADMIN PLATFORM PORTAL
// ============================================================================

// List stores
router.get('/shops', requireAuth, async (req: Request, res: Response) => {
  const user = req.session.user;

  try {
    if (user.role === 'superadmin') {
      const shops = await queryAll(`
        SELECT s.*, 
          (SELECT COUNT(*) FROM users u WHERE u.shop_id = s.id) as user_count,
          (SELECT COUNT(*) FROM stocks st WHERE st.shop_id = s.id) as stock_count,
          (SELECT COUNT(*) FROM products p WHERE p.shop_id = s.id) as product_count,
          (SELECT COALESCE(SUM(total_amount), 0) FROM orders o WHERE o.shop_id = s.id) as total_revenue
        FROM shops s ORDER BY s.id ASC
      `);
      return res.json({ shops });
    }

    // Non-superadmin managers only see their own store
    if (user.shop_id) {
      const shop = await queryOne('SELECT * FROM shops WHERE id = ?', [user.shop_id]);
      return res.json({ shops: shop ? [shop] : [] });
    }

    return res.status(403).json({ error: 'SuperAdmin access required' });
  } catch (err: any) {
    console.error('Shops API error:', err);
    res.status(500).json({ error: 'Failed to fetch shops' });
  }
});

// Register New Store Tenant (SuperAdmin Only)
router.post('/shops', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const { name, code, owner_name, phone, email, location, tin_number, subscription_plan } = req.body;

  if (!name || !owner_name || !email) {
    return res.status(400).json({ error: 'Store name, owner name, and email are required' });
  }

  try {
    const finalCode = code || name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);

    const result = await execute(
      `INSERT INTO shops (name, code, owner_name, phone, email, location, tin_number, status, subscription_plan)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        name.trim(),
        finalCode,
        owner_name.trim(),
        phone ? phone.trim() : '+250 788 000 000',
        email.trim().toLowerCase(),
        location ? location.trim() : 'Kigali, Rwanda',
        tin_number ? tin_number.trim() : null,
        subscription_plan || 'Standard Depot (RWF 45,000/mo)'
      ]
    );

    const shopId = result.lastInsertId;

    // Create default Main Warehouse for this shop
    await execute(
      `INSERT INTO stocks (shop_id, name, code, location, manager_name, phone, is_main, status)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'active')`,
      [
        shopId,
        `${name} Main Depot`,
        `WH-${finalCode.toUpperCase()}-01`,
        location || 'Kigali',
        owner_name,
        phone
      ]
    );

    await logApiAudit(req, 'SHOP_REGISTERED', `Created new store tenant ${name} (#${shopId})`, shopId);
    const created = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    res.json({ success: true, shop: created });
  } catch (err: any) {
    console.error('Create shop error:', err);
    res.status(500).json({ error: 'Failed to register shop. Ensure store code and email are unique.' });
  }
});

// Update Shop Settings (SuperAdmin or Store Manager for their own store)
router.put('/shops/:id', requireAuth, requireManager, async (req: Request, res: Response) => {
  const shopId = Number(req.params.id);
  const user = req.session.user;

  if (user.role !== 'superadmin' && user.shop_id !== shopId) {
    return res.status(403).json({ error: 'Permission denied: Cannot edit settings for another store.' });
  }

  const { name, owner_name, phone, email, location, tin_number, receipt_footer_text, status, subscription_plan } = req.body;

  try {
    const existing = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    if (!existing) {
      return res.status(404).json({ error: 'Shop tenant not found' });
    }

    // Only SuperAdmin can change subscription status or plan
    const newStatus = user.role === 'superadmin' && status ? status : existing.status;
    const newPlan = user.role === 'superadmin' && subscription_plan ? subscription_plan : existing.subscription_plan;

    await execute(
      `UPDATE shops 
       SET name = ?, owner_name = ?, phone = ?, email = ?, location = ?, tin_number = ?, receipt_footer_text = ?, status = ?, subscription_plan = ?
       WHERE id = ?`,
      [
        name || existing.name,
        owner_name || existing.owner_name,
        phone || existing.phone,
        email || existing.email,
        location || existing.location,
        tin_number !== undefined ? tin_number : existing.tin_number,
        receipt_footer_text !== undefined ? receipt_footer_text : existing.receipt_footer_text,
        newStatus,
        newPlan,
        shopId
      ]
    );

    if (newStatus === 'active' && existing.status === 'pending') {
      await execute("UPDATE users SET activation_status = 'active', is_active = 1 WHERE shop_id = ? AND activation_status = 'pending_approval'", [shopId]);
    } else if (newStatus === 'suspended') {
      await execute("UPDATE users SET activation_status = 'suspended' WHERE shop_id = ? AND role != 'superadmin'", [shopId]);
    }

    await logApiAudit(req, 'SHOP_SETTINGS_UPDATED', `Updated store settings for #${shopId}`, shopId);
    const updated = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    res.json({ success: true, shop: updated });
  } catch (err: any) {
    console.error('Update shop error:', err);
    res.status(500).json({ error: 'Failed to update store settings' });
  }
});

// Admin Settings: Get Platform Onboarding Mode & Pending Counters (SuperAdmin Only)
router.get('/admin/settings', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const pendingShops = await queryAll("SELECT id FROM shops WHERE status = 'pending'");
    const pendingUsers = await queryAll("SELECT id FROM users WHERE activation_status = 'pending_approval'");
    res.json({
      autoApproveNewStores,
      pendingShopsCount: pendingShops.length,
      pendingUsersCount: pendingUsers.length
    });
  } catch (err: any) {
    console.error('Admin settings get error:', err);
    res.status(500).json({ error: 'Failed to retrieve admin settings' });
  }
});

// Admin Settings: Toggle Auto-Approve Onboarding Mode (SuperAdmin Only)
router.post('/admin/settings', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { autoApproveNewStores: autoApprove } = req.body;
    if (typeof autoApprove === 'boolean') {
      autoApproveNewStores = autoApprove;
    }
    await logApiAudit(req, 'ADMIN_SETTINGS_CHANGED', `Platform SuperAdmin set autoApproveNewStores to ${autoApproveNewStores}`);
    res.json({ success: true, autoApproveNewStores });
  } catch (err: any) {
    console.error('Admin settings post error:', err);
    res.status(500).json({ error: 'Failed to update admin settings' });
  }
});

// Admin Approvals: List all pending store registrations and pending user accounts (SuperAdmin Only)
router.get('/admin/pending', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const pendingShops = await queryAll("SELECT * FROM shops WHERE status = 'pending' ORDER BY created_at DESC");
    const pendingUsers = await queryAll(`
      SELECT u.*, s.name as shop_name 
      FROM users u 
      LEFT JOIN shops s ON u.shop_id = s.id 
      WHERE u.activation_status = 'pending_approval' 
      ORDER BY u.created_at DESC
    `);
    res.json({ pendingShops, pendingUsers });
  } catch (err: any) {
    console.error('Admin pending get error:', err);
    res.status(500).json({ error: 'Failed to fetch pending items' });
  }
});

// Admin Action: Explicit Store Status Change (Accept / Suspend / Pending) (SuperAdmin Only)
router.put('/admin/shops/:id/status', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const shopId = Number(req.params.id);
  const { status } = req.body;

  if (!['active', 'pending', 'suspended'].includes(status)) {
    return res.status(400).json({ error: "Status must be 'active', 'pending', or 'suspended'" });
  }

  try {
    const existing = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    if (!existing) {
      return res.status(404).json({ error: 'Shop tenant not found' });
    }

    await execute('UPDATE shops SET status = ? WHERE id = ?', [status, shopId]);

    // Cascading effect: When a store is approved/activated, also activate the owner and pending staff
    if (status === 'active') {
      await execute(
        "UPDATE users SET activation_status = 'active', is_active = 1 WHERE shop_id = ? AND activation_status = 'pending_approval'", 
        [shopId]
      );
    } else if (status === 'suspended') {
      await execute(
        "UPDATE users SET activation_status = 'suspended' WHERE shop_id = ? AND role != 'superadmin'", 
        [shopId]
      );
    }

    await logApiAudit(req, 'STORE_STATUS_UPDATED', `SuperAdmin set shop #${shopId} (${existing.name}) status to ${status}`, shopId);
    const updated = await queryOne('SELECT * FROM shops WHERE id = ?', [shopId]);
    res.json({ success: true, shop: updated });
  } catch (err: any) {
    console.error('Admin shop status error:', err);
    res.status(500).json({ error: 'Failed to update store status' });
  }
});

// Admin Action: Explicit User Account Status Change (Accept / Suspend) (SuperAdmin Only)
router.put('/admin/users/:id/status', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const targetUserId = Number(req.params.id);
  const { activation_status } = req.body;

  if (!['active', 'pending_approval', 'suspended'].includes(activation_status)) {
    return res.status(400).json({ error: "activation_status must be 'active', 'pending_approval', or 'suspended'" });
  }

  try {
    const existing = await queryOne('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!existing) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const isActive = activation_status === 'active' ? 1 : 0;
    await execute('UPDATE users SET activation_status = ?, is_active = ? WHERE id = ?', [activation_status, isActive, targetUserId]);

    await logApiAudit(req, 'USER_STATUS_UPDATED', `SuperAdmin set user #${targetUserId} (${existing.email}) status to ${activation_status}`, existing.shop_id || 1);
    const updated = await queryOne('SELECT id, name, email, role, job_title, activation_status, is_active FROM users WHERE id = ?', [targetUserId]);
    res.json({ success: true, user: updated });
  } catch (err: any) {
    console.error('Admin user status error:', err);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Admin Action: 1-Click Approve All Pending Stores & Accounts (SuperAdmin Only)
router.post('/admin/approve-all', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const pendingShops = await queryAll("SELECT id, name FROM shops WHERE status = 'pending'");
    const pendingUsers = await queryAll("SELECT id, name FROM users WHERE activation_status = 'pending_approval'");

    await execute("UPDATE shops SET status = 'active' WHERE status = 'pending'");
    await execute("UPDATE users SET activation_status = 'active', is_active = 1 WHERE activation_status = 'pending_approval'");

    await logApiAudit(req, 'APPROVE_ALL_PENDING', `SuperAdmin approved all ${pendingShops.length} pending stores and ${pendingUsers.length} pending accounts`);

    res.json({
      success: true,
      approvedShops: pendingShops.length,
      approvedUsers: pendingUsers.length,
      message: `Successfully approved and activated ${pendingShops.length} store(s) and ${pendingUsers.length} user account(s)!`
    });
  } catch (err: any) {
    console.error('Admin approve-all error:', err);
    res.status(500).json({ error: 'Failed to approve pending stores and accounts' });
  }
});

// ============================================================================
// 10. REPORTS & AUDIT TRAIL (STRICTLY SCOPED PER TENANT)
// ============================================================================

router.get('/reports/summary', requireAuth, requireTenant, requirePermission('can_view_reports'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const period = (req.query.period as string || 'all').toLowerCase();
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  let dateFilter = '';
  const dateParams: any[] = [];

  const now = new Date();
  if (period === 'day' || period === 'today' || period === 'daily') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    dateFilter = ' AND o.created_at >= ?';
    dateParams.push(d.toISOString());
  } else if (period === 'week' || period === 'weekly') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    dateFilter = ' AND o.created_at >= ?';
    dateParams.push(d.toISOString());
  } else if (period === 'month' || period === 'monthly') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    dateFilter = ' AND o.created_at >= ?';
    dateParams.push(d.toISOString());
  } else if (startDate && endDate) {
    dateFilter = ' AND o.created_at >= ? AND o.created_at <= ?';
    dateParams.push(new Date(startDate).toISOString(), new Date(endDate).toISOString());
  } else if (startDate) {
    dateFilter = ' AND o.created_at >= ?';
    dateParams.push(new Date(startDate).toISOString());
  }

  try {
    const categorySales = await queryAll(
      `SELECT p.category, COALESCE(SUM(oi.subtotal), 0) as revenue, COALESCE(SUM(oi.profit), 0) as profit, SUM(oi.quantity) as units_sold
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE o.shop_id = ? AND o.fulfillment_status != 'cancelled' ${dateFilter}
       GROUP BY p.category ORDER BY revenue DESC`,
      [shopId, ...dateParams]
    );

    const topSellingProducts = await queryAll(
      `SELECT p.name, p.sku, p.category, SUM(oi.quantity) as total_units_sold, SUM(oi.subtotal) as total_revenue, SUM(oi.profit) as total_profit
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN orders o ON oi.order_id = o.id
       WHERE o.shop_id = ? AND o.fulfillment_status != 'cancelled' ${dateFilter}
       GROUP BY p.id, p.name, p.sku, p.category ORDER BY total_revenue DESC LIMIT 20`,
      [shopId, ...dateParams]
    );

    const salespersonPerformance = await queryAll(
      `SELECT u.name, u.email, COUNT(o.id) as total_orders, COALESCE(SUM(o.total_amount), 0) as total_sales
       FROM orders o
       JOIN users u ON o.salesperson_id = u.id
       WHERE o.shop_id = ? AND o.fulfillment_status != 'cancelled' ${dateFilter}
       GROUP BY u.id, u.name, u.email ORDER BY total_sales DESC`,
      [shopId, ...dateParams]
    );

    const financialOverview = await queryOne(
      `SELECT 
         COUNT(o.id) as total_orders,
         COALESCE(SUM(o.total_amount), 0) as total_revenue,
         COALESCE(SUM(o.paid_amount), 0) as total_paid,
         COALESCE(SUM(o.debt_amount), 0) as total_debt
       FROM orders o
       WHERE o.shop_id = ? AND o.fulfillment_status != 'cancelled' ${dateFilter}`,
      [shopId, ...dateParams]
    );

    const auditLogs = await queryAll(
      `SELECT a.*, u.name as user_name, u.role as user_role
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.shop_id = ? ORDER BY a.created_at DESC LIMIT 50`,
      [shopId]
    );

    res.json({
      period,
      financialOverview: financialOverview || { total_orders: 0, total_revenue: 0, total_paid: 0, total_debt: 0 },
      categorySales,
      topSellingProducts,
      salespersonPerformance,
      auditLogs
    });
  } catch (err: any) {
    console.error('Reports API error:', err);
    res.status(500).json({ error: 'Failed to generate store reports' });
  }
});

// Full Audit Trail with Filtering (SuperAdmin sees all or filtered by shop, Manager sees their own store)
router.get('/reports/audit', requireAuth, requireTenant, requirePermission('can_view_audit_trail'), async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const user = req.session.user;
  const action = (req.query.action as string || '').trim();
  const search = (req.query.search as string || '').trim();
  const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 100));

  try {
    let sql = `
      SELECT a.*, u.name as user_name, u.role as user_role, u.email as user_email, s.name as shop_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN shops s ON a.shop_id = s.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (user.role !== 'superadmin' || req.query.shop_id) {
      const targetShop = req.query.shop_id ? Number(req.query.shop_id) : shopId;
      sql += ` AND a.shop_id = ?`;
      params.push(targetShop);
    }

    if (action && action !== 'all') {
      sql += ` AND a.action = ?`;
      params.push(action);
    }

    if (search) {
      sql += ` AND (a.details LIKE ? OR u.name LIKE ? OR u.email LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ` ORDER BY a.created_at DESC LIMIT ?`;
    params.push(limit);

    const logs = await queryAll(sql, params);

    // Also get distinct action list for quick filtering
    const actionsQuery = user.role === 'superadmin'
      ? `SELECT DISTINCT action FROM audit_logs ORDER BY action ASC`
      : `SELECT DISTINCT action FROM audit_logs WHERE shop_id = ? ORDER BY action ASC`;
    const actionsParams = user.role === 'superadmin' ? [] : [shopId];
    const distinctActions = await queryAll(actionsQuery, actionsParams);

    res.json({
      success: true,
      logs,
      availableActions: distinctActions.map((a: any) => a.action)
    });
  } catch (err: any) {
    console.error('Audit trail API error:', err);
    res.status(500).json({ error: 'Failed to fetch audit log trail' });
  }
});

// ============================================================================
// 11. CRYPTOGRAPHIC BACKUP & RESTORE (TENANT ISOLATED)
// ============================================================================

router.get('/backup/export', requireAuth, requireTenant, requireManager, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const user = req.session!.user!;

  try {
    const targetShopId = user.role === 'superadmin' ? (shopId || null) : shopId;
    const backup = await createBackup(targetShopId);

    await logApiAudit(req, 'BACKUP_EXPORTED', `Generated signed backup snapshot for shop #${targetShopId || 'ALL'}`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="vectos-backup-shop-${targetShopId || 'full'}-${Date.now()}.json"`);
    res.json(backup);
  } catch (err: any) {
    console.error('Backup export error:', err);
    res.status(500).json({ error: 'Failed to generate store backup: ' + err.message });
  }
});

router.post('/backup/restore', requireAuth, requireTenant, requireManager, async (req: Request, res: Response) => {
  const shopId = res.locals.shopId;
  const user = req.session!.user!;
  const manifest = req.body as BackupManifest;

  if (!manifest || !manifest.metadata || !manifest.data) {
    return res.status(400).json({ error: 'Invalid backup structure. Missing metadata or data payload.' });
  }

  // Cross-tenant guard: Non-superadmins cannot restore data targeting a different shop
  if (user.role !== 'superadmin' && manifest.metadata.shop_id !== shopId) {
    return res.status(403).json({ error: 'Cross-tenant restore forbidden. Manifest belongs to a different store.' });
  }

  try {
    const result = await restoreBackup(manifest);
    await logApiAudit(req, 'BACKUP_RESTORED', `Restored data snapshot for shop #${shopId}`);
    res.json({ success: true, stats: result.stats });
  } catch (err: any) {
    console.error('Backup restore error:', err);
    res.status(400).json({ error: 'Restoration failed: ' + err.message });
  }
});

// ============================================================================
// 12. VECTOS AI HELP ASSISTANT (CUSTOMER CARE & KNOWLEDGE ENGINE)
// ============================================================================

router.post('/ai/help', async (req: Request, res: Response) => {
  const { question, history } = req.body;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Question is required' });
  }

  const cleanQuestion = question.trim().slice(0, 800);
  const geminiApiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();

  // Try live Gemini 3.8 Flash model if API key is present
  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const chatContents: any[] = [];
      if (Array.isArray(history)) {
        for (const h of history.slice(-6)) {
          if (h && (h.role === 'user' || h.role === 'model')) {
            chatContents.push({ role: h.role, parts: [{ text: String(h.text || '') }] });
          }
        }
      }
      chatContents.push({ role: 'user', parts: [{ text: cleanQuestion }] });

      const aiRes = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: chatContents,
        config: {
          systemInstruction: VECTOS_SYSTEM_INSTRUCTION,
        }
      });

      if (aiRes.text && aiRes.text.trim().length > 15) {
        return res.json({ success: true, reply: aiRes.text.trim() });
      }
    } catch (err: any) {
      console.warn('Gemini 3.8 Flash live call note (falling back to built-in Customer Care Knowledge Engine):', err?.message || err);
    }
  }

  // Built-in Encyclopedic Customer Care Knowledge Engine
  // Delivers instant, comprehensive, empathetic, customer-oriented answers even if Gemini API key is absent or offline
  const reply = getVectOSKnowledgeResponse(cleanQuestion, history);
  return res.json({ success: true, reply });
});

export default router;
