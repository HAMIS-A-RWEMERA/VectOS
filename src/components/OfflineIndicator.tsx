import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import { useLanguage } from '../i18n/LanguageContext';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { tf } = useLanguage();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-xl shadow-amber-500/30 border border-amber-300">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        {tf(
          'Offline Mode — Reconnect to sync new sales & stock updates.',
          'Nta murongo wa interineti — Ongera uhuze kugira ngo ibicuruzwa bishya byoherezwe.'
        )}
      </span>
    </div>
  );
};

export default OfflineIndicator;
