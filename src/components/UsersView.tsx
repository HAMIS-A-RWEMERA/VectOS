import React, { useState, useEffect } from 'react';
import { User, Shop } from '../types';
import { api } from '../services/api';
import {
  Users,
  Plus,
  Shield,
  Mail,
  Phone,
  Edit2,
  KeyRound,
  AlertTriangle,
  UserCheck,
  UserX,
  Search,
  CheckCircle2,
  Sparkles,
  Eraser,
  X
} from 'lucide-react';
import { matchesSearch } from '../utils/searchMatch';

interface UsersViewProps {
  currentUser: User | null;
}

const ALL_SHOP_PERMISSION_KEYS = [
  'can_create_orders',
  'can_give_discounts',
  'can_print_full_receipt',
  'can_print_delivery_note',
  'can_void_orders',
  'can_process_payments',
  'can_view_reports',
  'can_view_buying_prices',
  'can_release_stock',
  'can_manage_stock',
  'can_import_export_stock',
  'can_partner_borrow',
  'can_manage_customers',
  'can_manage_partners',
  'can_manage_users',
  'can_reset_passwords',
  'can_view_audit_trail',
  'can_edit_company_settings'
] as const;

type ShopPermissionKey = (typeof ALL_SHOP_PERMISSION_KEYS)[number];
type PermissionMap = Record<ShopPermissionKey, boolean>;

const buildPermissionMap = (overrides: Partial<PermissionMap> = {}, defaultVal = false): PermissionMap => {
  const map = {} as PermissionMap;
  for (const key of ALL_SHOP_PERMISSION_KEYS) {
    map[key] = overrides[key] !== undefined ? Boolean(overrides[key]) : defaultVal;
  }
  return map;
};

const EMPTY_PERMISSIONS: PermissionMap = buildPermissionMap({}, false);

const PERMISSION_GROUPS: {
  name: string;
  description: string;
  items: { key: ShopPermissionKey; label: string }[];
}[] = [
  {
    name: 'Selling & Customer Orders',
    description: 'Taking customer orders, giving price discounts, and printing documents',
    items: [
      { key: 'can_create_orders', label: 'Create new customer orders' },
      { key: 'can_give_discounts', label: 'Give discounts or lower item prices' },
      { key: 'can_print_full_receipt', label: 'Print full payment receipts' },
      { key: 'can_print_delivery_note', label: 'Print delivery notes (quantities only)' },
      { key: 'can_void_orders', label: 'Cancel mistaken orders' }
    ]
  },
  {
    name: 'Money, Payments & Profits',
    description: 'Receiving Cash, MoMo & Bank payments and viewing profit reports',
    items: [
      { key: 'can_process_payments', label: 'Take Cash, MoMo & Bank payments' },
      { key: 'can_view_reports', label: 'View sales reports' },
      { key: 'can_view_buying_prices', label: 'See supplier buying prices & profit' }
    ]
  },
  {
    name: 'Store Room & Stock Handling',
    description: 'Handing out sold items, counting stock, and importing stock lists',
    items: [
      { key: 'can_release_stock', label: 'Hand out / release items from the store' },
      { key: 'can_manage_stock', label: 'Add products & adjust stock counts' },
      { key: 'can_import_export_stock', label: 'Upload / download stock lists (Excel/CSV)' },
      { key: 'can_partner_borrow', label: 'Borrow items from partner shops' }
    ]
  },
  {
    name: 'Customers & Partner Shops',
    description: 'Managing regular buyers, credit accounts, and neighboring partner shops',
    items: [
      { key: 'can_manage_customers', label: 'Add & edit customers' },
      { key: 'can_manage_partners', label: 'Manage partner shops' }
    ]
  },
  {
    name: 'Staff & Store Settings',
    description: 'Managing staff accounts, passwords, activity history, and shop info',
    items: [
      { key: 'can_manage_users', label: 'Add staff & change staff duties' },
      { key: 'can_reset_passwords', label: 'Reset staff passwords' },
      { key: 'can_view_audit_trail', label: 'View staff activity history' },
      { key: 'can_edit_company_settings', label: 'Edit shop name, phone & TIN' }
    ]
  }
];

interface RoleTemplate {
  id: string;
  title: string;
  role: string;
  job_title: string;
  desc: string;
  permissions: PermissionMap;
  superAdminOnly?: boolean;
}

