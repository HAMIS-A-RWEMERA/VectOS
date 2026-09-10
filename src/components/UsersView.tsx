import React, { useState, useEffect } from 'react';
import { User, Shop } from '../types';
import { api } from '../services/api';
import { 
  Users, 
  Plus, 
  Shield, 
  Check, 
  Mail, 
  Phone, 
  Briefcase, 
  CheckCircle2, 
  Lock,
  Edit2,
  KeyRound,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  UserCheck,
  UserX,
  Search,
  Building2,
  BadgeAlert
} from 'lucide-react';

interface UsersViewProps {
  currentUser: User | null;
}

const PERMISSION_GROUPS = [
  {
    name: 'Sales & POS Counter',
    description: 'Bargaining, customer orders, and receipt generation',
    items: [
      { key: 'can_create_orders', label: 'Create POS Orders & Invoices' },
      { key: 'can_give_discounts', label: 'Grant Customer Discounts / Price Adjustments' },
      { key: 'can_print_full_receipt', label: 'Print EBM Official Receipts' },
      { key: 'can_print_delivery_note', label: 'Print Warehouse Delivery Notes / Waybills' },
      { key: 'can_void_orders', label: 'Void / Cancel Pending Orders' }
    ]
  },
  {
    name: 'Finance & Payments',
    description: 'Cash, MoMo, Bank transfers, and revenue metrics',
    items: [
      { key: 'can_process_payments', label: 'Accept & Approve Payments' },
      { key: 'can_view_reports', label: 'View Financial Sales & Profit Reports' },
      { key: 'can_view_buying_prices', label: 'View Supplier Buying Prices & Margins' }
    ]
  },
  {
    name: 'Warehouse & Inventory Logistics',
    description: 'Depot stock controls, dispatch, transfers, and imports',
    items: [
      { key: 'can_release_stock', label: 'Release / Dispatch Physical Goods from Warehouse' },
      { key: 'can_manage_stock', label: 'Adjust Stock & Inventory Quantities' },
      { key: 'can_import_export_stock', label: 'Bulk Import/Export Stock (CSV/Excel)' },
      { key: 'can_partner_borrow', label: 'Borrow Stock from Partner Hardware Shops' }
    ]
  },
  {
    name: 'CRM & Network Relations',
    description: 'Contractors, credit limits, and peer shop collaborations',
    items: [
      { key: 'can_manage_customers', label: 'Manage Customers & Credit Balances' },
      { key: 'can_manage_partners', label: 'Manage Hardware Partner Network' }
    ]
  },
  {
    name: 'Administration & Security Audit',
    description: 'Staff provisioning, password resets, and audit trail',
    items: [
      { key: 'can_manage_users', label: 'Manage Staff Accounts & Assign Roles' },
      { key: 'can_reset_passwords', label: 'Reset Employee Passwords' },
      { key: 'can_view_audit_trail', label: 'View Internal Audit Trail & Approval Logs' },
      { key: 'can_edit_company_settings', label: 'Edit Store Profile & Tax Info' }
    ]
  }
];

