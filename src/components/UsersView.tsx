import React, { useState, useEffect } from 'react';
import { User } from '../types';
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
  Lock 
} from 'lucide-react';

interface UsersViewProps {
  currentUser: User | null;
}

export const UsersView: React.FC<UsersViewProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'salesperson',
    job_title: 'Sales & POS Cashier',
    phone: '',
    can_create_orders: true,
    can_process_payments: true,
    can_manage_stock: false,
    can_release_stock: false,
    can_view_reports: false,
    can_view_buying_prices: false
  });
  const [modalError, setModalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.getUsers();
      setUsers(res.users || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.password) {
      setModalError('Name, Email, and Password are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError('');
      await api.createUser(newUser);
      setIsAddModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      setModalError(err.message || 'Failed to create user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              Staff & Role Permissions
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {users.length} Active Staff
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Storekeepers, sales clerks, finance accountants, and manager access controls.
          </p>
        </div>

        <button
          onClick={() => {
            setModalError('');
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add Staff Member</span>
        </button>
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((u) => (
          <div
            key={u.id}
            className="p-5 rounded-2xl bg-[#121620] border border-slate-800 hover:border-slate-700 transition space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 font-bold flex items-center justify-center">
                  {u.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{u.name}</h3>
                  <p className="text-xs text-slate-400">{u.job_title || u.role}</p>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-amber-400 border border-slate-700 uppercase">
                {u.role}
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono text-slate-300">{u.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono">{u.phone || '078...'}</span>
              </div>
            </div>

            {/* Permission Badges */}
            <div className="pt-2 border-t border-slate-800/60">
              <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1.5">Authorized Capabilities</p>
              <div className="flex flex-wrap gap-1">
                {u.can_create_orders && <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px]">POS Orders</span>}
                {u.can_process_payments && <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px]">Payments</span>}
                {u.can_manage_stock && <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px]">Stock Edits</span>}
                {u.can_release_stock && <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px]">Warehouse Dispatch</span>}
                {u.can_view_reports && <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[9px]">Reports</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Add New Staff Account</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Staff Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Eric Bizimana"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="eric@quincaille.rw"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Temporary Password *</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">System Role</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value as any })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="salesperson">Salesperson</option>
                    <option value="storekeeper">Storekeeper</option>
                    <option value="accountant">Accountant</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Job Title</label>
                  <input
                    type="text"
                    value={newUser.job_title}
                    onChange={(e) => setNewUser({ ...newUser, job_title: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Granular Permission Checkboxes */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">Assigned Permissions</label>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newUser.can_create_orders}
                      onChange={(e) => setNewUser({ ...newUser, can_create_orders: e.target.checked })}
                      className="rounded accent-amber-500"
                    />
                    <span>Create POS Orders</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newUser.can_process_payments}
                      onChange={(e) => setNewUser({ ...newUser, can_process_payments: e.target.checked })}
                      className="rounded accent-amber-500"
                    />
                    <span>Process Payments</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newUser.can_release_stock}
                      onChange={(e) => setNewUser({ ...newUser, can_release_stock: e.target.checked })}
                      className="rounded accent-amber-500"
                    />
                    <span>Release / Dispatch Stock</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newUser.can_view_reports}
                      onChange={(e) => setNewUser({ ...newUser, can_view_reports: e.target.checked })}
                      className="rounded accent-amber-500"
                    />
                    <span>View Financial Reports</span>
                  </label>
                </div>
              </div>

              {modalError && <p className="text-xs text-rose-400 font-semibold">{modalError}</p>}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  {isSubmitting ? 'Creating...' : 'Register Staff Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
