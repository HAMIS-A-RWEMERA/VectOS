import React from 'react';
import { User } from '../types';
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
  AlertTriangle
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: User | null;
  lowStockCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  user,
  lowStockCount
}) => {
  const isSuperAdmin = user?.role === 'superadmin';
  const isManager = user?.role === 'manager' || isSuperAdmin;
  const isAccountant = user?.role === 'accountant' || isManager;
  const isStorekeeper = user?.role === 'storekeeper' || isManager;
  const canViewReports = user?.can_view_reports || isAccountant || isManager;
  const canManageUsers = user?.can_manage_users || isManager;
  const canManageStock = user?.can_manage_stock || isStorekeeper || isManager;
  const canManagePartners = user?.can_manage_partners || isManager || isAccountant;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
    { id: 'pos', label: 'POS & Counter Sales', icon: ShoppingBag, visible: true, highlight: true },
    { 
      id: 'products', 
      label: 'Products & Inventory', 
      icon: Package, 
      visible: true,
      badge: lowStockCount > 0 ? `${lowStockCount}` : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
    },
    { id: 'stocks', label: 'Warehouses & Stocks', icon: Boxes, visible: true },
    { id: 'orders', label: 'Orders & Dispatch', icon: FileText, visible: true },
    { id: 'customers', label: 'Customers & Credit', icon: Users, visible: true },
    { id: 'partners', label: 'Partner Borrowing', icon: Handshake, visible: canManagePartners },
    { id: 'reports', label: 'Reports & Analytics', icon: BarChart3, visible: canViewReports },
    { id: 'users', label: 'Staff & Roles', icon: Settings, visible: canManageUsers },
    { id: 'superadmin', label: 'SuperAdmin Stores', icon: Building, visible: isSuperAdmin },
  ];

  return (
    <aside className="w-64 bg-[#0D1017] border-r border-slate-800/80 flex flex-col h-[calc(100vh-61px)] sticky top-[61px] select-none">
      {/* Role Context Chip */}
      <div className="p-4 border-b border-slate-800/60">
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Active Session</p>
          <p className="text-sm font-bold text-slate-100 truncate mt-0.5">{user?.name || 'Authorized User'}</p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-amber-400 capitalize">{user?.job_title || user?.role}</span>
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
            <span>Low Stock Alert</span>
          </div>
          <p className="text-[11px] text-amber-200/80 mt-1">
            {lowStockCount} construction/tech item(s) below safety threshold.
          </p>
          <button
            onClick={() => setActiveTab('products')}
            className="mt-2 text-[11px] font-bold text-amber-400 hover:underline inline-block"
          >
            Review Reorder List &rarr;
          </button>
        </div>
      )}

      {/* System Footer */}
      <div className="p-3 border-t border-slate-800/60 text-center text-[10px] text-slate-400">
        <p className="font-semibold text-slate-300">VectOS Kigali v3.2</p>
        <p className="text-slate-400">Rwandan Hardware & Electronics ERP</p>
      </div>
    </aside>
  );
};
