import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface Tab {
  path: string;
}

interface TabsContextValue {
  tabs: Tab[];
  activePath: string;
  openTab: (path: string) => void;
  closeTab: (path: string) => void;
  switchTab: (path: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);
const STORAGE_KEY = 'mixok-open-tabs';

function loadTabs(): Tab[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Tab[];
  } catch { /* ignore */ }
  return [{ path: '/dashboard' }];
}

function saveTabs(tabs: Tab[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch { /* ignore */ }
}

export const TAB_META: Record<string, { key: string; closable: boolean }> = {
  '/dashboard': { key: 'dashboard', closable: false },
  '/tracking': { key: 'tracking', closable: true },
  '/devices': { key: 'devices', closable: true },
  '/trips': { key: 'trips', closable: true },
  '/fuel': { key: 'fuel', closable: true },
  '/drivers': { key: 'drivers', closable: true },
  '/maintenance': { key: 'maintenance', closable: true },
  '/logistics': { key: 'logistics', closable: true },
  '/route-planning': { key: 'routePlans', closable: true },
  '/replay': { key: 'replay', closable: true },
  '/alerts': { key: 'alerts', closable: true },
  '/reports': { key: 'reports', closable: true },
  '/geofences': { key: 'geofences', closable: true },
  '/orders': { key: 'orders', closable: true },
  '/events': { key: 'events', closable: true },
  '/settings': { key: 'settings', closable: true },
};

export function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const saved = loadTabs();
    return saved.length > 0 ? saved : [{ path: '/dashboard' }];
  });
  const [activePath, setActivePath] = useState('/dashboard');

  const openTab = useCallback((path: string) => {
    setTabs((prev) => {
      if (prev.some((t) => t.path === path)) return prev;
      const next = [...prev, { path }];
      saveTabs(next);
      return next;
    });
  }, []);

  const closeTab = useCallback((path: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.path !== path);
      saveTabs(next);
      return next;
    });
  }, []);

  const switchTab = useCallback((path: string) => {
    setActivePath(path);
  }, []);

  const value = useMemo(
    () => ({ tabs, activePath, openTab, closeTab, switchTab }),
    [tabs, activePath, openTab, closeTab, switchTab],
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export const useTabs = (): TabsContextValue => {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabs must be used inside TabsProvider');
  return ctx;
};
