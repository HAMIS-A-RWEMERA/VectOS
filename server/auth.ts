import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { queryOne } from './database/db';

export function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16) {
    return process.env.SESSION_SECRET.trim();
  }
  const dbUrl = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
  if (dbUrl) {
    return crypto.createHash('sha256').update(dbUrl + '_vectos_stateless_secret_salt').digest('hex');
  }
  return 'vectos-production-session-fallback-secret-32ch';
}

export function createAuthToken(user: any): string {
  const secret = getSessionSecret();
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    ...user,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 // 7 days
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(head + '.' + payload).digest('base64url');
  return head + '.' + payload + '.' + sig;
}

export function verifyAuthToken(token: string): any | null {
  try {
    const secret = getSessionSecret();
    const parts = token.trim().split('.');
    if (parts.length !== 3) return null;
    const expectedSig = crypto.createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest('base64url');
    if (expectedSig !== parts[2]) return null;
    const data = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    if (data.exp && data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}

export type UserPermission = 
  | 'can_create_orders'
  | 'can_process_payments'
  | 'can_release_stock'
  | 'can_manage_stock'
  | 'can_import_export_stock'
  | 'can_partner_borrow'
  | 'can_view_reports'
  | 'can_view_buying_prices'
  | 'can_give_discounts'
  | 'can_manage_users'
  | 'can_print_full_receipt'
  | 'can_print_delivery_note'
  | 'can_manage_customers'
  | 'can_manage_partners'
  | 'can_void_orders'
  | 'can_view_audit_trail'
  | 'can_reset_passwords'
  | 'can_view_all_tenants'
  | 'can_manage_subscriptions'
  | 'can_edit_company_settings';

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: number;
      shop_id: number | null;
      stock_id?: number | null;
      shop_name?: string;
      shop_status?: 'pending' | 'active' | 'suspended';
      name: string;
      email: string;
      role: 'superadmin' | 'platform_ops' | 'manager' | 'employee' | 'salesperson' | 'accountant' | 'storekeeper' | 'cashier';
      twofa_enabled?: number | boolean;
      twofa_verified?: boolean;
      job_title?: string;
      phone?: string;
      force_password_change?: number | boolean;
      activation_status?: 'active' | 'pending_approval' | 'suspended';
      activation_note?: string;
      can_create_orders?: number | boolean;
      can_process_payments?: number | boolean;
      can_release_stock?: number | boolean;
      can_manage_stock?: number | boolean;
      can_import_export_stock?: number | boolean;
      can_partner_borrow?: number | boolean;
      can_view_reports?: number | boolean;
      can_view_buying_prices?: number | boolean;
      can_give_discounts?: number | boolean;
      can_manage_users?: number | boolean;
      can_print_full_receipt?: number | boolean;
      can_print_delivery_note?: number | boolean;
      can_manage_customers?: number | boolean;
      can_manage_partners?: number | boolean;
      can_void_orders?: number | boolean;
      can_view_audit_trail?: number | boolean;
      can_reset_passwords?: number | boolean;
      can_view_all_tenants?: number | boolean;
      can_manage_subscriptions?: number | boolean;
      can_edit_company_settings?: number | boolean;
    };
  }
}

export function isApiRequest(req: Request): boolean {
  return Boolean(
    req.originalUrl?.startsWith('/api') ||
    req.path?.startsWith('/api') ||
    req.xhr ||
    req.headers.accept?.includes('application/json')
  );
}

export function handleAuthFailure(req: Request, res: Response, status: number, title: string, message: string, redirectUrl = '/login') {
  if (isApiRequest(req)) {
    return res.status(status).json({ error: message, title, status });
  }
  if (status === 401 && redirectUrl) {
    return res.redirect(redirectUrl);
  }
  return res.status(status).render('error', {
    title,
    message,
    path: req.path
  });
}

export function extractTokenUser(req: Request): any | null {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  if (!authHeader) return null;
  const rawToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : String(authHeader).trim();
  if (!rawToken) return null;
  return verifyAuthToken(rawToken);
}

export const ALL_USER_PERMISSION_KEYS: UserPermission[] = [
  'can_create_orders',
  'can_process_payments',
  'can_release_stock',
  'can_manage_stock',
  'can_import_export_stock',
  'can_partner_borrow',
  'can_view_reports',
  'can_view_buying_prices',
  'can_give_discounts',
  'can_manage_users',
  'can_print_full_receipt',
  'can_print_delivery_note',
  'can_manage_customers',
  'can_manage_partners',
  'can_void_orders',
  'can_view_audit_trail',
  'can_reset_passwords',
  'can_view_all_tenants',
  'can_manage_subscriptions',
  'can_edit_company_settings'
];

export function hasUserPermission(user: any, permission: UserPermission): boolean {
  if (!user) return false;
  if (user.role === 'superadmin' || user.role === 'manager' || user.email === 'rwemera30@gmail.com') {
    return true;
  }
  const val = user[permission];
  return val === true || Number(val) === 1;
}

/**
 * Reloads the latest role, status, and granular permission flags from the database
 * into req.session.user so temporary duty edits by a manager take effect immediately
 * without requiring the staff member to log out and back in.
 */
