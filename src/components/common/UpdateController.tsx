import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useEffect, useState } from 'react';

/**
 * Shows a snackbar when a new service worker (app update) is available.
 * Clicking "Refresh" activates the new SW.
 */
export default function UpdateController() {
  const { t } = useT();
  const [dismissed, setDismissed] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, swRegistration) {
      // Periodically check for updates every hour
      if (swRegistration) {
        setInterval(async () => {
          if ('connection' in navigator && !navigator.onLine) return;
          try {
            await swRegistration.update();
          } catch { /* ignore offline */ }
        }, 3600000);
      }
    },
  });

  // Auto-dismiss after 30s
  useEffect(() => {
    if (!needRefresh) return;
    const timer = setTimeout(() => setDismissed(true), 30000);
    return () => clearTimeout(timer);
  }, [needRefresh]);

  if (!needRefresh || dismissed) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 md:bottom-6">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg backdrop-blur">
        <span className="text-sm text-foreground">{t('settingsUpdateAvailable')}</span>
        <button
          type="button"
          onClick={() => { updateServiceWorker(true); setDismissed(true); }}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('refresh')}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('sharedDismiss')}
        </button>
      </div>
    </div>
  );
}
