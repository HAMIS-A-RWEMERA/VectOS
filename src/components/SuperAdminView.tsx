import React, { useState, useEffect } from 'react';
import { Shop, User } from '../types';
import { api } from '../services/api';
import { 
  Building, 
  Plus, 
  Store, 
  CreditCard, 
  CheckCircle2, 
  ExternalLink, 
  Users, 
  Boxes, 
  MapPin, 
  Phone, 
  Mail,
  ShieldAlert,
  ShieldCheck,
  Crown,
  Clock,
  Sparkles,
  Zap,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter
} from 'lucide-react';
import { matchesSearch } from '../utils/searchMatch';
import { useLanguage } from '../i18n/LanguageContext';

interface SuperAdminViewProps {
  currentUser: User | null;
  activeShop: Shop | null;
  onSwitchShop: (shopId: number) => void;
}

export const SuperAdminView: React.FC<SuperAdminViewProps> = ({
  currentUser,
  activeShop,
  onSwitchShop
}) => {
  const { tf } = useLanguage();
  const [shops, setShops] = useState<Shop[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'shops' | 'approvals' | 'users'>('shops');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'pending' | 'suspended'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Mode settings
  const [autoApproveNewStores, setAutoApproveNewStores] = useState(false);
  const [pendingShopsCount, setPendingShopsCount] = useState(0);
  const [pendingUsersCount, setPendingUsersCount] = useState(0);

  // Notification / Feedback banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Provisioning Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newShop, setNewShop] = useState({
    name: '',
    code: '',
    owner_name: '',
    phone: '',
    email: '',
    location: 'Kigali, Rwanda',
    tin_number: '',
    business_type: 'Hardware & Electronics',
    subscription_plan: 'Standard Depot'
  });
  const [modalError, setModalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (currentUser) {
      loadAllData();
    }
  }, [currentUser]);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [shopsRes, settingsRes, usersRes] = await Promise.all([
        api.getShops().catch(() => ({ shops: [] })),
        api.getAdminSettings().catch(() => ({ autoApproveNewStores: false, pendingShopsCount: 0, pendingUsersCount: 0 })),
        api.getUsers().catch(() => ({ users: [] }))
      ]);

      const loadedShops = shopsRes.shops || [];
      setShops(loadedShops);
      setAutoApproveNewStores(settingsRes.autoApproveNewStores);
      setUsers(usersRes.users || []);

      // Calculate pending counts accurately
      const pShops = loadedShops.filter((s: Shop) => s.status === 'pending');
      const pUsers = (usersRes.users || []).filter((u: User) => u.activation_status === 'pending_approval');
      setPendingShopsCount(pShops.length);
      setPendingUsersCount(pUsers.length);
    } catch (err: any) {
      console.error('Error loading superadmin portal data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Toggle Auto-Approve Onboarding Mode (Strict Big Boss vs Testing Mode)
  const handleToggleAutoApprove = async () => {
    const nextVal = !autoApproveNewStores;
    try {
      setActionLoading(true);
      await api.updateAdminSettings(nextVal);
      setAutoApproveNewStores(nextVal);
      showFeedback(
        'success',
        nextVal 
          ? tf('⚡ Testing Mode Activated: Newly registered stores will now automatically be active without waiting.', '⚡ Uburyo bw’Igerageza Bufunguwe: Amaduka mashya yiyandikishije azajya ahita akora ako kanya.')
          : tf('🛡️ Strict Big Boss Review Mode Activated: Newly registered stores will now require your manual acceptance.', '🛡️ Igenzura rya Nyir’Urubuga Rifunguwe: Amaduka mashya azajya abanza kwemezwa nawe mbere yo gukora.')
      );
    } catch (err: any) {
      showFeedback('error', err.message || tf('Failed to update platform settings', 'Guhindura amagenamiterere byanze'));
    } finally {
      setActionLoading(false);
    }
  };

  // Big Boss Action: Approve Store
  const handleApproveStore = async (shopId: number, shopName: string) => {
    try {
      setActionLoading(true);
      await api.updateShopStatus(shopId, 'active');
      showFeedback('success', tf(`✅ Store "${shopName}" accepted & fully activated! Store owner can now log in.`, `✅ Iduka "${shopName}" ryemejwe kandi ritangiye gukora! Nyir’iduka ashobora kwinjira.`));
      await loadAllData();
    } catch (err: any) {
      showFeedback('error', err.message || tf('Failed to accept store', 'Kwemeza iduka byanze'));
    } finally {
      setActionLoading(false);
    }
  };

  // Big Boss Action: Suspend Store
  const handleSuspendStore = async (shopId: number, shopName: string) => {
    if (!confirm(tf(`Are you sure you want to suspend "${shopName}"? Store users will be temporarily locked.`, `Uremeza neza guhagarika "${shopName}"? Abakozi baryo ntibazashobora kwinjira by’agateganyo.`))) {
      return;
    }
    try {
      setActionLoading(true);
      await api.updateShopStatus(shopId, 'suspended');
      showFeedback('success', tf(`⏸️ Store "${shopName}" suspended.`, `⏸️ Iduka "${shopName}" ryahagaritswe.`));
      await loadAllData();
    } catch (err: any) {
      showFeedback('error', err.message || tf('Failed to suspend store', 'Guhagarika iduka byanze'));
    } finally {
      setActionLoading(false);
    }
  };

  // Big Boss Action: Approve User Account
  const handleApproveUser = async (userId: number, userName: string) => {
    try {
      setActionLoading(true);
      await api.updateUserStatus(userId, 'active');
      showFeedback('success', tf(`✅ User account "${userName}" approved & activated!`, `✅ Konti ya "${userName}" yemejwe kandi itangiye gukora!`));
      await loadAllData();
    } catch (err: any) {
      showFeedback('error', err.message || tf('Failed to approve user account', 'Kwemeza konti y’umukoresha byanze'));
    } finally {
      setActionLoading(false);
    }
  };

  // Big Boss Action: Suspend User Account
  const handleSuspendUser = async (userId: number, userName: string) => {
    try {
      setActionLoading(true);
      await api.updateUserStatus(userId, 'suspended');
      showFeedback('success', tf(`⏸️ User account "${userName}" suspended.`, `⏸️ Konti ya "${userName}" yahagaritswe.`));
      await loadAllData();
    } catch (err: any) {
      showFeedback('error', err.message || tf('Failed to suspend user account', 'Guhagarika konti byanze'));
    } finally {
      setActionLoading(false);
    }
  };

  // Big Boss Action: 1-Click Approve All Pending
  const handleApproveAllPending = async () => {
    try {
      setActionLoading(true);
      const res = await api.approveAllPending();
      showFeedback('success', res.message || tf('All pending stores and accounts have been approved!', 'Amaduka na konti byose byari bitegereje byemejwe!'));
      await loadAllData();
    } catch (err: any) {
      showFeedback('error', err.message || tf('Failed to approve pending items', 'Kwemeza ibitegereje byanze'));
    } finally {
      setActionLoading(false);
    }
  };

  // Provision Store Modal Submit
  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShop.name || !newShop.code || !newShop.owner_name) {
      setModalError(tf('Store Name, Code, and Owner Name are required.', 'Izina ry’iduka, Kode, n’Izina rya Nyiraryo birakenewe.'));
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError('');
      await api.createShop(newShop);
      setIsAddModalOpen(false);
      showFeedback('success', tf(`Store "${newShop.name}" provisioned successfully!`, `Iduka "${newShop.name}" ryashyizweho neza!`));
      setNewShop({
        name: '',
        code: '',
        owner_name: '',
        phone: '',
        email: '',
        location: 'Kigali, Rwanda',
        tin_number: '',
        business_type: 'Hardware & Electronics',
        subscription_plan: 'Standard Depot'
      });
      loadAllData();
    } catch (err: any) {
      setModalError(err.message || tf('Failed to provision tenant shop.', 'Gushyiraho iduka rishya byanze.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  // Filtered lists
  const pendingShops = shops.filter(s => s.status === 'pending');
  const pendingUsers = users.filter(u => u.activation_status === 'pending_approval');
  const totalPending = pendingShops.length + pendingUsers.length;

  const filteredShops = shops.filter(s => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    return matchesSearch(searchQuery, s.name, s.owner_name, s.email, s.code, s.phone, s.location);
  });

  const filteredUsers = users.filter(u =>
    matchesSearch(searchQuery, u.name, u.email, u.shop_name, u.role, u.job_title)
  );

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Platform Big Boss Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-950/70 via-slate-900 to-slate-950 border border-amber-500/40 p-6 sm:p-8 shadow-2xl shadow-amber-950/30">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30 flex items-center justify-center">
                <Crown className="w-5 h-5 fill-slate-950" />
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight font-display flex items-center gap-2">
                {tf('Platform Big Boss Control Center', 'Ibiro Bikuru bya Nyir’Urubuga')}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                SuperAdmin
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              {tf('Signed in as', 'Winjiye nka')} <strong className="text-amber-400 font-mono">{currentUser?.email || 'rwemera30@gmail.com'}</strong>.{' '}
              {tf('You have global authority to review, accept, and manage stores and user accounts across all hardware depots.', 'Ufite ububasha bwose bwo kugenzura, kwemeza, no gucunga amaduka n’abakozi bose mu rubuga.')}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300">
                <Store className="w-3.5 h-3.5 text-amber-400" />
                <span>{tf(`${shops.length} Hardware Tenants`, `Amaduka ${shops.length}`)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>{tf(`${users.length} Registered Accounts`, `Konti ${users.length} Ziyandikishije`)}</span>
              </span>
              {totalPending > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/20 border border-amber-500/40 text-xs text-amber-300 font-bold animate-pulse">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>{tf(`${totalPending} Awaiting Your Acceptance`, `${totalPending} Bitegereje Kwemezwa`)}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-xs text-emerald-300 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{tf('All Clear • No Pending Review', 'Byose Bimeze Neza • Nta Bitegereje')}</span>
                </span>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            {totalPending > 0 && (
              <button
                onClick={handleApproveAllPending}
                disabled={actionLoading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                <span>{tf(`Accept All Pending (${totalPending})`, `Emeza Byose Bitegereje (${totalPending})`)}</span>
              </button>
            )}

            <button
              onClick={() => {
                setModalError('');
                setIsAddModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{tf('Provision New Store', 'Fungura Iduka Rishya')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Toast Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Onboarding Mode Control Card (Testing vs Strict Acceptance) */}
      <div className="p-5 rounded-2xl bg-[#121620] border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              autoApproveNewStores 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}>
              {autoApproveNewStores ? <Zap className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">{tf('Store Registration Approval Mode', 'Uburyo bwo Kwemeza Amaduka Mashya')}</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                  autoApproveNewStores
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                }`}>
                  {autoApproveNewStores
                    ? tf('Testing / Launch Mode (Auto-Approve)', 'Uburyo bw’Igerageza (Kwemezwa Ako Kanya)')
                    : tf('Big Boss Review (Manual Approval)', 'Igenzura rya Nyir’Urubuga (Kwemezwa nawe)')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                {autoApproveNewStores ? (
                  <>
                    <strong className="text-amber-300">{tf('Fast-Track Mode is ON:', 'Uburyo Bwihuse Burafunguye:')}</strong>{' '}
                    {tf('Anyone registering a new store will be immediately activated so you and your clients can test without waiting. You can still suspend or manage them anytime.', 'Uwiyandikishije wese ahita akora ako kanya kugira ngo mubashe kugerageza mutategereje. Ushobora guhagarika iduka igihe icyo ari cyo cyose.')}
                  </>
                ) : (
                  <>
                    <strong className="text-blue-300">{tf('Strict Acceptance is ON:', 'Igenzura Rikomeye Rirafunguye:')}</strong>{' '}
                    {tf('Newly registered stores start as Pending. You (the Big Boss) review and click Accept below before the store owner can access the system.', 'Amaduka mashya abanza gutegereza. Ubanza kuyagenzura ukanda Emeza hasi mbere y’uko nyir’iduka yinjira muri sisitemu.')}
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={handleToggleAutoApprove}
            disabled={actionLoading}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
              autoApproveNewStores
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
            }`}
          >
            <span>{autoApproveNewStores ? tf('Switch to Strict Review', 'Simburanya uje ku Igenzura Rikomeye') : tf('Switch to Testing Auto-Approve', 'Simburanya uje ku Kwemeza Ako Kanya')}</span>
          </button>
        </div>
      </div>

      {/* Priority Pending Approvals Alert Section */}
      {pendingShops.length > 0 && (
        <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-500/40 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <h3 className="text-sm font-bold text-amber-300">
                {tf(`Action Required: ${pendingShops.length} Store Registration(s) Awaiting Your Acceptance`, `Birakenewe: Amaduka ${pendingShops.length} Ategereje Kwemezwa Nawe`)}
              </h3>
            </div>
            <button
              onClick={handleApproveAllPending}
              disabled={actionLoading}
              className="text-xs text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
            >
              {tf('Approve All Pending', 'Emeza Yose Ategereje')} &rarr;
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingShops.map((shop) => (
              <div
                key={shop.id}
                className="p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-3 shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">{shop.name}</h4>
                    <p className="text-[11px] font-mono text-amber-400">{tf('Code:', 'Kode:')} {shop.code}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                    {tf('Pending', 'Ritegereje')}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-slate-300">
                  <p>👤 {tf('Owner:', 'Nyiraryo:')} <strong className="text-white">{shop.owner_name}</strong></p>
                  <p>📧 {tf('Email:', 'Imeyili:')} <span className="font-mono text-slate-300">{shop.email}</span></p>
                  <p>📞 {tf('Phone:', 'Telefoni:')} <span className="font-mono text-slate-300">{shop.phone}</span></p>
                  <p>📍 {tf('Location:', 'Aho riri:')} <span>{shop.location}</span></p>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleApproveStore(shop.id, shop.name)}
                    disabled={actionLoading}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{tf('Accept & Activate', 'Emeza & Fungura')}</span>
                  </button>

                  <button
                    onClick={() => handleSuspendStore(shop.id, shop.name)}
                    disabled={actionLoading}
                    className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                  >
                    <span>{tf('Reject', 'Anga')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-Tab Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('shops')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeSubTab === 'shops'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>{tf(`Hardware Tenants (${shops.length})`, `Amaduka (${shops.length})`)}</span>
          </button>

          <button
            onClick={() => setActiveSubTab('approvals')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeSubTab === 'approvals'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{tf('Pending Approvals', 'Ibitegereje Kwemezwa')}</span>
            {totalPending > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeSubTab === 'approvals' ? 'bg-slate-950 text-amber-400' : 'bg-amber-500 text-slate-950'
              }`}>
                {totalPending}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('users')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeSubTab === 'users'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{tf(`User Accounts (${users.length})`, `Konti z’Abakoresha (${users.length})`)}</span>
          </button>
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={tf('Search by name, email, code...', 'Shakisha izina, imeyili, kode...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 w-48 sm:w-64"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-white transition"
                title={tf('Clear search', 'Siba ishakisha')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={loadAllData}
            title={tf('Refresh Directory', 'Vugurura Urutonde')}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* TAB 1: HARDWARE TENANT STORES */}
      {activeSubTab === 'shops' && (
        <div className="space-y-4">
          {/* Status Filter Chips */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 text-[11px] font-semibold">{tf('Filter:', 'Shungura:')}</span>
            {([
              { id: 'all', label: tf('All', 'Byose') },
              { id: 'active', label: tf('Active', 'Bikora') },
              { id: 'pending', label: tf('Pending', 'Bitegereje') },
              { id: 'suspended', label: tf('Suspended', 'Byahagaritswe') },
            ] as const).map((st) => (
              <button
                key={st.id}
                onClick={() => setFilterStatus(st.id)}
                className={`px-3 py-1 rounded-lg capitalize font-semibold transition ${
                  filterStatus === st.id
                    ? 'bg-slate-200 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white bg-slate-900/80 border border-slate-800'
                }`}
              >
                {st.label} ({st.id === 'all' ? shops.length : shops.filter(s => s.status === st.id).length})
              </button>
            ))}
          </div>

          {/* Shops Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredShops.map((shop) => {
              const isActiveContext = activeShop?.id === shop.id;

              return (
                <div
                  key={shop.id}
                  className={`p-5 rounded-2xl border transition space-y-4 ${
                    isActiveContext
                      ? 'bg-amber-500/10 border-amber-500/50 shadow-xl shadow-amber-500/10'
                      : shop.status === 'pending'
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : shop.status === 'suspended'
                      ? 'bg-rose-950/10 border-rose-500/30'
                      : 'bg-[#121620] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                        <Store className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">{shop.name}</h3>
                        <p className="text-[11px] font-mono text-slate-400">{tf('Code:', 'Kode:')} {shop.code} • TIN: {shop.tin_number || 'N/A'}</p>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                        shop.status === 'active'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : shop.status === 'pending'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {shop.status === 'active' ? tf('active', 'rikora') : shop.status === 'pending' ? tf('pending', 'ritegereje') : tf('suspended', 'ryahagaritswe')}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{shop.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono text-slate-300">{shop.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono text-slate-300 truncate">{shop.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{tf('Owner:', 'Nyiraryo:')} <strong className="text-slate-200">{shop.owner_name}</strong></span>
                    </div>
                  </div>

                  {/* Stats Summary */}
                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center text-xs">
                    <div>
                      <p className="text-[10px] text-slate-400">{tf('Staff', 'Abakozi')}</p>
                      <p className="font-bold text-white mt-0.5">{shop.user_count || 0}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">{tf('Products', 'Ibicuruzwa')}</p>
                      <p className="font-bold text-amber-400 mt-0.5">{shop.product_count || 0}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">{tf('Revenue', 'Inyungu / Ibyaguzwe')}</p>
                      <p className="font-bold text-emerald-400 font-mono mt-0.5">{formatRwf(shop.total_revenue || 0)}</p>
                    </div>
                  </div>

                  {/* Big Boss Status & Context Actions */}
                  <div className="pt-2 border-t border-slate-800/60 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      {shop.status === 'pending' ? (
                        <button
                          onClick={() => handleApproveStore(shop.id, shop.name)}
                          disabled={actionLoading}
                          className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{tf('Accept Store', 'Emeza Iduka')}</span>
                        </button>
                      ) : shop.status === 'active' ? (
                        <button
                          onClick={() => handleSuspendStore(shop.id, shop.name)}
                          disabled={actionLoading}
                          className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 text-[11px] font-semibold border border-slate-700 transition cursor-pointer"
                        >
                          {tf('Suspend Store', 'Hagarika Iduka')}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleApproveStore(shop.id, shop.name)}
                          disabled={actionLoading}
                          className="py-1 px-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-bold border border-emerald-500/40 transition cursor-pointer"
                        >
                          {tf('Re-Activate', 'Subiraho')}
                        </button>
                      )}

                      {isActiveContext ? (
                        <span className="text-xs font-bold text-amber-400 flex items-center gap-1 py-1">
                          <CheckCircle2 className="w-4 h-4" /> {tf('Active Context', 'Iduka Rikora Ubu')}
                        </span>
                      ) : (
                        <button
                          onClick={() => onSwitchShop(shop.id)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 hover:text-white border border-slate-700 transition cursor-pointer"
                        >
                          {tf('Switch Context', 'Jya muri iri Duka')} &rarr;
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: PENDING APPROVALS QUEUE */}
      {activeSubTab === 'approvals' && (
        <div className="space-y-6">
          {/* Pending Stores Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Store className="w-4 h-4 text-amber-400" />
                <span>{tf(`Pending Store Registrations (${pendingShops.length})`, `Amaduka Mashya Ategereje Kwemezwa (${pendingShops.length})`)}</span>
              </h3>
              {pendingShops.length > 0 && (
                <button
                  onClick={handleApproveAllPending}
                  disabled={actionLoading}
                  className="text-xs font-bold text-emerald-400 hover:underline cursor-pointer"
                >
                  {tf('Accept All Stores', 'Emeza Amaduka Yose')} &rarr;
                </button>
              )}
            </div>

            {pendingShops.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#121620] border border-slate-800 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-sm font-bold text-slate-200">{tf('No Pending Store Registrations', 'Nta Duka Ritegereje Kwemezwa')}</p>
                <p className="text-xs text-slate-400">{tf('All registered hardware stores have been accepted or activated.', 'Amaduka yose yiyandikishije yaremejwe kandi arakora.')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingShops.map((shop) => (
                  <div key={shop.id} className="p-5 rounded-2xl bg-[#121620] border border-amber-500/40 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-white">{shop.name}</h4>
                        <p className="text-[11px] font-mono text-amber-400">{tf('Code:', 'Kode:')} {shop.code}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase animate-pulse">
                        {tf('Awaiting Big Boss', 'Ritegereje Wowe')}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-slate-300">
                      <p>👤 {tf('Owner:', 'Nyiraryo:')} <strong className="text-white">{shop.owner_name}</strong></p>
                      <p>📧 {tf('Email:', 'Imeyili:')} <span className="font-mono text-slate-300">{shop.email}</span></p>
                      <p>📞 {tf('Phone:', 'Telefoni:')} <span className="font-mono text-slate-300">{shop.phone}</span></p>
                      <p>📍 {tf('Location:', 'Aho riri:')} <span>{shop.location}</span></p>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                      <button
                        onClick={() => handleApproveStore(shop.id, shop.name)}
                        disabled={actionLoading}
                        className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>{tf('Accept & Activate', 'Emeza & Fungura')}</span>
                      </button>
                      <button
                        onClick={() => handleSuspendStore(shop.id, shop.name)}
                        disabled={actionLoading}
                        className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                      >
                        {tf('Reject', 'Anga')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending User Accounts Section */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              <span>{tf(`Pending User / Staff Accounts (${pendingUsers.length})`, `Konti z’Abakozi Zitegereje (${pendingUsers.length})`)}</span>
            </h3>

            {pendingUsers.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#121620] border border-slate-800 text-center">
                <p className="text-xs text-slate-400">{tf('All user and manager accounts are currently active.', 'Konti zose z’abakoresha n’abayobozi zirakora neza.')}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 overflow-hidden bg-[#121620]">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900/80 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-3">{tf('User Name', 'Izina')}</th>
                      <th className="p-3">{tf('Email', 'Imeyili')}</th>
                      <th className="p-3">{tf('Store', 'Iduka')}</th>
                      <th className="p-3">{tf('Role', 'Inshingano')}</th>
                      <th className="p-3 text-right">{tf('Actions', 'Ibikorwa')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {pendingUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-900/40">
                        <td className="p-3 font-bold text-white">{u.name}</td>
                        <td className="p-3 font-mono text-slate-300">{u.email}</td>
                        <td className="p-3 text-slate-300">{u.shop_name || tf(`Store #${u.shop_id}`, `Iduka #${u.shop_id}`)}</td>
                        <td className="p-3 capitalize font-semibold text-amber-400">{u.role}</td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            onClick={() => handleApproveUser(u.id, u.name)}
                            disabled={actionLoading}
                            className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                          >
                            {tf('Accept Account', 'Emeza Konti')}
                          </button>
                          <button
                            onClick={() => handleSuspendUser(u.id, u.name)}
                            disabled={actionLoading}
                            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
                          >
                            {tf('Decline', 'Anga')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PLATFORM USER ACCOUNTS DIRECTORY */}
      {activeSubTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">{tf('Platform Staff & Store Managers', 'Abakozi bose & Abayobozi b’Amaduka')}</h3>
              <p className="text-xs text-slate-400">{tf('All registered users across every tenant hardware store.', 'Abakoresha bose biyandikishije mu maduka yose.')}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 overflow-hidden bg-[#121620]">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-900/80 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">{tf('Name', 'Izina')}</th>
                  <th className="p-3.5">{tf('Email', 'Imeyili')}</th>
                  <th className="p-3.5">{tf('Store / Depot', 'Iduka / Depo')}</th>
                  <th className="p-3.5">{tf('Role', 'Inshingano')}</th>
                  <th className="p-3.5">{tf('Status', 'Imimerere')}</th>
                  <th className="p-3.5 text-right">{tf('Big Boss Action', 'Igikorwa cya Nyir’Urubuga')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredUsers.map((u) => {
                  const isUserActive = u.is_active === 1 && u.activation_status === 'active';
                  const isUserPending = u.activation_status === 'pending_approval';

                  return (
                    <tr key={u.id} className="hover:bg-slate-900/40 transition">
                      <td className="p-3.5 font-bold text-white flex items-center gap-2">
                        {u.role === 'superadmin' && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                        <span>{u.name}</span>
                      </td>
                      <td className="p-3.5 font-mono text-slate-300">{u.email}</td>
                      <td className="p-3.5 text-slate-300">
                        {u.role === 'superadmin' ? (
                          <span className="text-amber-400 font-semibold">{tf('Global Platform Root', 'Umuyobozi Mukuru w’Urubuga')}</span>
                        ) : (
                          u.shop_name || tf(`Store #${u.shop_id}`, `Iduka #${u.shop_id}`)
                        )}
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-amber-300 border border-slate-700 capitalize">
                          {u.job_title || u.role}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            isUserActive
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : isUserPending
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {isUserActive
                            ? tf('active', 'irakora')
                            : isUserPending
                            ? tf('pending_approval', 'itegereje kwemezwa')
                            : tf('suspended', 'yahagaritswe')}
                        </span>
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        {u.role !== 'superadmin' && (
                          <>
                            {isUserPending ? (
                              <button
                                onClick={() => handleApproveUser(u.id, u.name)}
                                disabled={actionLoading}
                                className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                              >
                                {tf('Accept Account', 'Emeza Konti')}
                              </button>
                            ) : isUserActive ? (
                              <button
                                onClick={() => handleSuspendUser(u.id, u.name)}
                                disabled={actionLoading}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-400 text-xs transition cursor-pointer"
                              >
                                {tf('Suspend', 'Hagarika')}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleApproveUser(u.id, u.name)}
                                disabled={actionLoading}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold transition cursor-pointer"
                              >
                                {tf('Activate', 'Subiraho')}
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Provision Store Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">{tf('Provision New Hardware Store Tenant', 'Fungura Iduka Rishya rya Quincaillerie')}</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateShop} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">{tf('Store / Company Name *', 'Izina ry’Iduka / Sosiyete *')}</label>
                <input
                  type="text"
                  required
                  placeholder={tf('e.g. Kigali Builders Depot', 'urugero: Kigali Builders Depot')}
                  value={newShop.name}
                  onChange={(e) => setNewShop({ ...newShop, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">{tf('Store Code *', 'Kode y’Iduka *')}</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. KBD-01"
                    value={newShop.code}
                    onChange={(e) => setNewShop({ ...newShop, code: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">{tf('RRA TIN Number', 'Nomero ya TIN (RRA)')}</label>
                  <input
                    type="text"
                    placeholder="100987654"
                    value={newShop.tin_number}
                    onChange={(e) => setNewShop({ ...newShop, tin_number: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">{tf('Managing Owner Name *', 'Izina rya Nyir’Iduka *')}</label>
                <input
                  type="text"
                  required
                  placeholder={tf('e.g. Habimana Alexis', 'urugero: Habimana Alexis')}
                  value={newShop.owner_name}
                  onChange={(e) => setNewShop({ ...newShop, owner_name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">{tf('Contact Telephone', 'Telefoni')}</label>
                  <input
                    type="text"
                    placeholder="0788 123 456"
                    value={newShop.phone}
                    onChange={(e) => setNewShop({ ...newShop, phone: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">{tf('Contact Email', 'Imeyili')}</label>
                  <input
                    type="email"
                    placeholder="admin@shop.rw"
                    value={newShop.email}
                    onChange={(e) => setNewShop({ ...newShop, email: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">{tf('Location / Commercial Sector', 'Aho Riherereye / Akarere')}</label>
                <input
                  type="text"
                  placeholder={tf('e.g. Gisozi Hardware Market, Kigali', 'urugero: Gisozi, Kigali')}
                  value={newShop.location}
                  onChange={(e) => setNewShop({ ...newShop, location: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {modalError && <p className="text-xs text-rose-400 font-semibold">{modalError}</p>}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  {tf('Cancel', 'Hagarika')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  {isSubmitting ? tf('Provisioning...', 'Gufungura...') : tf('Provision Tenant', 'Fungura Iduka')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default SuperAdminView;
