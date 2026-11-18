import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Globe } from 'lucide-react';
import {
  Language,
  formatTemplate,
  getNestedTranslation,
  translatePaymentMethod,
  translatePaymentStatus,
  translateFulfillmentStatus,
  translateStockStatus,
  translateRoleLabel,
} from './translations';

const STORAGE_KEY = 'vectos_language';

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  /** Look up a nested translation key (e.g. 'nav.home') with optional {{var}} interpolation */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Inline helper preserving exact English wording while providing Kinyarwanda translation */
  tf: (enText: string, rwText: string, vars?: Record<string, string | number>) => string;
  trPaymentMethod: (method: string) => string;
  trPaymentStatus: (status: string) => string;
  trFulfillmentStatus: (status: string) => string;
  trStockStatus: (status: string) => string;
  trRole: (role: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function getInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'rw' || saved === 'en') return saved;
  } catch {
    // ignore storage errors
  }
  return 'en';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
    document.documentElement.lang = lang === 'rw' ? 'rw' : 'en';
  }, [lang]);

  const setLang = useCallback((nextLang: Language) => {
    setLangState(nextLang);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'en' ? 'rw' : 'en'));
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const text = getNestedTranslation(lang, key);
      return formatTemplate(text, vars);
    },
    [lang]
  );

  const tf = useCallback(
    (enText: string, rwText: string, vars?: Record<string, string | number>) => {
      const selected = lang === 'rw' ? rwText : enText;
      return formatTemplate(selected, vars);
    },
    [lang]
  );

  const trPaymentMethod = useCallback((m: string) => translatePaymentMethod(m, lang), [lang]);
  const trPaymentStatus = useCallback((s: string) => translatePaymentStatus(s, lang), [lang]);
  const trFulfillmentStatus = useCallback((s: string) => translateFulfillmentStatus(s, lang), [lang]);
  const trStockStatus = useCallback((s: string) => translateStockStatus(s, lang), [lang]);
  const trRole = useCallback((r: string) => translateRoleLabel(r, lang), [lang]);

  return (
    <LanguageContext.Provider
      value={{
        lang,
        setLang,
        toggleLang,
        t,
        tf,
        trPaymentMethod,
        trPaymentStatus,
        trFulfillmentStatus,
        trStockStatus,
        trRole,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}

interface LanguageSwitcherProps {
  variant?: 'compact' | 'full';
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const { lang, setLang } = useLanguage();

  if (variant === 'full') {
    return (
      <div
        className={`inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/90 p-1 gap-1 ${className}`}
        role="group"
        aria-label="Language Switcher"
      >
        <button
          type="button"
          onClick={() => setLang('en')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            lang === 'en'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>English</span>
        </button>
        <button
          type="button"
          onClick={() => setLang('rw')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            lang === 'rw'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <span>Kinyarwanda</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 ${className}`}
      role="group"
      aria-label="Language Switcher"
      title={lang === 'rw' ? 'Ururimi: Kinyarwanda / English' : 'Language: English / Kinyarwanda'}
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`px-2 py-1 rounded-md text-[11px] font-extrabold tracking-wide transition-all cursor-pointer ${
          lang === 'en'
            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('rw')}
        className={`px-2 py-1 rounded-md text-[11px] font-extrabold tracking-wide transition-all cursor-pointer ${
          lang === 'rw'
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        RW
      </button>
    </div>
  );
};
