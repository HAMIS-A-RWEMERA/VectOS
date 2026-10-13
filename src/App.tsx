import React, { useState, useEffect } from 'react';
import { User, Shop, DashboardStats, Order } from './types';
import { api } from './services/api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { PosView } from './components/PosView';
import { ProductsView } from './components/ProductsView';
import { StocksView } from './components/StocksView';
import { OrdersView } from './components/OrdersView';
import { CustomersView } from './components/CustomersView';
import { PartnersView } from './components/PartnersView';
import { UsersView } from './components/UsersView';
import { SuperAdminView } from './components/SuperAdminView';
import { ReportsView } from './components/ReportsView';
import { ReceiptModal } from './components/ReceiptModal';
import { LoginModal } from './components/LoginModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [availableShops, setAvailableShops] = useState<Shop[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [dbPersistent, setDbPersistent] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('vectos_dark_mode');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('vectos_dark_mode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // App UI State
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // Modals
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [selectedOrderIdForInspection, setSelectedOrderIdForInspection] = useState<number | null>(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const [isServerless, setIsServerless] = useState<boolean>(false);

  // Notification Banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      setLoadingUser(true);
      const res = await api.getMe();
      if (res.user) {
        setUser(res.user);
        setShop(res.shop);
        setAvailableShops(res.availableShops || []);
        setIsSuperAdmin(res.isSuperAdmin);
        setDbPersistent(res.dbPersistent);
        setIsServerless(Boolean(res.isServerless));
        await loadDashboardStats();
      } else {
        setUser(null);
        setShop(null);
        setDashboardStats(null);
        setDbPersistent(res.dbPersistent);
        setIsServerless(Boolean(res.isServerless));
      }
    } catch (err) {
      console.error('Auth verification notice:', err);
    } finally {
      setLoadingUser(false);
    }
  };

  const loadDashboardStats = async () => {
    try {
      setLoadingDashboard(true);
      const stats = await api.getDashboardStats();
      setDashboardStats(stats);
    } catch (err: any) {
      if (err?.message && (err.message.includes('log in') || err.message.includes('Authentication Required'))) {
        setDashboardStats(null);
      } else {
        console.error('Error fetching dashboard stats:', err);
      }
    } finally {
      setLoadingDashboard(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSwitchShop = async (shopId: number) => {
    try {
      const res = await api.switchShop(shopId);
      if (res.success) {
        setShop(res.shop);
        showToast(`Active store context switched to ${res.shop.name}`);
        loadDashboardStats();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to switch shop');
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
      setUser(null);
      setShop(null);
    } catch (err) {
      setUser(null);
    }
  };

  const handleOrderCompleted = (order: Order) => {
    showToast(`Order #${order.order_number} processed successfully!`);
    setReceiptOrder(order);
    loadDashboardStats();
  };

  const handleViewOrder = (orderId: number) => {
    setSelectedOrderIdForInspection(orderId);
    setActiveTab('orders');
  };

  if (loadingUser) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-[#090d16] text-slate-100' : 'bg-slate-50 text-slate-900'} flex items-center justify-center font-sans`}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-xl shadow-amber-500/20 text-slate-950 font-black text-2xl animate-pulse">
            V
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            Loading VectOS Retail ERP...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-[#090d16] text-slate-100' : 'bg-slate-50 text-slate-900'} flex items-center justify-center font-sans`}>
        <LoginModal
          onLoginSuccess={(u, s) => {
            setUser(u);
            setShop(s);
            loadDashboardStats();
          }}
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-[#090d16] text-slate-100' : 'bg-slate-50 text-slate-900'} flex flex-col font-sans transition-colors duration-200`}>
      {/* Top Header */}
      <Header
        user={user}
        shop={shop}
        availableShops={availableShops}
        isSuperAdmin={isSuperAdmin}
        dbPersistent={dbPersistent}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        onLogout={handleLogout}
        onSwitchShop={handleSwitchShop}
        onOpenPos={() => setActiveTab('pos')}
        onOpenChangePassword={() => setIsChangePasswordOpen(true)}
      />

      {/* Vercel Serverless Persistent Storage Advisory Banner */}
      {isServerless && !dbPersistent && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <span className="font-bold">⚠️ Vercel Deployment Notice:</span>
            <span>Running on ephemeral in-memory storage. For permanent database persistence across all sessions on Vercel, attach a Vercel Postgres database (set <code className="font-mono bg-black/40 px-1 py-0.5 rounded text-amber-200">POSTGRES_URL</code> in Vercel settings).</span>
          </div>
        </div>
      )}

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          user={user}
          lowStockCount={dashboardStats?.lowStockCount || 0}
        />

        {/* Content View Area */}
        <main className={`flex-1 overflow-y-auto min-h-0 ${isDarkMode ? 'bg-[#090d16]' : 'bg-slate-50'}`}>
          {activeTab === 'dashboard' && (
            <DashboardView
              stats={dashboardStats}
              loading={loadingDashboard}
              onNavigate={(tab) => setActiveTab(tab)}
              onViewOrder={handleViewOrder}
            />
          )}

          {activeTab === 'pos' && (
            <PosView
              user={user}
              shop={shop}
              onOrderCompleted={handleOrderCompleted}
            />
          )}

          {activeTab === 'products' && (
            <ProductsView user={user} />
          )}

          {activeTab === 'stocks' && (
            <StocksView user={user} />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              user={user}
              shop={shop}
              onPrintReceipt={(ord) => setReceiptOrder(ord)}
              initialSelectedOrderId={selectedOrderIdForInspection}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersView user={user} />
          )}

          {activeTab === 'partners' && (
            <PartnersView user={user} />
          )}

          {activeTab === 'users' && (
            <UsersView currentUser={user} />
          )}

          {activeTab === 'superadmin' && (
            <SuperAdminView
              currentUser={user}
              activeShop={shop}
              onSwitchShop={handleSwitchShop}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView user={user} shop={shop} />
          )}
        </main>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-amber-500 text-slate-950 font-bold text-xs shadow-2xl shadow-amber-500/30 flex items-center gap-2 animate-in slide-in-from-bottom-5">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {receiptOrder && (
        <ReceiptModal
          order={receiptOrder}
          shop={shop}
          onClose={() => setReceiptOrder(null)}
        />
      )}

      {/* Self-Service & Enforced Password Change Modal */}
      {(isChangePasswordOpen || user?.force_password_change === 1) && (
        <ChangePasswordModal
          isForced={user?.force_password_change === 1}
          onClose={() => setIsChangePasswordOpen(false)}
          onSuccess={() => {
            setIsChangePasswordOpen(false);
            if (user) {
              setUser({ ...user, force_password_change: 0 });
            }
            setToastMessage('Password updated successfully!');
            setTimeout(() => setToastMessage(null), 4000);
          }}
        />
      )}
    </div>
  );
};

export default App;
