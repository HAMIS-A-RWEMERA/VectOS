import React, { useState } from 'react';
import { User, Shop } from '../types';
import { 
  Building2, 
  ChevronDown, 
  Database, 
  KeyRound, 
  LogOut, 
  Moon, 
  ShoppingBag, 
  Store, 
  Sun,
  ShieldCheck,
  User as UserIcon
} from 'lucide-react';

interface HeaderProps {
  user: User | null;
  shop: Shop | null;
  availableShops: Shop[];
  isSuperAdmin: boolean;
  dbPersistent: boolean;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  onSwitchShop: (shopId: number) => void;
  onOpenPos: () => void;
  onOpenChangePassword?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  shop,
  availableShops,
  isSuperAdmin,
  dbPersistent,
  isDarkMode,
  onToggleTheme,
  onLogout,
  onSwitchShop,
  onOpenPos,
  onOpenChangePassword
}) => {
  const [showShopMenu, setShowShopMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-[#0F131A]/95 backdrop-blur border-b border-slate-800/80 px-4 lg:px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Brand & Active Shop */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black text-xl tracking-tight">
              V
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-wide">VectOS</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Rwanda ERP
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Hardware & Electronics Depot OS</p>
            </div>
          </div>

          <div className="hidden md:block h-6 w-px bg-slate-800 mx-2" />

          {/* Active Shop Selector / Indicator */}
          {shop && (
            <div className="relative">
              {isSuperAdmin && availableShops.length > 1 ? (
                <button
                  onClick={() => setShowShopMenu(!showShopMenu)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs font-semibold text-slate-200 transition"
                >
                  <Store className="w-3.5 h-3.5 text-amber-400" />
                  <span className="truncate max-w-[180px]">{shop.name}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs font-medium text-slate-300">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="truncate max-w-[200px]">{shop.name}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </div>
              )}

              {/* Superadmin shop dropdown */}
              {showShopMenu && (
                <div className="absolute left-0 mt-2 w-64 rounded-xl bg-[#161B22] border border-slate-700 shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    Switch Store Context
                  </div>
                  {availableShops.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        onSwitchShop(s.id);
                        setShowShopMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-800/70 transition ${
                        s.id === shop.id ? 'text-amber-400 font-bold bg-amber-500/10' : 'text-slate-300'
                      }`}
                    >
                      <div className="truncate">
                        <p className="truncate font-medium">{s.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{s.location}</p>
                      </div>
                      {s.id === shop.id && <span className="text-[10px] text-amber-400">Active</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: POS Quick Button, User Role Badge, User Profile */}
        <div className="flex items-center gap-3">
          {/* Quick POS Launch Button */}
          <button
            onClick={onOpenPos}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition transform active:scale-95 cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Open POS Counter</span>
            <span className="sm:hidden">POS</span>
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 hover:text-white transition cursor-pointer"
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          {/* Database Mode Badge */}
          <div 
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400"
            title={dbPersistent ? 'Connected to persistent PostgreSQL database' : 'Running in local storage mode'}
          >
            <Database className={`w-3 h-3 ${dbPersistent ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>{dbPersistent ? 'PostgreSQL Persistent' : 'Local DB'}</span>
          </div>

          {/* Current User Role Badge */}
          {user && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-xs font-semibold text-slate-200">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>{user.job_title || (user.role === 'superadmin' ? 'Super Administrator' : user.role === 'manager' ? 'Store Owner' : user.role)}</span>
            </div>
          )}

          {/* User Profile / Logout */}
          {user && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
              <div 
                className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-amber-400"
                title={`${user.name} (${user.email})`}
              >
                {user.name.slice(0, 2).toUpperCase()}
              </div>

              {onOpenChangePassword && (
                <button
                  onClick={onOpenChangePassword}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition cursor-pointer"
                  title="Change Password"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
