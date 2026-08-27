import React, { useState } from 'react';
import { api } from '../services/api';
import { User, Shop } from '../types';
import { Lock, Mail, Shield, Sparkles, Store, ArrowRight, AlertCircle } from 'lucide-react';

interface LoginModalProps {
  onLoginSuccess: (user: User, shop: Shop) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('manager@quincaille.rw');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const demoAccounts = [
    { role: 'Store Owner / Manager', email: 'manager@quincaille.rw', pass: 'password123', tag: 'Full Control' },
    { role: 'Sales & POS Cashier', email: 'sales@quincaille.rw', pass: 'password123', tag: 'POS & Counter' },
    { role: 'Finance / Accountant', email: 'accountant@quincaille.rw', pass: 'password123', tag: 'Payments & Ledgers' },
    { role: 'Warehouse Storekeeper', email: 'storekeeper@quincaille.rw', pass: 'password123', tag: 'Inventory & Transfers' },
    { role: 'Platform SuperAdmin', email: 'admin@vectos.co.rw', pass: 'admin123', tag: 'Multi-Tenant' },
  ];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      const res = await api.login(email, password);
      if (res.success) {
        onLoginSuccess(res.user, res.shop);
      }
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async (demoEmail: string, roleCode: string) => {
    try {
      setLoading(true);
      setError('');
      const res = await api.demoSwitch(roleCode, demoEmail);
      if (res.success) {
        onLoginSuccess(res.user, res.shop);
      }
    } catch (err: any) {
      setError(err.message || 'Demo login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-[#141923] border border-slate-700 shadow-2xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 mx-auto flex items-center justify-center shadow-xl shadow-amber-500/20 text-slate-950 font-black text-2xl">
            V
          </div>
          <h2 className="text-xl font-bold text-white font-display">VectOS Retail ERP</h2>
          <p className="text-xs text-slate-400">Sign in to your Kigali hardware store account</p>
        </div>

        {/* 1-Click Fast Role Switcher */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>1-Click Test Role Access</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {demoAccounts.map((acc, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleQuickDemoLogin(acc.email, acc.role.toLowerCase())}
                className="w-full p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-left flex items-center justify-between transition group"
              >
                <div>
                  <p className="text-xs font-bold text-slate-200 group-hover:text-amber-300 transition">
                    {acc.role}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">{acc.email}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
                  {acc.tag} &rarr;
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-[10px] uppercase font-bold text-slate-400">Or Manual Sign-in</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-300">Email Address</label>
            <div className="relative mt-1">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300">Password</label>
            <div className="relative mt-1">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 mt-2"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
