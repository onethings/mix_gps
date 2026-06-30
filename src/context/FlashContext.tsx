import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface Toast {
  type: 'error' | 'success';
  message: string;
  id: number;
}

interface FlashContextValue {
  toast: Toast | null;
  showError: (message: string, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  dismiss: () => void;
}

const FlashContext = createContext<FlashContextValue | null>(null);

export function FlashProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);

  const showError = useCallback((message: string, duration = 6000) => {
    setToast({ type: 'error', message, id: Date.now() });
    if (duration > 0) {
      setTimeout(() => setToast((t) => (t?.message === message ? null : t)), duration);
    }
  }, []);

  const showSuccess = useCallback((message: string, duration = 4000) => {
    setToast({ type: 'success', message, id: Date.now() });
    if (duration > 0) {
      setTimeout(() => setToast(null), duration);
    }
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    const handler = (e: Event) => {
      const err = (e as CustomEvent).detail;
      const msg = err?.message || 'Request failed';
      if (err?.status === 403) {
        setToast({ type: 'error', message: `Not allowed: ${msg}`, id: Date.now() });
      }
    };
    window.addEventListener('fleet-api-error', handler as EventListener);
    return () => window.removeEventListener('fleet-api-error', handler as EventListener);
  }, []);

  const value = useMemo(
    () => ({ toast, showError, showSuccess, dismiss }),
    [toast, showError, showSuccess, dismiss],
  );

  return <FlashContext.Provider value={value}>{children}</FlashContext.Provider>;
}

export function useFlash(): FlashContextValue {
  const ctx = useContext(FlashContext);
  if (!ctx) throw new Error('useFlash must be used inside FlashProvider');
  return ctx;
}
