import React, { useState } from 'react';
import { Download, Smartphone, Laptop, Share, MoreVertical, X, Check, Copy } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useLanguage } from '../i18n/LanguageContext';

interface PWAInstallButtonProps {
  variant?: 'header' | 'login';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, isInIframe, install } = usePWAInstall();
  const { tf } = useLanguage();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Hide automatically when already running inside an installed standalone PWA
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuide(true);
      }
      return;
    }
    setShowGuide(true);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {}
  };

  return (
    <>
      {variant === 'login' ? (
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-amber-500/35 hover:border-amber-400/60 text-xs font-bold text-slate-200 hover:text-white transition cursor-pointer shadow-sm"
        >
          <Download className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            {isInstallable
              ? tf('Install App on Phone / Laptop', 'Shyira App kuri Telefone / Mudasobwa')
              : tf('Install / Add to Home Screen', 'Shyira App kuri Telefone / Mudasobwa')}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition cursor-pointer shrink-0"
          title={tf('Install VectOS App on your phone or laptop', 'Shyira VectOS kuri telefone cyangwa mudasobwa yawe')}
        >
          <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="hidden md:inline">
            {isInstallable ? tf('Install App', 'Shyiramo App') : tf('Install', 'Shyiramo')}
          </span>
        </button>
      )}

      {showGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl bg-[#141923] border border-amber-500/40 shadow-2xl animate-in fade-in zoom-in-95 overflow-hidden">
            {/* Fixed Header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    {tf('Add VectOS to Home Screen', 'Shyira VectOS kuri Telefone cyangwa Mudasobwa')}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {tf('Works on Android, iPhone/iPad, Windows & Mac', 'Ikora kuri Android, iPhone, Windows na Mac')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-xs text-slate-300">
              {isInIframe && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/35 text-amber-200 space-y-2">
                  <p className="font-bold">
                    {tf(
                      'Opened inside a preview window:',
                      'Urafunguye uri imbere y’idirishya ry’igerageza:'
                    )}
                  </p>
                  <p className="text-[11px]">
                    {tf(
                      'Browsers only install apps when opened directly in a standalone browser tab (like your live site URL). Copy the address below and open it in Chrome, Edge, or Safari:',
                      'Browsers zishyira app kuri telefone gusa iyo ifunguwe mu rupapuro rwayo rwihariye (urugero: urubuga rwawe rusanzwe). Kora kopi y’aderesi uyifungure muri Chrome cyangwa Safari:'
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-amber-300 truncate font-mono">
                      {typeof window !== 'undefined' ? window.location.origin : ''}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedUrl ? tf('Copied', 'Byakopowe') : tf('Copy', 'Kopa')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* iPhone / iPad Instructions */}
              <div className={`p-3 rounded-xl border ${isIOS ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-900/70 border-slate-800'} space-y-1.5`}>
                <p className="font-bold text-white flex items-center gap-1.5">
                  <Share className="w-3.5 h-3.5 text-amber-400" />
                  <span>{tf('iPhone / iPad (Safari)', 'iPhone / iPad (Safari)')}</span>
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300">
                  <li>{tf('Open this site in Safari (not an in-app browser).', 'Fungura uru rubuga muri Safari.')}</li>
                  <li>{tf('Tap the Share icon at the bottom or top bar.', 'Kanda akamenyetso ka Share hasi cyangwa hejuru.')}</li>
                  <li>{tf('Scroll down and tap "Add to Home Screen", then "Add".', 'Manuka ukande "Add to Home Screen", hanyuma ukande "Add".')}</li>
                </ol>
              </div>

              {/* Android Phone Instructions */}
              <div className={`p-3 rounded-xl border ${isAndroid ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-slate-900/70 border-slate-800'} space-y-1.5`}>
                <p className="font-bold text-white flex items-center gap-1.5">
                  <MoreVertical className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{tf('Android Phone (Chrome / Edge)', 'Telefone ya Android (Chrome / Edge)')}</span>
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300">
                  <li>{tf('Tap the three-dot menu (⋮) at the top-right of Chrome.', 'Kanda ududomo dutatu (⋮) hejuru iburyo muri Chrome.')}</li>
                  <li>{tf('Tap "Install app" or "Add to Home screen" and confirm.', 'Hitamo "Install app" cyangwa "Add to Home screen" wemeze.')}</li>
                </ol>
              </div>

              {/* Laptop / Desktop Instructions */}
              <div className={`p-3 rounded-xl border ${!isIOS && !isAndroid ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-slate-900/70 border-slate-800'} space-y-1.5`}>
                <p className="font-bold text-white flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{tf('Laptop / Desktop (Chrome / Edge)', 'Mudasobwa (Chrome / Edge)')}</span>
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300">
                  <li>{tf('Click the Install icon on the right side of the browser address bar.', 'Kanda akamenyetso ka Install iburyo mu murongo wa aderesi.')}</li>
                  <li>{tf('Or open the browser menu (⋮) → "Save and share" / "Apps" → "Install VectOS".', 'Cyangwa ufungure menu (⋮) → "Apps" → "Install VectOS".')}</li>
                </ol>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="shrink-0 flex justify-end gap-2 px-5 py-3.5 border-t border-slate-800 bg-[#141923]">
              {isInstallable && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await install();
                    if (ok) setShowGuide(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{tf('Install Now', 'Shyiramo Ubu')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs cursor-pointer"
              >
                {tf('Close', 'Funga')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PWAInstallButton;
