import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getGeneralPrefs, setGeneralPrefs } from '@/lib/preferences';

interface ThemeContextValue {
  theme: string;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<string>(() => {
    if (typeof window === 'undefined') return 'light';
    return localStorage.getItem('Kevin GPS .theme') || 'light';
  });
  const prefsRestoredRef = useRef(false);

  // On mount, load theme from IndexedDB (more durable than localStorage)
  useEffect(() => {
    if (prefsRestoredRef.current) return;
    prefsRestoredRef.current = true;
    getGeneralPrefs().then((prefs) => {
      if (prefs.theme && prefs.theme !== theme) {
        setTheme(prefs.theme);
        try { localStorage.setItem('Kevin GPS .theme', prefs.theme); } catch { /* ignore */ }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('Kevin GPS .theme', theme);
    // Also persist to IndexedDB for durability (merge with existing prefs)
    getGeneralPrefs().then((existing) => {
      setGeneralPrefs({ ...existing, theme });
    });
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
