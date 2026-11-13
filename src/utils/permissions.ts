import { User } from '../types';

export type PermissionKey =
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
  | 'can_edit_company_settings'
  | 'can_view_audit_trail'
  | 'can_reset_passwords'
  | 'can_view_all_tenants'
  | 'can_manage_subscriptions';

export function isFullAccessRole(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    user.role === 'superadmin' ||
    user.role === 'manager' ||
    user.email === 'rwemera30@gmail.com'
  );
}

export function hasPermission(user: User | null | undefined, perm: PermissionKey): boolean {
  if (!user) return false;
  if (isFullAccessRole(user)) return true;
  const val = (user as any)[perm];
  return val === true || Number(val) === 1;
}

export function isSoloAllInOneUser(user: User | null | undefined): boolean {
  if (!user) return false;
  return (
    hasPermission(user, 'can_create_orders') &&
    hasPermission(user, 'can_process_payments') &&
    hasPermission(user, 'can_release_stock')
  );
}