const ROLE_PRESETS = [
  {
    title: 'Sales & POS Cashier',
    role: 'salesperson',
    job_title: 'Sales & Counter Cashier',
    desc: 'Take counter orders, print receipts, and manage customer inquiries',
    permissions: {
      can_create_orders: true,
      can_process_payments: true,
      can_release_stock: false,
      can_manage_stock: false,
      can_import_export_stock: false,
      can_partner_borrow: false,
      can_view_reports: false,
      can_view_buying_prices: false,
      can_give_discounts: true,
      can_manage_users: false,
      can_print_full_receipt: true,
      can_print_delivery_note: true,
      can_manage_customers: true,
      can_manage_partners: false,
      can_void_orders: false,
      can_edit_company_settings: false,
      can_view_audit_trail: false,
      can_reset_passwords: false
    }
  },
  {
    title: 'Warehouse Storekeeper',
    role: 'storekeeper',
    job_title: 'Warehouse Storekeeper',
    desc: 'Verify payments, release physical stock, perform transfers & adjustments',
    permissions: {
      can_create_orders: false,
      can_process_payments: false,
      can_release_stock: true,
      can_manage_stock: true,
      can_import_export_stock: true,
      can_partner_borrow: true,
      can_view_reports: false,
      can_view_buying_prices: false,
      can_give_discounts: false,
      can_manage_users: false,
      can_print_full_receipt: false,
      can_print_delivery_note: true,
      can_manage_customers: false,
      can_manage_partners: true,
      can_void_orders: false,
      can_edit_company_settings: false,
      can_view_audit_trail: true,
      can_reset_passwords: false
    }
  },
  {
    title: 'Finance & Accountant',
    role: 'accountant',
    job_title: 'Finance Accountant',
    desc: 'Reconcile MoMo & Bank payments, generate EBM reports, check margins',
    permissions: {
      can_create_orders: true,
      can_process_payments: true,
      can_release_stock: false,
      can_manage_stock: false,
      can_import_export_stock: true,
      can_partner_borrow: false,
      can_view_reports: true,
      can_view_buying_prices: true,
      can_give_discounts: true,
      can_manage_users: false,
      can_print_full_receipt: true,
      can_print_delivery_note: true,
      can_manage_customers: true,
      can_manage_partners: true,
      can_void_orders: true,
      can_edit_company_settings: false,
      can_view_audit_trail: true,
      can_reset_passwords: false
    }
  },
  {
    title: 'Operations Manager',
    role: 'manager',
    job_title: 'Operations Manager',
    desc: 'Oversees daily shop workflow, inventory, staff duties, and approvals',
    permissions: {
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
      can_reset_passwords: true
    }
  },
  {
    title: 'PR & Customer Relations',
    role: 'employee',
    job_title: 'PR & Customer Relations Officer',
    desc: 'Client onboarding, credit accounts, partner relations, communications',
    permissions: {
      can_create_orders: true,
      can_process_payments: false,
      can_release_stock: false,
      can_manage_stock: false,
      can_import_export_stock: false,
      can_partner_borrow: true,
      can_view_reports: false,
      can_view_buying_prices: false,
      can_give_discounts: true,
      can_manage_users: false,
      can_print_full_receipt: true,
      can_print_delivery_note: false,
      can_manage_customers: true,
      can_manage_partners: true,
      can_void_orders: false,
      can_edit_company_settings: false,
      can_view_audit_trail: false,
      can_reset_passwords: false
    }
  }
];

