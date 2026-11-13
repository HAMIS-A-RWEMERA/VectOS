import React from 'react';
import { User } from '../types';
import { hasPermission } from '../utils/permissions';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Boxes,
  FileText,
  Users,
  Handshake,
  ShieldAlert,
  BarChart3,
  Building,
  Settings,
  AlertTriangle,
  Crown,
  Menu,
  MessageCircle,
  X
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: User | null;
  lowStockCount: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  user,
  lowStockCount,
  isMobileOpen,
  onCloseMobile,
  onOpenMobile
}) => {
  const isSuperAdmin = user?.role === 'superadmin' || user?.email === 'rwemera30@gmail.com';
  const canCreateOrders = hasPermission(user, 'can_create_orders');
  const canProcessPayments = hasPermission(user, 'can_process_payments');
  const canReleaseStock = hasPermission(user, 'can_release_stock');
  const canManageStock = hasPermission(user, 'can_manage_stock');
  const canImportExportStock = hasPermission(user, 'can_import_export_stock');
  const canViewReports = hasPermission(user, 'can_view_reports');
  const canManageUsers = hasPermission(user, 'can_manage_users');
  const canManagePartners = hasPermission(user, 'can_manage_partners') || hasPermission(user, 'can_partner_borrow');
  const canManageCustomers = hasPermission(user, 'can_manage_customers');
  const canVoidOrders = hasPermission(user, 'can_void_orders');
  const canEditCompanySettings = hasPermission(user, 'can_edit_company_settings');

  const canSeeProducts = canCreateOrders || canManageStock || canImportExportStock || canReleaseStock;
  const canSeeOrders = canCreateOrders || canProcessPayments || canReleaseStock || canVoidOrders || canViewReports;

  const navItems = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard, visible: true },
    { id: 'pos', label: 'Make a Sale (POS)', icon: ShoppingBag, visible: canCreateOrders, highlight: true },
    { 
      id: 'products', 
      label: 'Products & Stock', 
      icon: Package, 
      visible: canSeeProducts,
      badge: lowStockCount > 0 ? `${lowStockCount}` : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    },
    { id: 'stocks', label: 'Stores & Warehouses', icon: Boxes, visible: canManageStock || canReleaseStock || canCreateOrders },
    { id: 'orders', label: 'Orders & Receipts', icon: FileText, visible: canSeeOrders },
    { id: 'customers', label: 'Customers & Debt', icon: Users, visible: canManageCustomers || canCreateOrders || canProcessPayments },
    { id: 'partners', label: 'Partner Shops', icon: Handshake, visible: canManagePartners },
    { id: 'reports', label: 'Sales & Profit Reports', icon: BarChart3, visible: canViewReports },
    { id: 'shop_settings', label: 'Business Info & TIN', icon: Building, visible: canEditCompanySettings },
    { id: 'users', label: 'Staff & Duties', icon: Settings, visible: canManageUsers },
    { id: 'superadmin', label: 'Platform Approvals', icon: Crown, visible: isSuperAdmin, highlight: true },
  ];

  return (
    <>
      {/* 1. Desktop Persistent Sidebar (Hidden on mobile / tablet < lg) */}
      <aside className="hidden lg:flex w-64 bg-[#0D1017] border-r border-slate-800/80 flex-col h-[calc(100vh-61px)] sticky top-[61px] select-none shrink-0">
        {/* Role Context Chip */}
        <div className="p-4 border-b border-slate-800/60">
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Signed In As</p>
            <p className="text-sm font-bold text-slate-100 truncate mt-0.5">{user?.name || 'Shop Staff'}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-amber-400 capitalize">
                {isSuperAdmin ? 'Platform Owner' : (user?.job_title || user?.role)}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.filter(item => item.visible).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : item.highlight
                    ? 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/20 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : item.highlight ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${isActive ? 'bg-slate-900 text-amber-400 border-amber-400' : item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Low Stock Warning Box if any */}
        {lowStockCount > 0 && (
          <div className="p-3 mx-3 mb-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Low Stock Warning</span>
            </div>
            <p className="text-[11px] text-amber-200/80 mt-1">
              {lowStockCount} item(s) running low in the store.
            </p>
            <button
              onClick={() => setActiveTab('products')}
              className="mt-2 text-[11px] font-bold text-amber-400 hover:underline inline-block"
            >
              Check Low Stock &rarr;
            </button>
          </div>
        )}

        {/* System Footer */}
        <div className="p-3 border-t border-slate-800/60 text-center text-[10px] text-slate-400">
          <p className="font-semibold text-slate-300">VectOS Kigali v3.2</p>
          <p className="text-slate-400">Hardware & Electronics Store</p>
        </div>
      </aside>

      {/* 2. Mobile Slide-Over Drawer Navigation (< lg) */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />

          {/* Drawer Content */}
          <div className="relative w-72 max-w-[85vw] bg-[#0D1017] border-r border-slate-800 flex flex-col h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200 select-none">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 font-black text-lg">
                  V
                </div>
                <div>
                  <p className="font-bold text-sm text-white">VectOS Menu</p>
                  <p className="text-[10px] text-amber-400 font-semibold uppercase">Store Management</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                className="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Active User Session Card */}
            <div className="p-3 border-b border-slate-800/60">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Signed In As</p>
                <p className="text-xs font-bold text-slate-100 truncate mt-0.5">{user?.name || 'Shop Staff'}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-semibold text-amber-400 capitalize">
                    {isSuperAdmin ? 'Platform Owner' : (user?.job_title || user?.role)}
                  </span>
                </div>
              </div>
            </div>

            {/* Full Nav Links */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.filter(item => item.visible).map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      onCloseMobile?.();
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                        : item.highlight
                        ? 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/20 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : item.highlight ? 'text-amber-400' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${isActive ? 'bg-slate-900 text-amber-400 border-amber-400' : item.badgeColor}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Drawer Footer & Support */}
            <div className="p-3 border-t border-slate-800 space-y-2">
              <a
                href="https://wa.me/250781549993?text=Muraho%20VectOS%20Customer%20Support%2C%20I%20need%20assistance"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-[#0F291E] hover:bg-[#143829] border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                <span>WhatsApp Direct Support</span>
              </a>
              <div className="text-center text-[10px] text-slate-400">
                <p className="font-semibold text-slate-300">VectOS Kigali v3.2</p>
                <p className="text-slate-400">Hardware & Electronics Store</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Mobile Bottom Navigation Bar (< lg) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0F131A]/95 backdrop-blur-md border-t border-slate-800/90 px-2 py-1.5 flex items-center justify-around select-none">
        {/* 1. Dashboard */}
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition ${
            activeTab === 'dashboard' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Home</span>
        </button>

        {/* 2. POS Counter (Center highlighted action, only if user can create orders) */}
        {canCreateOrders && (
          <button
            type="button"
            onClick={() => setActiveTab('pos')}
            className={`flex flex-col items-center justify-center py-1 px-3.5 rounded-xl transition ${
              activeTab === 'pos'
                ? 'bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/30'
                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
            }`}
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[10px] mt-0.5 font-bold">POS Sales</span>
          </button>
        )}

        {/* 3. Products */}
        {canSeeProducts && (
          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl relative transition ${
              activeTab === 'products' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Stock</span>
            {lowStockCount > 0 && (
              <span className="absolute top-0.5 right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[#0F131A]" />
            )}
          </button>
        )}

        {/* 4. Orders */}
        {canSeeOrders && (
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition ${
              activeTab === 'orders' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Orders</span>
          </button>
        )}

        {/* 5. More Menu */}
        <button
          type="button"
          onClick={onOpenMobile}
          className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-slate-400 hover:text-slate-200 transition"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">More</span>
        </button>
      </nav>
    </>
  );
};
