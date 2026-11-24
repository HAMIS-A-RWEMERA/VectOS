import { useEffect, useState, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Global capture so beforeinstallprompt is never missed before React mounts or across view changes
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();

let globalInstalled = false;
const installedListeners = new Set<(installed: boolean) => void>();

function checkStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

if (typeof window !== 'undefined') {
  globalInstalled = checkStandalone();

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((cb) => cb(globalDeferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    globalInstalled = true;
    globalDeferredPrompt = null;
    promptListeners.forEach((cb) => cb(null));
    installedListeners.forEach((cb) => cb(true));
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState<boolean>(globalInstalled || checkStandalone());
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    setIsInstalled(globalInstalled || checkStandalone());

    const ua = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(iosDevice);
    setIsAndroid(/android/.test(ua));

    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    const onPromptChange = (p: BeforeInstallPromptEvent | null) => setDeferredPrompt(p);
    const onInstalledChange = (val: boolean) => setIsInstalled(val);

    promptListeners.add(onPromptChange);
    installedListeners.add(onInstalledChange);

    // Sync in case event fired between render and effect
    if (globalDeferredPrompt !== deferredPrompt) {
      setDeferredPrompt(globalDeferredPrompt);
    }

    const mq = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = (ev: MediaQueryListEvent) => {
      if (ev.matches) {
        globalInstalled = true;
        setIsInstalled(true);
      }
    };
    mq.addEventListener?.('change', onDisplayChange);

    return () => {
      promptListeners.delete(onPromptChange);
      installedListeners.delete(onInstalledChange);
      mq.removeEventListener?.('change', onDisplayChange);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const promptEvent = globalDeferredPrompt || deferredPrompt;
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    globalDeferredPrompt = null;
    setDeferredPrompt(null);
    promptListeners.forEach((cb) => cb(null));
    if (outcome === 'accepted') {
      globalInstalled = true;
      setIsInstalled(true);
      installedListeners.forEach((cb) => cb(true));
      return true;
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isAndroid,
    isInIframe,
    install,
  };
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