export const UsersView: React.FC<UsersViewProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] = useState<any>({
    name: '',
    email: '',
    password: '',
    role: 'salesperson',
    job_title: 'Sales & POS Cashier',
    phone: '',
    shop_id: currentUser?.shop_id || 1,
    is_active: 1,
    can_create_orders: true,
    can_process_payments: true,
    can_release_stock: false,
    can_manage_stock: false,
    can_import_export_stock: false,
    can_partner_borrow: false,
    can_view_reports: false,
    can_view_buying_prices: false,
    can_give_discounts: true,
    can_manage_users: false,
    can_print_full_receipt: true,
    can_print_delivery_note: true,
    can_manage_customers: true,
    can_manage_partners: false,
    can_void_orders: false,
    can_edit_company_settings: false,
    can_view_audit_trail: false,
    can_reset_passwords: false
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
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'salesperson',
      job_title: 'Sales & POS Cashier',
      phone: '',
      shop_id: currentUser?.shop_id || 1,
      is_active: 1,
      can_create_orders: true,
      can_process_payments: true,
      can_release_stock: false,
      can_manage_stock: false,
      can_import_export_stock: false,
      can_partner_borrow: false,
      can_view_reports: false,
      can_view_buying_prices: false,
      can_give_discounts: true,
      can_manage_users: false,
      can_print_full_receipt: true,
      can_print_delivery_note: true,
      can_manage_customers: true,
      can_manage_partners: false,
      can_void_orders: false,
      can_edit_company_settings: false,
      can_view_audit_trail: false,
      can_reset_passwords: false
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (u: User) => {
    setIsEditing(true);
    setEditingUserId(u.id);
    setFormData({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      job_title: u.job_title || '',
      phone: u.phone || '',
      shop_id: u.shop_id || currentUser?.shop_id || 1,
      is_active: u.is_active !== undefined ? u.is_active : 1,
      can_create_orders: Boolean(u.can_create_orders),
      can_process_payments: Boolean(u.can_process_payments),
      can_release_stock: Boolean(u.can_release_stock),
      can_manage_stock: Boolean(u.can_manage_stock),
      can_import_export_stock: Boolean(u.can_import_export_stock),
      can_partner_borrow: Boolean(u.can_partner_borrow),
      can_view_reports: Boolean(u.can_view_reports),
      can_view_buying_prices: Boolean(u.can_view_buying_prices),
      can_give_discounts: Boolean(u.can_give_discounts),
      can_manage_users: Boolean(u.can_manage_users),
      can_print_full_receipt: Boolean(u.can_print_full_receipt),
      can_print_delivery_note: Boolean(u.can_print_delivery_note),
      can_manage_customers: Boolean(u.can_manage_customers),
      can_manage_partners: Boolean(u.can_manage_partners),
      can_void_orders: Boolean(u.can_void_orders),
      can_edit_company_settings: Boolean(u.can_edit_company_settings),
      can_view_audit_trail: Boolean(u.can_view_audit_trail),
      can_reset_passwords: Boolean(u.can_reset_passwords)
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const applyPreset = (preset: typeof ROLE_PRESETS[0]) => {
    setFormData({
      ...formData,
      role: preset.role,
      job_title: preset.job_title,
      ...preset.permissions
    });
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      setModalError('Name and Email are required.');
      return;
    }
    if (!isEditing && !formData.password) {
      setModalError('Temporary password is required for new accounts.');
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError('');
      if (isEditing && editingUserId) {
        await api.updateUser(editingUserId, formData);
      } else {
        await api.createUser(formData);
      }
      setIsModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save staff member details.');
    } finally {
      setIsSubmitting(false);
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
      setResetError(err.message || 'Failed to reset employee password');
    } finally {
      setResetting(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) || 
                          u.email.toLowerCase().includes(search.toLowerCase()) ||
                          (u.job_title && u.job_title.toLowerCase().includes(search.toLowerCase()));
    const matchesRole = filterRole === 'all' || u.role === filterRole;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              Team RBAC & Dynamic Permissions
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {users.length} Total Accounts
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Configure flexible daily responsibilities for storekeepers, cashiers, sales clerks, PR, and accountants.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add Employee Account</span>
        </button>
      </div>

      {/* Two-Tier RBAC Architecture Explainer Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-[#141A26] to-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              Two-Tier Architectural RBAC Model
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-mono">LIVE ENFORCED</span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              <strong className="text-amber-400 font-semibold">Tier 1 (SuperAdmin):</strong> VectOS Platform Owner with multi-shop governance, tenant provisioning, and full system bypass.&nbsp;
              <strong className="text-slate-200 font-semibold">Tier 2 (Store Owner / Manager):</strong> Granular checkboxes per staff account, enabling dynamic shift changes (e.g. storekeeper + cashier on weekend shifts).
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            placeholder="Search by name, email, or job title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {['all', 'manager', 'salesperson', 'accountant', 'storekeeper', 'employee'].map((r) => (
            <button
              key={r}
              onClick={() => setFilterRole(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition ${
                filterRole === r
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/10'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {r === 'all' ? 'All Roles' : r}
            </button>
          ))}
        </div>
      </div>

      {/* Users Grid */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs">Loading staff accounts...</div>
      ) : filteredUsers.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-xs rounded-2xl bg-slate-900/50 border border-slate-800">
          No staff accounts found matching filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((u) => {
            const activePermCount = [
              u.can_create_orders,
              u.can_process_payments,
              u.can_release_stock,
              u.can_manage_stock,
              u.can_import_export_stock,
              u.can_partner_borrow,
              u.can_view_reports,
              u.can_view_buying_prices,
              u.can_give_discounts,
              u.can_manage_users,
              u.can_print_full_receipt,
              u.can_print_delivery_note,
              u.can_manage_customers,
              u.can_manage_partners,
              u.can_void_orders,
              u.can_view_audit_trail,
              u.can_reset_passwords
            ].filter(Boolean).length;

            return (
              <div
                key={u.id}
                className="p-5 rounded-2xl bg-[#121620] border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-4 shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-base">
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white">{u.name}</h3>
                          {u.force_password_change === 1 && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-400 font-semibold" title="Must change password upon next login">
                              Pwd Reset Pending
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">{u.job_title || u.role}</p>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      u.role === 'superadmin' 
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                        : u.role === 'manager'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}>
                      {u.role}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-400 pt-3 mt-3 border-t border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      <span className="font-mono text-slate-300 truncate">{u.email}</span>
                    </div>
                    {u.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span className="font-mono text-slate-400">{u.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Permission Count & Highlights */}
                  <div className="pt-3 mt-3 border-t border-slate-800/60">
                    <div className="flex items-center justify-between text-[11px] mb-2">
                      <span className="text-slate-400 font-semibold">Active Capabilities</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-amber-400 font-bold text-[10px]">
                        {u.role === 'superadmin' ? 'ALL BYPASS' : `${activePermCount} / 17 Granted`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {u.can_create_orders && <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">POS Orders</span>}
                      {u.can_process_payments && <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 text-[10px] border border-emerald-800/40">Approve Payments</span>}
                      {u.can_release_stock && <span className="px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 text-[10px] border border-blue-800/40">Release Stock</span>}
                      {u.can_manage_stock && <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">Stock Edit</span>}
                      {u.can_view_reports && <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">Finance Reports</span>}
                      {u.can_view_audit_trail && <span className="px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 text-[10px] border border-amber-800/40">Audit Trail</span>}
                      {u.can_partner_borrow && <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">Partner Borrow</span>}
                    </div>
                  </div>
                </div>

                {/* Bottom Card Actions: Edit Permissions & Reset Password */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenEditModal(u)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Edit Permissions</span>
                  </button>

                  <button
                    onClick={() => {
                      setResetModalUser(u);
                      setTempPassword('quincaille2026');
                      setResetError('');
                      setResetSuccess('');
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-amber-500/10 border border-slate-700/60 hover:border-amber-500/30 text-amber-300 text-xs font-semibold transition"
                    title="Reset password for this employee"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Reset Pass</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 lg:p-6 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-[#131722] border border-slate-700 shadow-2xl p-5 lg:p-6 space-y-5 animate-in fade-in zoom-in-95 my-auto max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isEditing ? `Edit Staff Account & Permissions` : `Register New Staff Account`}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Customize role, title, and granular functional capabilities.
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

            {/* 1-Click Role Presets */}
            <div className="space-y-1.5 shrink-0">
              <label className="text-xs font-semibold text-slate-300 block">
                Quick Role Presets (Click to autofill recommended responsibility checklist)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {ROLE_PRESETS.map((preset) => (
                  <button
                    key={preset.title}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 text-left transition"
                  >
                    <p className="text-[11px] font-bold text-amber-400">{preset.title}</p>
                    <p className="text-[9px] text-slate-400 truncate mt-0.5">{preset.desc}</p>
                  </button>
                ))}
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
                  <label className="text-xs font-semibold text-slate-300">Staff Full Name *</label>
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
                  <label className="text-xs font-semibold text-slate-300">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="eric@quincaille.rw"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {!isEditing && (
                <div>
                  <label className="text-xs font-semibold text-slate-300">Initial Temporary Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Employee will be prompted to change their password upon their first login.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">System Role Archetype</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="salesperson">Salesperson / Cashier</option>
                    <option value="storekeeper">Warehouse Storekeeper</option>
                    <option value="accountant">Finance Accountant</option>
                    <option value="manager">Store Manager</option>
                    <option value="employee">PR & Communications Officer</option>
                    {isSuperAdmin && <option value="superadmin">Platform SuperAdmin</option>}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Job Title / Badge</label>
                  <input
                    type="text"
                    value={formData.job_title}
                    onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                    placeholder="e.g. Chief Storekeeper"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Phone Number (MTN/Airtel)</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="0788 123 456"
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {isSuperAdmin && shops.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-300">Assign to Shop / Tenant</label>
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

              {/* Granular Responsibility Checklist Categories */}
              <div className="pt-3 border-t border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white uppercase tracking-wider">
                    Granular Functional Responsibilities
                  </label>
                  <span className="text-[11px] text-amber-400 font-semibold">
                    Dynamic check/uncheck
                  </span>
                </div>

                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.name} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{group.name}</h4>
                      <p className="text-[10px] text-slate-400">{group.description}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                      {group.items.map((item) => (
                        <label
                          key={item.key}
                          className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800/80 cursor-pointer transition border border-slate-800"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(formData[item.key])}
                            onChange={(e) => setFormData({ ...formData, [item.key]: e.target.checked })}
                            className="mt-0.5 rounded accent-amber-500"
                          />
                          <span className="text-xs text-slate-200 leading-tight">{item.label}</span>
                        </label>
                      ))}
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
                  {isSubmitting ? 'Saving...' : isEditing ? 'Update Staff Permissions' : 'Register Staff Account'}
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
                  <p className="text-xs text-slate-400">Admin override for {resetModalUser.name}</p>
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
                  The employee will be forced to change this temporary password the next time they log in.
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
                  {resetting ? 'Resetting...' : 'Confirm Password Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
