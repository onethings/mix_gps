import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { LANGUAGES } from '@/language/languages';
import { loadTranslations } from '@/lib/i18nLoader';
import { getGeneralPrefs, setGeneralPrefs } from '@/lib/preferences';

export { LANGUAGES };

interface Translations {
  nav: Record<string, string>;
  status: Record<string, string>;
  alarms: Record<string, string>;
}

export interface I18nContextValue {
  locale: string;
  setLocale: (code: string) => void;
  t: (key: string, fallback?: string) => string;
  dir: string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
export { I18nContext };

function getInitialLocale(): string {
  try { return localStorage.getItem('mixok-locale') || navigator.language?.slice(0, 2) || 'en'; }
  catch { return 'en'; }
}

function lookup(translations: Translations | null, key: string, fallback?: string): string {
  if (!translations) return fallback ?? key;
  for (const section of ['nav', 'status', 'alarms'] as const) {
    const val = translations[section]?.[key];
    if (val != null) return String(val);
  }
  return fallback ?? key;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(getInitialLocale);
  const [translations, setTranslations] = useState<Translations | null>(null);
  const [loadedLocale, setLoadedLocale] = useState<string>('en');
  const loadingRef = useRef<Promise<void> | null>(null);
  const prefsRestoredRef = useRef(false);

  // On mount, load locale from IndexedDB (more durable than localStorage)
  useEffect(() => {
    if (prefsRestoredRef.current) return;
    prefsRestoredRef.current = true;
    getGeneralPrefs().then((prefs) => {
      if (prefs.locale && prefs.locale !== locale) {
        setLocaleState(prefs.locale);
        try { localStorage.setItem('mixok-locale', prefs.locale); } catch { /* ignore */ }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load translations whenever locale changes
  useEffect(() => {
    let cancelled = false;
    // Reset loadedLocale so t() knows old translations are stale
    setLoadedLocale('');
    loadingRef.current = loadTranslations(locale).then((t) => {
      if (!cancelled) {
        setTranslations(t);
        setLoadedLocale(locale);
      }
    });
    return () => { cancelled = true; };
  }, [locale]);

  const setLocale = useCallback((code: string) => {
    setLocaleState(code);
    try { localStorage.setItem('mixok-locale', code); } catch { /* ignore */ }
    // Also persist to IndexedDB for durability (merge with existing prefs)
    getGeneralPrefs().then((existing) => {
      setGeneralPrefs({ ...existing, locale: code });
    });
  }, []);

  const t = useCallback((key: string, fallback?: string): string => {
    // If translations are from a different locale (stale), don't use them
    const currentTranslations = loadedLocale === locale ? translations : null;
    const result = lookup(currentTranslations, key);
    // If not found in current locale, try English
    if (result === key && locale !== 'en') {
      // Lazy-load English if not yet cached (loader handles this)
      loadTranslations('en').then((en) => {
        setTranslations((prev) => prev ?? en);
      });
    }
    return result === key && locale !== 'en' ? fallback ?? key : result;
  }, [translations, loadedLocale, locale]);

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
