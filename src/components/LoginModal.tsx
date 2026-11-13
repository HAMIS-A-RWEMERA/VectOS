import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { User, Shop } from '../types';
import { 
  Lock, 
  Mail, 
  Store, 
  User as UserIcon, 
  Phone, 
  MapPin, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2,
  MessageCircle,
  Download,
  Smartphone,
  Sparkles
} from 'lucide-react';

interface LoginModalProps {
  onLoginSuccess: (user: User, shop: Shop) => void;
  onOpenAiHelp?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess, onOpenAiHelp }) => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // Clean login state without any hardcoded credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register Store state
  const [regStoreName, setRegStoreName] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regLocation, setRegLocation] = useState('Kigali, Rwanda');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // PWA Install state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showInstallHint, setShowInstallHint] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setIsInstallable(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setShowInstallHint((prev) => !prev);
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setInstalled(true);
      setShowInstallHint(false);
    }
    setDeferredPrompt(null);
  };

  const formatErr = (err: any): string => {
    if (!err) return 'An error occurred during authentication.';
    if (typeof err === 'string') return err;
    if (typeof err.message === 'string' && err.message.trim() && err.message !== '[object Object]') {
      return err.message;
    }
    if (typeof err.error === 'string' && err.error.trim()) {
      return err.error;
    }
    if (err.error && typeof err.error === 'object') {
      if (typeof err.error.message === 'string') return err.error.message;
      try {
        return JSON.stringify(err.error);
      } catch {}
    }
    return 'Invalid email or password or connection issue.';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      setSuccessMsg('');
      const res = await api.login(email.trim(), password);
      if (res.success) {
        onLoginSuccess(res.user, res.shop);
      }
    } catch (err: any) {
      setError(formatErr(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      setSuccessMsg('');
      const res = await api.register({
        storeName: regStoreName.trim(),
        ownerName: regOwnerName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        phone: regPhone.trim() || undefined,
        location: regLocation.trim() || undefined
      });

      if ((res as any).pendingApproval) {
        setSuccessMsg(
          'Store registered successfully! Your account is waiting for approval by the Platform Administrator (rwemera30@gmail.com). You will receive full access once approved.'
        );
        setRegStoreName('');
        setRegOwnerName('');
        setRegEmail('');
        setRegPassword('');
        setRegPhone('');
      } else if (res.success && res.user && res.shop) {
        setSuccessMsg('Store registered and activated successfully! Redirecting...');
        setTimeout(() => {
          onLoginSuccess(res.user, res.shop);
        }, 800);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to complete store registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md my-auto rounded-3xl bg-[#141923] border border-slate-700 shadow-2xl p-6 sm:p-8 space-y-5 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 mx-auto flex items-center justify-center shadow-xl shadow-amber-500/20 text-slate-950 font-black text-2xl">
            V
          </div>
          <h2 className="text-xl font-bold text-white font-display">VectOS Store Manager</h2>
          <p className="text-xs text-slate-400">Sales, Stock & Receipts for Hardware & Electronics Shops</p>
        </div>

        {/* Tab Toggle: Sign In vs Register Store */}
        <div className="flex rounded-xl bg-slate-900/90 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => { setActiveTab('login'); setError(''); setSuccessMsg(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
              activeTab === 'login'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/10'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('register'); setError(''); setSuccessMsg(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
              activeTab === 'register'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/10'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Register New Store
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Sign In Tab */}
        {activeTab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-300">Email Address</label>
              <div className="relative mt-1">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="name@company.rw"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
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
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 mt-4 cursor-pointer disabled:opacity-50"
            >
              <span>{loading ? 'Signing in...' : 'Sign In to Store'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Register Store Tab */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-300">Hardware / Electronics Store Name</label>
              <div className="relative mt-1">
                <Store className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Kigali Central Hardware Ltd"
                  value={regStoreName}
                  onChange={(e) => setRegStoreName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">Store Owner / Manager Name</label>
              <div className="relative mt-1">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Eric Mugisha"
                  value={regOwnerName}
                  onChange={(e) => setRegOwnerName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-300">Owner Work Email</label>
                <div className="relative mt-1">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="owner@company.rw"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Phone Number</label>
                <div className="relative mt-1">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="+250 788 000 000"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-300">Password</label>
                <div className="relative mt-1">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    placeholder="Min 6 chars"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Location</label>
                <div className="relative mt-1">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Kigali, Rwanda"
                    value={regLocation}
                    onChange={(e) => setRegLocation(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 mt-3 cursor-pointer"
            >
              <span>{loading ? 'Submitting Registration...' : 'Complete Registration & Submit'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Split Assistance: WhatsApp Customer Care (Half) & VectOS AI Assistant (Half) */}
        <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* WhatsApp Support Link */}
          <a
            href="https://wa.me/250781549993?text=Muraho%20VectOS%20Support%2C%20I%20need%20assistance%20with%20my%20store."
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-2.5 rounded-2xl bg-[#0F291E]/70 hover:bg-[#0F291E] border border-emerald-500/35 text-emerald-300 transition group cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition shrink-0">
                <MessageCircle className="w-4 h-4 fill-emerald-400 text-emerald-400" />
              </div>
              <div className="text-left min-w-0">
                <p className="text-xs font-bold text-emerald-200 truncate">WhatsApp</p>
                <p className="text-[10px] font-mono text-emerald-400 truncate">+250 781 549 993</p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-emerald-400 group-hover:translate-x-0.5 transition shrink-0">
              Chat &rarr;
            </span>
          </a>

          {/* VectOS AI Assistant (Kinyarwanda & English) */}
          <button
            type="button"
            onClick={onOpenAiHelp}
            className="flex items-center justify-between p-2.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/20 to-amber-600/25 hover:from-amber-500/25 hover:to-amber-600/35 border border-amber-500/40 text-amber-200 transition group cursor-pointer text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:scale-105 transition shrink-0">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-left min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-bold text-amber-200 truncate">VectOS AI</p>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/25 text-amber-300 font-bold uppercase">Quick</span>
                </div>
                <p className="text-[10px] text-amber-300/90 truncate">Kinyarwanda & English</p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-amber-400 group-hover:translate-x-0.5 transition shrink-0">
              Baza &rarr;
            </span>
          </button>
        </div>

        {/* PWA / Download & Add to Home Screen Option */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <button
              type="button"
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5 text-amber-400" />
              <span>{installed ? '✓ App Installed' : 'Install / Add to Home Screen'}</span>
            </button>
          </div>
          {showInstallHint && (
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 space-y-1">
              <p className="font-semibold text-amber-300">How to add this shop app to your phone:</p>
              <p>• <strong>iPhone / iPad (Safari):</strong> Tap the Share icon and choose &ldquo;Add to Home Screen&rdquo;.</p>
              <p>• <strong>Android (Chrome):</strong> Tap the three-dot menu and choose &ldquo;Install app&rdquo; or &ldquo;Add to Home Screen&rdquo;.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default LoginModal;