export async function refreshSessionUserFromDb(req: Request): Promise<any | null> {
  if (!req.session?.user?.id) return null;
  const userId = Number(req.session.user.id);
  const freshUser = await queryOne<any>(
    `SELECT u.*, s.name as shop_name, s.status as shop_status
     FROM users u
     LEFT JOIN shops s ON u.shop_id = s.id
     WHERE u.id = ?`,
    [userId]
  );
  if (!freshUser) return null;

  // Preserve active shop_id override when superadmin switched tenant context
  const currentSession = req.session.user;
  const effectiveShopId = (freshUser.role === 'superadmin' || freshUser.email === 'rwemera30@gmail.com') && currentSession.shop_id
    ? currentSession.shop_id
    : freshUser.shop_id;

  const updatedSessionUser: any = {
    ...currentSession,
    id: freshUser.id,
    shop_id: effectiveShopId,
    stock_id: freshUser.stock_id,
    shop_name: currentSession.shop_name || freshUser.shop_name,
    shop_status: freshUser.shop_status || currentSession.shop_status,
    name: freshUser.name,
    email: freshUser.email,
    role: freshUser.role,
    job_title: freshUser.job_title,
    phone: freshUser.phone,
    is_active: freshUser.is_active,
    force_password_change: freshUser.force_password_change,
    activation_status: freshUser.activation_status,
    activation_note: freshUser.activation_note
  };

  for (const pk of ALL_USER_PERMISSION_KEYS) {
    if (freshUser[pk] !== undefined) {
      updatedSessionUser[pk] = freshUser[pk];
    }
  }

  req.session.user = updatedSessionUser;
  return updatedSessionUser;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // 1. Check Authorization Bearer header or x-auth-token first (immune to Brave Shields, cookie partitioning & Vercel cold starts)
  if (!req.session?.user) {
    const tokenUser = extractTokenUser(req);
    if (tokenUser) {
      req.session = req.session || ({} as any);
      req.session.user = tokenUser;
    }
  }

  if (!req.session || !req.session.user) {
    return handleAuthFailure(req, res, 401, 'Authentication Required', 'Please log in to access this resource.', '/login');
  }

  const sessionUser = req.session.user;

  // SuperAdmin, Big Boss, and Platform Operations Staff have full platform bypass
  if (sessionUser.role === 'superadmin' || sessionUser.role === 'platform_ops' || sessionUser.email === 'rwemera30@gmail.com') {
    return next();
  }

  // Non-superadmins must have an active tenant association
  if (!sessionUser.shop_id) {
    return handleAuthFailure(
      req,
      res,
      403,
      '403 Tenant Association Missing',
      'Your user account is not associated with an active store tenant. Please contact VectOS support.'
    );
  }

  try {
    const userId = Number(sessionUser.id);
    // Real-time verification for cascading suspension, activation status & live permissions
    const dbCheck = await queryOne(`
      SELECT 
        u.*,
        s.status as shop_status, s.name as shop_name,
        (SELECT is_active FROM users WHERE shop_id = u.shop_id AND role = 'manager' LIMIT 1) as manager_active
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      WHERE u.id = ?
    `, [userId]);

    if (!dbCheck) {
      if (req.session && typeof req.session.destroy === 'function') {
        req.session.destroy(() => {});
      }
      return handleAuthFailure(req, res, 401, 'Account Removed', 'User account no longer exists.', '/login?error=User+account+no+longer+exists');
    }

    if (dbCheck.shop_status === 'suspended') {
      return handleAuthFailure(
        req,
        res,
        403,
        'Company Subscription Suspended — VectOS',
        'Your company subscription is currently suspended or past due. Please contact VectOS Administration to renew your account.'
      );
    }

    if (dbCheck.shop_status === 'pending') {
      return handleAuthFailure(
        req,
        res,
        403,
        'Depot Awaiting VectOS Approval',
        'Your company registration is pending verification and activation by the VectOS Administrator. Access will unlock upon subscription setup.'
      );
    }

    const isActive = Number(dbCheck.is_active) === 1 || dbCheck.is_active === true;
    if (!isActive || dbCheck.activation_status === 'suspended') {
      return handleAuthFailure(
        req,
        res,
        403,
        'User Account Deactivated',
        'Your individual user account has been suspended or deactivated. Please contact your store manager or VectOS Administrator.'
      );
    }

    if (dbCheck.activation_status === 'pending_approval') {
      return handleAuthFailure(
        req,
        res,
        403,
        'Account Awaiting SuperAdmin Activation',
        'This user account is pending VectOS SuperAdmin billing activation. Once subscription is confirmed with the VectOS team, it will become active.'
      );
    }

    // Cascading suspension: If this is an employee and their store manager is deactivated
    const managerActive = dbCheck.manager_active === undefined || dbCheck.manager_active === null 
      ? true 
      : (Number(dbCheck.manager_active) === 1 || dbCheck.manager_active === true);
    if (dbCheck.role !== 'manager' && !managerActive) {
      return handleAuthFailure(
        req,
        res,
        403,
        'Company Access Temporarily Blocked',
        'The manager account for this depot is currently deactivated, which has temporarily locked all staff access. Please contact VectOS Platform Support.'
      );
    }

    // Keep req.session.user synchronized with fresh role & granular permissions from DB
    const syncedUser: any = {
      ...req.session.user,
      role: dbCheck.role,
      job_title: dbCheck.job_title,
      shop_id: dbCheck.shop_id,
      stock_id: dbCheck.stock_id,
      is_active: dbCheck.is_active,
      activation_status: dbCheck.activation_status,
      force_password_change: dbCheck.force_password_change
    };
    for (const pk of ALL_USER_PERMISSION_KEYS) {
      if (dbCheck[pk] !== undefined) {
        syncedUser[pk] = dbCheck[pk];
      }
    }
    req.session.user = syncedUser;

    return next();
  } catch (err: any) {
    console.error('Auth verification error:', err);
    return handleAuthFailure(
      req,
      res,
      503,
      'Service Temporarily Unavailable — VectOS',
      'Unable to verify your session at this time. Please refresh the page and try again.'
    );
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    const tokenUser = extractTokenUser(req);
    if (tokenUser) {
      req.session = req.session || ({} as any);
      req.session.user = tokenUser;
    }
  }

  if (!req.session || !req.session.user) {
    return handleAuthFailure(req, res, 401, 'Authentication Required', 'Please log in as SuperAdmin.', '/login');
  }
  if (req.session.user.role === 'superadmin' || req.session.user.email === 'rwemera30@gmail.com') {
    return next();
  }
  return handleAuthFailure(
    req,
    res,
    403,
    '403 SuperAdmin Privilege Required',
    'This module is restricted to the platform owner / super administrator.'
  );
}

