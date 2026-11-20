import React, { useState } from 'react';
import { User, Shop } from '../types';
import { hasPermission } from '../utils/permissions';
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
  User as UserIcon,
  MessageCircle,
  Sparkles,
  Smartphone,
  Crown,
  Menu,
  Pencil
} from 'lucide-react';
import { LanguageSwitcher, useLanguage } from '../i18n/LanguageContext';

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
  onOpenShopSettings?: () => void;
  onOpenAiHelp?: () => void;
  onToggleMobileMenu?: () => void;
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
  onOpenChangePassword,
  onOpenShopSettings,
  onOpenAiHelp,
  onToggleMobileMenu
}) => {
  const { t, tf } = useLanguage();
  const [showShopMenu, setShowShopMenu] = useState(false);
  const canEditShopInfo = hasPermission(user, 'can_edit_company_settings');

  return (
    <header className="sticky top-0 z-40 bg-[#0F131A]/95 backdrop-blur border-b border-slate-800/80 px-3 sm:px-6 py-2.5 sm:py-3">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Mobile Menu Toggle + Brand & Active Shop */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile hamburger menu toggle */}
          {user && (
            <button
              type="button"
              onClick={onToggleMobileMenu}
              className="lg:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95 shrink-0"
              title="Open Navigation Menu"
              aria-label="Open Navigation Menu"
            >
              <Menu className="w-5 h-5 text-amber-400" />
            </button>
          )}

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black text-lg sm:text-xl tracking-tight shrink-0">
              V
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-bold text-base sm:text-lg text-white tracking-wide">VectOS</span>
                <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Rwanda
                </span>
              </div>
              <p className="hidden sm:block text-xs text-slate-400 font-medium">{tf('Hardware & Electronics Store', "Iduka ry'Ibikoresho by'Ubwubatsi & Elegitoroniki")}</p>
            </div>
          </div>

          <div className="hidden md:block h-6 w-px bg-slate-800 mx-1" />

          {/* Active Shop Selector / Indicator */}
          {shop && (
            <div className="relative min-w-0">
              {isSuperAdmin && availableShops.length > 1 ? (
                <button
                  onClick={() => setShowShopMenu(!showShopMenu)}
                  className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs font-semibold text-slate-200 transition max-w-[120px] sm:max-w-[180px]"
                >
                  <Store className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">{shop.name}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                </button>
              ) : (
                <div className="hidden xs:flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs font-medium text-slate-300 max-w-[140px] sm:max-w-[230px]">
                  <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">{shop.name}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  {canEditShopInfo && onOpenShopSettings && (
                    <button
                      type="button"
                      onClick={onOpenShopSettings}
                      className="ml-0.5 p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-400 transition shrink-0"
                      title={tf('Edit Business Info & TIN', "Hindura Amakuru y'Iduka na TIN")}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Superadmin shop dropdown */}
              {showShopMenu && (
                <div className="absolute left-0 mt-2 w-64 rounded-xl bg-[#161B22] border border-slate-700 shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    {tf('Switch Active Shop', 'Hindura Iduka Ririmo Gukoreshwa')}
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
                      {s.id === shop.id && <span className="text-[10px] text-amber-400">{tf('Active', 'Rikoreshwa')}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: AI Assistant, WhatsApp Support, POS Quick Button, User Role, Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* VectOS AI Help Guide Button */}
          {onOpenAiHelp && (
            <button
              onClick={onOpenAiHelp}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/15 to-amber-600/25 hover:from-amber-500/25 hover:to-amber-600/40 border border-amber-500/40 text-amber-300 text-xs font-bold transition shadow-sm cursor-pointer"
              title={tf('Open VectOS AI Assistant', 'Fungura Umufasha wa VectOS AI')}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">{t('header.aiHelpGuide')}</span>
            </button>
          )}

          {/* WhatsApp Direct Support Button */}
          <a
            href="https://wa.me/250781549993?text=Muraho%20VectOS%20Customer%20Support%2C%20I%20need%20assistance"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0F291E]/70 hover:bg-[#0F291E] border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition"
            title={tf('Chat with Customer Support on WhatsApp (+250 781 549 993)', 'Vugana n’ubufasha kuri WhatsApp (+250 781 549 993)')}
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
            <span>WhatsApp</span>
          </a>

          {/* Quick POS / Order Chain Launch Button */}
          <button
            onClick={onOpenPos}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition transform active:scale-95 cursor-pointer"
          >
            {shop?.workflow_mode === 'strict_chain' ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tf('Order Chain', 'Uruhererekane')}</span>
                <span className="sm:hidden">{tf('Chain', 'Igenzura')}</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('header.makeSale')}</span>
                <span className="sm:hidden">{t('header.sell')}</span>
              </>
            )}
          </button>

          {/* Compact Language Switcher (EN | RW) */}
          <LanguageSwitcher variant="compact" />

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 hover:text-white transition cursor-pointer"
            title={isDarkMode ? tf('Switch to Light Mode', 'Hindura ku Rumuri') : tf('Switch to Dark Mode', 'Hindura ku Mwijima')}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          {/* Current User Role Badge */}
          {user && (
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-xs font-semibold text-slate-200">
              {user.role === 'superadmin' ? (
                <>
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-400">{t('header.platformOwner')}</span>
                </>
              ) : user.role === 'platform_ops' ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-indigo-300">{t('header.supportStaff')}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>{user.job_title || (user.role === 'manager' ? t('header.storeManager') : user.role)}</span>
                </>
              )}
            </div>
          )}

          {/* User Profile / Logout */}
          {user && (
            <div className="flex items-center gap-1 pl-1.5 sm:pl-2 border-l border-slate-800">
              <div 
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[11px] sm:text-xs font-bold text-amber-400 shrink-0"
                title={`${user.name} (${user.email})`}
              >
                {user.name.slice(0, 2).toUpperCase()}
              </div>

              {onOpenChangePassword && (
                <button
                  onClick={onOpenChangePassword}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition cursor-pointer"
                  title={t('header.changePasswordTitle')}
                >
                  <KeyRound className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              )}

              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                title={tf('Sign Out', 'Sohoka muri konti')}
              >
                <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
