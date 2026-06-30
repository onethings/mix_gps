import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { LANGUAGES, TRANSLATIONS } from '@/language/index.js';

export { LANGUAGES };

interface I18nContextValue {
  locale: string;
  setLocale: (code: string) => void;
  t: (key: string, fallback?: string) => string;
  dir: string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): string {
  try { return localStorage.getItem('mixok-locale') || navigator.language?.slice(0, 2) || 'en'; }
  catch { return 'en'; }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(getInitialLocale);

  const setLocale = useCallback((code: string) => {
    setLocaleState(code);
    try { localStorage.setItem('mixok-locale', code); } catch { /* ignore */ }
  }, []);

  const t = useCallback((key: string, fallback?: string): string => {
    const translations = (TRANSLATIONS[locale] || TRANSLATIONS['en']) as { nav: Record<string, string>; status: Record<string, string>; alarms: Record<string, string> };
    for (const section of ['nav', 'status', 'alarms'] as const) {
      const val = translations?.[section]?.[key as keyof typeof translations[typeof section]];
      if (val != null) return String(val);
    }
    // fallback to English
    const en = TRANSLATIONS['en'];
    if (en) {
      for (const section of ['nav', 'status', 'alarms'] as const) {
        const val = en[section]?.[key as keyof typeof en[typeof section]];
        if (val != null) return String(val);
      }
    }
    return fallback ?? key;
  }, [locale]);

  return (
    <I18nContext.Provider value={{
      locale,
      setLocale,
      t,
      dir: locale === 'ar' || locale === 'fa' ? 'rtl' : 'ltr'
    }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used inside I18nProvider');
  return ctx;
}