const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: 'solo',
    title: 'Solo Operator',
    role: 'employee',
    job_title: 'Solo Shop Operator',
    desc: 'Runs the whole shop alone: sells, takes payments, releases stock & sees reports',
    permissions: buildPermissionMap({
      can_create_orders: true,
      can_give_discounts: true,
      can_print_full_receipt: true,
      can_print_delivery_note: true,
      can_void_orders: true,
      can_process_payments: true,
      can_view_reports: true,
      can_view_buying_prices: true,
      can_release_stock: true,
      can_manage_stock: true,
      can_import_export_stock: true,
      can_partner_borrow: true,
      can_manage_customers: true,
      can_manage_partners: true,
      can_manage_users: false,
      can_reset_passwords: false,
      can_view_audit_trail: false,
      can_edit_company_settings: false
    })
  },
  {
    id: 'salesperson',
    title: 'Salesperson',
    role: 'salesperson',
    job_title: 'Salesperson',
    desc: 'Helps buyers, makes orders & edits customers; sends orders to Cashier & Store',
    permissions: buildPermissionMap({
      can_create_orders: true,
      can_give_discounts: true,
      can_print_delivery_note: true,
      can_manage_customers: true
    })
  },
  {
    id: 'cashier',
    title: 'Cashier / Accountant',
    role: 'accountant',
    job_title: 'Cashier & Accountant',
    desc: 'Takes Cash/MoMo/Bank payments, prints receipts, cancels orders & checks profits',
    permissions: buildPermissionMap({
      can_process_payments: true,
      can_print_full_receipt: true,
      can_print_delivery_note: true,
      can_void_orders: true,
      can_view_reports: true,
      can_view_buying_prices: true,
      can_manage_customers: true,
      can_view_audit_trail: true
    })
  },
  {
    id: 'storekeeper',
    title: 'Storekeeper',
    role: 'storekeeper',
    job_title: 'Storekeeper',
    desc: 'Checks & releases physical items, updates stock counts & prints delivery notes',
    permissions: buildPermissionMap({
      can_release_stock: true,
      can_manage_stock: true,
      can_import_export_stock: true,
      can_partner_borrow: true,
      can_manage_partners: true,
      can_print_delivery_note: true
    })
  },
  {
    id: 'manager',
    title: 'Store Manager',
    role: 'manager',
    job_title: 'Store Manager',
    desc: 'Full access to everything in the shop including staff duties and store settings',
    permissions: buildPermissionMap({}, true)
  },
  {
    id: 'platform_ops',
    title: 'Platform Support',
    role: 'platform_ops',
    job_title: 'Platform Support Officer',
    desc: 'Platform support staff across shops',
    permissions: buildPermissionMap({
      can_edit_company_settings: false
    }, true),
    superAdminOnly: true
  }
];

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Platform Owner',
  platform_ops: 'Platform Support',
  manager: 'Store Manager',
  salesperson: 'Salesperson',
  accountant: 'Cashier / Accountant',
  storekeeper: 'Storekeeper',
  employee: 'Shop Staff'
};

