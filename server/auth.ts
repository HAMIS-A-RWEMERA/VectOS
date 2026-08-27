import { Request, Response, NextFunction } from 'express';
import { queryOne } from './database/db';

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
      role: 'superadmin' | 'manager' | 'employee' | 'salesperson' | 'accountant' | 'storekeeper';
      twofa_enabled?: number | boolean;
      twofa_verified?: boolean;
      job_title?: string;
      phone?: string;
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

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.user) {
    return handleAuthFailure(req, res, 401, 'Authentication Required', 'Please log in to access this resource.', '/login');
  }

  const sessionUser = req.session.user;

  // SuperAdmin has platform bypass
  if (sessionUser.role === 'superadmin') {
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
    // Real-time verification for cascading suspension & activation status
    const dbCheck = await queryOne(`
      SELECT 
        u.id, u.is_active, u.activation_status, u.role, u.shop_id,
        s.status as shop_status, s.name as shop_name,
        (SELECT is_active FROM users WHERE shop_id = u.shop_id AND role = 'manager' LIMIT 1) as manager_active
      FROM users u
      LEFT JOIN shops s ON u.shop_id = s.id
      WHERE u.id = ?
    `, [sessionUser.id]);

    if (!dbCheck) {
      req.session.destroy(() => {});
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

    if (dbCheck.is_active !== 1 || dbCheck.activation_status === 'suspended') {
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
    if (dbCheck.role !== 'manager' && dbCheck.manager_active === 0) {
      return handleAuthFailure(
        req,
        res,
        403,
        'Company Access Temporarily Blocked',
        'The manager account for this depot is currently deactivated, which has temporarily locked all staff access. Please contact VectOS Platform Support.'
      );
    }

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
  if (!req.session || !req.session.user) {
    return handleAuthFailure(req, res, 401, 'Authentication Required', 'Please log in as SuperAdmin.', '/login');
  }
  if (req.session.user.role === 'superadmin') {
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
  if (!req.session || !req.session.user) {
    return handleAuthFailure(req, res, 401, 'Authentication Required', 'Please log in to continue.', '/login');
  }
  if (req.session.user.role === 'manager' || req.session.user.role === 'superadmin' || req.session.user.can_manage_users) {
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
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !req.session.user) {
      return handleAuthFailure(req, res, 401, 'Authentication Required', 'Please log in to continue.', '/login');
    }

    const user = req.session.user;

    // SuperAdmin and Store Managers have full permissions
    if (user.role === 'superadmin' || user.role === 'manager') {
      return next();
    }

    // Check specific granular permission flag
    if (user[permission] === 1 || user[permission] === (true as any)) {
      return next();
    }

    const humanNames: Record<UserPermission, string> = {
      can_create_orders: 'Create Orders & Negotiate Selling Prices',
      can_process_payments: 'Process & Confirm Payments / Receivables',
      can_release_stock: 'Storekeeper Dispatch & Stock Release',
      can_manage_stock: 'Manage Inventory & Stock Movements',
      can_import_export_stock: 'Bulk Excel/CSV Import & Stock Export',
      can_partner_borrow: 'Resolve Rejected Items & Partner Shop Sourcing',
      can_view_reports: 'Financial Reports & Profit Analytics',
      can_view_buying_prices: 'View Purchase Costs & Wholesale Profit Margins',
      can_give_discounts: 'Authorize Special Client Discounts & Custom Rates',
      can_manage_users: 'Manage Staff Roles & Security Checklists',
      can_print_full_receipt: 'Print Financial Receipts (with Prices)',
      can_print_delivery_note: 'Print Stock Delivery Notes (Quantities Only)',
      can_manage_customers: 'Manage Customer Profiles & Credit Balances',
      can_manage_partners: 'Manage Partner Shops & Sourcing Accounts',
      can_void_orders: 'Void / Cancel Sales Orders & Invoices',
      can_edit_company_settings: 'Edit Company Profile & TIN Configuration'
    };

    return handleAuthFailure(
      req,
      res,
      403,
      '403 Specific Permission Required',
      `Your account does not currently have permission to: "${humanNames[permission]}". Please ask your store manager to tick this capability in your user profile.`
    );
  };
}

export const requireSalesperson = requirePermission('can_create_orders');
export const requireAccountant = requirePermission('can_process_payments');
export const requireStorekeeper = requirePermission('can_release_stock');