export function requireManager(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user) {
    const tokenUser = extractTokenUser(req);
    if (tokenUser) {
      req.session = req.session || ({} as any);
      req.session.user = tokenUser;
    }
  }

  if (!req.session || !req.session.user) {
    return handleAuthFailure(req, res, 401, 'Authentication Required', 'Please log in to continue.', '/login');
  }
  const u = req.session.user;
  const canManage = u.role === 'manager' || 
    u.role === 'superadmin' || 
    u.role === 'platform_ops' || 
    u.email === 'rwemera30@gmail.com' || 
    Boolean(Number(u.can_manage_users) === 1 || u.can_manage_users === true);

  if (canManage) {
    return next();
  }
  return handleAuthFailure(
    req,
    res,
    403,
    '403 Manager Access Required',
    'You need Store Manager privileges to manage staff users and access store configuration.'
  );
}

export function requirePermission(permission: UserPermission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.user) {
      const tokenUser = extractTokenUser(req);
      if (tokenUser) {
        req.session = req.session || ({} as any);
        req.session.user = tokenUser;
      }
    }

    if (!req.session || !req.session.user) {
      return handleAuthFailure(req, res, 401, 'Authentication Required', 'Please log in to continue.', '/login');
    }

    // Refresh permissions from DB if requireAuth hasn't already done so in this request
    try {
      const fresh = await refreshSessionUserFromDb(req);
      if (fresh) {
        req.session.user = fresh;
      }
    } catch {
      // Fallback gracefully to existing session user
    }

    const user = req.session.user;

    if (hasUserPermission(user, permission)) {
      return next();
    }

    const humanNames: Record<UserPermission, string> = {
      can_create_orders: 'Create Orders & Sales',
      can_process_payments: 'Accept & Confirm Payments',
      can_release_stock: 'Confirm & Release Physical Stock',
      can_manage_stock: 'Add, Edit & Adjust Stock',
      can_import_export_stock: 'Bulk Excel/CSV Import & Export',
      can_partner_borrow: 'Partner Shop Borrowing',
      can_view_reports: 'View Financial Reports & Profit Analytics',
      can_view_buying_prices: 'View Wholesale Cost & Profit Margins',
      can_give_discounts: 'Change Prices / Give Customer Discounts',
      can_manage_users: 'Manage Staff Accounts & Duties',
      can_print_full_receipt: 'Print Official Receipts (with Prices)',
      can_print_delivery_note: 'Print Store Delivery Notes (Quantities Only)',
      can_manage_customers: 'Manage Customers & Credit Accounts',
      can_manage_partners: 'Manage Partner Shops',
      can_void_orders: 'Cancel / Void Orders',
      can_view_audit_trail: 'View Activity & Approval History',
      can_reset_passwords: 'Reset Employee Passwords',
      can_view_all_tenants: 'View All Store Branches',
      can_manage_subscriptions: 'Manage Store Billing & Subscriptions',
      can_edit_company_settings: 'Edit Store Profile & Tax Info'
    };

    return handleAuthFailure(
      req,
      res,
      403,
      'Permission Required',
      `Your account does not currently have permission to: "${humanNames[permission]}". Ask your store manager to enable this duty in Staff & Roles.`
    );
  };
}

export const requireSalesperson = requirePermission('can_create_orders');
export const requireAccountant = requirePermission('can_process_payments');
export const requireStorekeeper = requirePermission('can_release_stock');