export const UsersView: React.FC<UsersViewProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'paused'>('all');
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('empty');

  // Form State
  const [formData, setFormData] = useState<any>({
    name: '',
    email: '',
    password: '',
    role: 'employee',
    job_title: 'Custom Staff',
    phone: '',
    shop_id: currentUser?.shop_id || 1,
    is_active: 1,
    ...EMPTY_PERMISSIONS
  });

  // Reset Password Modal State
  const [resetModalUser, setResetModalUser] = useState<User | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetError, setResetError] = useState('');

  const [modalError, setModalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSuperAdmin = currentUser?.role === 'superadmin';
  const visibleTemplates = ROLE_TEMPLATES.filter((t) => !t.superAdminOnly || isSuperAdmin);

  useEffect(() => {
    if (currentUser) {
      fetchUsers();
      if (isSuperAdmin) {
        fetchShops();
      }
    }
  }, [currentUser]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.getUsers();
      setUsers(res.users || []);
    } catch (err: any) {
      if (err?.message?.includes('log in') || err?.message?.includes('Authentication Required')) {
        return;
      }
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchShops = async () => {
    try {
      const res = await api.getShops();
      setShops(res.shops || []);
    } catch (e) {
      console.error('Failed to fetch shops:', e);
    }
  };

  const handleOpenAddModal = () => {
    setIsEditing(false);
    setEditingUserId(null);
    setSelectedTemplateId('salesperson');
    const defaultTpl = ROLE_TEMPLATES.find((t) => t.id === 'salesperson')!;
    setFormData({
      name: '',
      email: '',
      password: '',
      role: defaultTpl.role,
      job_title: defaultTpl.job_title,
      phone: '',
      shop_id: currentUser?.shop_id || 1,
      is_active: 1,
      ...defaultTpl.permissions
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (u: User) => {
    setIsEditing(true);
    setEditingUserId(u.id);
    setSelectedTemplateId('custom');
    const perms = {} as PermissionMap;
    for (const key of ALL_SHOP_PERMISSION_KEYS) {
      perms[key] = Boolean((u as any)[key]);
    }
    if (u.role === 'manager' || u.role === 'superadmin') {
      perms.can_edit_company_settings = true;
    }
    setFormData({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      job_title: u.job_title || '',
      phone: u.phone || '',
      shop_id: u.shop_id || currentUser?.shop_id || 1,
      is_active: u.is_active !== undefined ? Number(u.is_active) : 1,
      ...perms
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const applyTemplate = (tpl: RoleTemplate) => {
    setSelectedTemplateId(tpl.id);
    setFormData((prev: any) => ({
      ...prev,
      role: tpl.role,
      job_title: tpl.job_title,
      ...tpl.permissions
    }));
  };

  const applyStartEmpty = () => {
    setSelectedTemplateId('empty');
    setFormData((prev: any) => ({
      ...prev,
      role: 'employee',
      job_title: prev.job_title && prev.job_title !== 'Store Manager' ? prev.job_title : 'Custom Staff',
      ...EMPTY_PERMISSIONS
    }));
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      setModalError('Staff name and sign-in email are required.');
      return;
    }
    if (!isEditing && (!formData.password || formData.password.trim().length < 6)) {
      setModalError('Initial temporary password must be at least 6 characters.');
      return;
    }

    const explicitPermissions: Record<string, boolean> = {};
    for (const key of ALL_SHOP_PERMISSION_KEYS) {
      explicitPermissions[key] = Boolean(formData[key]);
    }
    if (formData.role === 'manager' || formData.role === 'superadmin') {
      explicitPermissions.can_edit_company_settings = true;
    }

    try {
      setIsSubmitting(true);
      setModalError('');
      if (isEditing && editingUserId) {
        const updatePayload: any = {
          name: formData.name.trim(),
          phone: formData.phone || '',
          role: formData.role,
          job_title: formData.job_title || '',
          is_active: Number(formData.is_active) === 1 ? 1 : 0,
          permissions: explicitPermissions,
          ...explicitPermissions
        };
        await api.updateUser(editingUserId, updatePayload);
        setActionFeedback({ type: 'success', message: `Updated duties for ${formData.name.trim()}. Changes apply right away.` });
      } else {
        const createPayload: any = {
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
          phone: formData.phone || '',
          role: formData.role,
          job_title: formData.job_title || 'Shop Staff',
          shop_id: formData.shop_id,
          permissions: explicitPermissions,
          ...explicitPermissions
        };
        await api.createUser(createPayload);
        setActionFeedback({ type: 'success', message: `Added ${formData.name.trim()} to your team.` });
      }
      setIsModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save staff details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActiveStatus = async (u: User) => {
    const currentlyActive = Number(u.is_active) === 1;
    const nextActive = currentlyActive ? 0 : 1;
    try {
      setTogglingUserId(u.id);
      setActionFeedback(null);
      await api.updateUser(u.id, { is_active: nextActive });
      setUsers((prev) =>
        prev.map((item) => (item.id === u.id ? { ...item, is_active: nextActive } : item))
      );
      setActionFeedback({
        type: 'success',
        message: nextActive === 1
          ? `${u.name}'s account is active again.`
          : `${u.name}'s access is paused (for leave or time off). Their duties stay saved.`
      });
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err.message || 'Could not update staff access status.'
      });
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser || !tempPassword) return;

    try {
      setResetting(true);
      setResetError('');
      const res = await api.resetUserPassword(resetModalUser.id, tempPassword);
      setResetSuccess(res.message || `Password reset successfully for ${resetModalUser.name}`);
      setTimeout(() => {
        setResetModalUser(null);
        setResetSuccess('');
        setTempPassword('');
      }, 1800);
    } catch (err: any) {
      setResetError(err.message || 'Failed to reset staff password');
    } finally {
      setResetting(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesQuery = matchesSearch(search, u.name, u.email, u.job_title, u.phone, u.role);
    const matchesRole = filterRole === 'all' || u.role === filterRole;
    const isActive = Number(u.is_active) === 1;
    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && isActive) ||
      (filterStatus === 'paused' && !isActive);
    return matchesQuery && matchesRole && matchesStatus;
  });

  const checkedCountInForm = ALL_SHOP_PERMISSION_KEYS.filter((k) => Boolean(formData[k])).length;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              Staff & Duty Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {users.length} Staff Accounts
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Set what each person can do in your shop — whether one person runs everything or a team splits the work.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Staff Member</span>
        </button>
      </div>

      {/* Plain-Language Guide Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-[#141A26] to-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              Flexible Duties — Ready for Busy Hours, Tax Week, or Sick Leave
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Need someone to cover for a sick colleague, help during busy weekends, or handle tax reporting? Click <strong className="text-amber-300">Change Duties</strong> on their card — updates take effect right away without anyone sharing passwords. You can also pause access while a staff member is on leave without losing their setup.
            </p>
          </div>
        </div>
      </div>

      {actionFeedback && (
        <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
          actionFeedback.type === 'success'
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span className="font-semibold">{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-white px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            placeholder="Search by name, email, phone, or job title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-white transition"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              { id: 'all', label: 'All Roles' },
              { id: 'manager', label: 'Managers' },
              { id: 'salesperson', label: 'Sales' },
              { id: 'accountant', label: 'Cashiers' },
              { id: 'storekeeper', label: 'Storekeepers' },
              { id: 'employee', label: 'Solo / Custom' }
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => setFilterRole(r.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  filterRole === r.id
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/10'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[11px]">
            {[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'paused', label: 'Paused' }
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setFilterStatus(st.id as any)}
                className={`px-2.5 py-1 rounded font-semibold transition ${
                  filterStatus === st.id
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Users Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs">Loading staff accounts...</div>
      ) : filteredUsers.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-xs rounded-2xl bg-slate-900/50 border border-slate-800">
          No staff accounts found matching your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((u) => {
            const isAccountActive = Number(u.is_active) === 1;
            const isFullRole = u.role === 'superadmin' || u.role === 'manager';
            const activePermCount = ALL_SHOP_PERMISSION_KEYS.filter((k) => Boolean((u as any)[k])).length;
            const isSelf = currentUser?.id === u.id;
            const canTogglePause = u.role !== 'superadmin' && !isSelf;

            return (
              <div
                key={u.id}
                className={`p-5 rounded-2xl border transition flex flex-col justify-between space-y-4 shadow-sm ${
                  isAccountActive
                    ? 'bg-[#121620] border-slate-800 hover:border-slate-700'
                    : 'bg-[#0f131b] border-rose-500/30 opacity-85'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-11 h-11 rounded-xl border font-bold flex items-center justify-center text-base shrink-0 ${
                        isAccountActive
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                      }`}>
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-sm font-bold text-white truncate">{u.name}</h3>
                          {!isAccountActive && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                              Paused / On Leave
                            </span>
                          )}
                          {Number(u.force_password_change) === 1 && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-400 font-semibold" title="Must change password on next login">
                              Password Change Pending
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate">{u.job_title || ROLE_LABELS[u.role] || u.role}</p>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                      u.role === 'superadmin'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : u.role === 'manager'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-400 pt-3 mt-3 border-t border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="font-mono text-slate-300 truncate">{u.email}</span>
                    </div>
                    {u.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="font-mono text-slate-400">{u.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Permission Count & Highlights */}
                  <div className="pt-3 mt-3 border-t border-slate-800/60">
                    <div className="flex items-center justify-between text-[11px] mb-2">
                      <span className="text-slate-400 font-semibold">Assigned Duties</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-amber-400 font-bold text-[10px]">
                        {isFullRole ? 'Full Shop Access' : `${activePermCount} of ${ALL_SHOP_PERMISSION_KEYS.length} Duties`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(isFullRole || u.can_create_orders) && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">Make Sales</span>
                      )}
                      {(isFullRole || u.can_process_payments) && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 text-[10px] border border-emerald-800/40">Take Payments</span>
                      )}
                      {(isFullRole || u.can_release_stock) && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 text-[10px] border border-blue-800/40">Release Stock</span>
                      )}
                      {(isFullRole || u.can_manage_stock) && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">Manage Stock</span>
                      )}
                      {(isFullRole || u.can_view_reports) && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">Sales Reports</span>
                      )}
                      {(isFullRole || u.can_view_buying_prices) && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">Buying Prices</span>
                      )}
                      {(isFullRole || u.can_view_audit_trail) && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 text-[10px] border border-amber-800/40">Activity History</span>
                      )}
                      {(isFullRole || u.can_edit_company_settings) && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 text-[10px] border border-purple-800/40">Edit Shop Info</span>
                      )}
                      {!isFullRole && activePermCount === 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 text-[10px] italic">
                          No duties assigned yet
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Card Actions */}
                <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenEditModal(u)}
                    className="flex-1 min-w-[115px] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Change Duties</span>
                  </button>

                  {canTogglePause && (
                    <button
                      type="button"
                      disabled={togglingUserId === u.id}
                      onClick={() => handleToggleActiveStatus(u)}
                      className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
                        isAccountActive
                          ? 'bg-slate-800/60 hover:bg-rose-500/10 border-slate-700/60 hover:border-rose-500/30 text-slate-300 hover:text-rose-300'
                          : 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300'
                      }`}
                      title={isAccountActive ? 'Temporarily pause access (e.g. sick leave or time off)' : 'Restore access'}
                    >
                      {isAccountActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      <span>{isAccountActive ? 'Pause' : 'Activate'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setResetModalUser(u);
                      setTempPassword('quincaille2026');
                      setResetError('');
                      setResetSuccess('');
                    }}
                    className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-amber-500/10 border border-slate-700/60 hover:border-amber-500/30 text-amber-300 text-xs font-semibold transition"
                    title="Reset password for this staff member"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Password</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Staff Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 lg:p-6 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-[#131722] border border-slate-700 shadow-2xl p-5 lg:p-6 space-y-4 animate-in fade-in zoom-in-95 my-auto max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isEditing ? `Change Staff Duties: ${formData.name}` : 'Add New Staff Member'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Pick a ready template, start empty to choose duties one by one, or adjust what they can do right now.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {/* Role Templates + Start Empty Option */}
            <div className="space-y-2 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Quick Role Templates (Optional — you can edit any checkbox below)</span>
                </label>
                <button
                  type="button"
                  onClick={applyStartEmpty}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                    selectedTemplateId === 'empty'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/60'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  <Eraser className="w-3 h-3" />
                  <span>Start Empty (Nothing Checked)</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {visibleTemplates.map((tpl) => {
                  const isSelected = selectedTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500 shadow-sm'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-amber-500/40'
                      }`}
                    >
                      <p className="text-[11px] font-bold text-amber-400">{tpl.title}</p>
                      <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">{tpl.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs text-rose-300 shrink-0">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Eric Bizimana"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Sign-In Email *</label>
                  <input
                    type="email"
                    required
                    disabled={isEditing}
                    placeholder="eric@quincaille.rw"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {isEditing && (
                    <p className="text-[10px] text-slate-400 mt-1">Sign-in email cannot be changed after creation.</p>
                  )}
                </div>
              </div>

              {!isEditing && (
                <div>
                  <label className="text-xs font-semibold text-slate-300">Temporary Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="At least 6 characters"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    They will be asked to choose their own password on their first sign-in.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Main Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => {
                      const nextRole = e.target.value;
                      setFormData((prev: any) => ({
                        ...prev,
                        role: nextRole,
                        can_edit_company_settings:
                          nextRole === 'manager' || nextRole === 'superadmin'
                            ? true
                            : prev.can_edit_company_settings
                      }));
                    }}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="employee">Shop Staff / Custom</option>
                    <option value="salesperson">Salesperson</option>
                    <option value="accountant">Cashier / Accountant</option>
                    <option value="storekeeper">Storekeeper</option>
                    <option value="manager">Store Manager (Full Access)</option>
                    {isSuperAdmin && <option value="platform_ops">Platform Support Staff</option>}
                    {isSuperAdmin && <option value="superadmin">Platform Owner</option>}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Job Title</label>
                  <input
                    type="text"
                    value={formData.job_title}
                    onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                    placeholder="e.g. Weekend Cashier"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="0788 123 456"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {formData.role === 'manager' && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
                  <strong>Store Manager</strong> automatically gets full access to everything in the shop. To limit what a staff member can do, choose <strong>Shop Staff / Custom</strong> or a specific role above.
                </div>
              )}

              {isEditing && formData.role !== 'superadmin' && currentUser?.id !== editingUserId && (
                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-200">Account Access Status</p>
                    <p className="text-[11px] text-slate-400">
                      Pause access while they are away or on sick leave, without deleting their duties.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, is_active: Number(formData.is_active) === 1 ? 0 : 1 })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition shrink-0 ${
                      Number(formData.is_active) === 1
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {Number(formData.is_active) === 1 ? 'Active (Can Sign In)' : 'Paused (Blocked)'}
                  </button>
                </div>
              )}

              {isSuperAdmin && shops.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-300">Assigned Shop</label>
                  <select
                    value={formData.shop_id}
                    onChange={(e) => setFormData({ ...formData, shop_id: Number(e.target.value) })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    {shops.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.location})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Plain-Language Duties Checklist */}
              <div className="pt-3 border-t border-slate-800 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <label className="text-xs font-bold text-white uppercase tracking-wider">
                      What This Staff Member Can Do
                    </label>
                    <p className="text-[11px] text-slate-400">
                      {checkedCountInForm} of {ALL_SHOP_PERMISSION_KEYS.length} duties selected
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTemplateId('custom');
                        setFormData((prev: any) => ({ ...prev, ...buildPermissionMap({}, true) }));
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition"
                    >
                      Check All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTemplateId('empty');
                        setFormData((prev: any) => ({
                          ...prev,
                          role: prev.role === 'manager' ? 'employee' : prev.role,
                          ...EMPTY_PERMISSIONS
                        }));
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 font-semibold transition"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.name} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{group.name}</h4>
                      <p className="text-[10px] text-slate-400">{group.description}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                      {group.items.map((item) => {
                        const isLockedOwnerSetting =
                          item.key === 'can_edit_company_settings' &&
                          (formData.role === 'manager' || formData.role === 'superadmin');

                        return (
                          <label
                            key={item.key}
                            className={`flex items-start gap-2.5 p-2 rounded-lg bg-slate-900/80 transition border border-slate-800 ${
                              isLockedOwnerSetting ? 'opacity-90 cursor-not-allowed border-amber-500/30' : 'hover:bg-slate-800/80 cursor-pointer'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isLockedOwnerSetting ? true : Boolean(formData[item.key])}
                              disabled={isLockedOwnerSetting}
                              onChange={(e) => {
                                if (isLockedOwnerSetting) return;
                                setSelectedTemplateId('custom');
                                setFormData({ ...formData, [item.key]: e.target.checked });
                              }}
                              className="mt-0.5 rounded accent-amber-500"
                            />
                            <div className="leading-tight">
                              <span className="text-xs text-slate-200">{item.label}</span>
                              {isLockedOwnerSetting && (
                                <p className="text-[10px] text-amber-400 mt-0.5">
                                  Shop Owner / Manager always keeps this duty
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition"
                >
                  {isSubmitting ? 'Saving...' : isEditing ? 'Save Duty Changes' : 'Create Staff Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Reset Password Modal */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#131722] border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Reset Staff Password</h3>
                  <p className="text-xs text-slate-400">Set a temporary password for {resetModalUser.name}</p>
                </div>
              </div>
              <button
                onClick={() => setResetModalUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {resetError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                {resetError}
              </div>
            )}

            {resetSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                {resetSuccess}
              </div>
            )}

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  New Temporary Password *
                </label>
                <input
                  type="text"
                  required
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder="Enter new temporary password"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  They will be asked to set their own new password the next time they sign in.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetting || Boolean(resetSuccess)}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  {resetting ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
