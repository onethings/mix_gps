import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { TraccarUser, TraccarServer } from '@/types';

type UserRole = 'admin' | 'manager' | 'driver';

interface SessionContextValue {
  user: TraccarUser | null;
  server: TraccarServer | null;
  ready: boolean;
  error: Error | null;
  role: UserRole;
  login: (email: string, password: string, code?: string) => Promise<TraccarUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (requiredRole: UserRole) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<TraccarUser | null>(null);
  const [server, setServer] = useState<TraccarServer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      const current = await api.session.get() as unknown;
      if (current && typeof current === 'object' && !Array.isArray(current) && (current as TraccarUser).id != null) {
        setUser(current as TraccarUser);
        setError(null);
      } else {
        setUser(null);
      }
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr.status !== 401 && apiErr.status !== 404) setError(err as Error);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const svr = await api.session.server() as unknown;
        if (svr && typeof svr === 'object' && !Array.isArray(svr)) {
          setServer(svr as TraccarServer);
        }
      } catch {
        /* server info is optional */
      }
      await refresh();
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string, code?: string) => {
    const u = await api.session.login(email, password, code) as TraccarUser;
    setUser(u);
    setError(null);
    try {
      setServer(await api.session.server() as TraccarServer);
    } catch {
      /* optional */
    }
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.session.logout();
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const role: UserRole = user?.administrator ? 'admin' : user?.userLimit ? 'manager' : 'driver';

  const can = useCallback(
    (requiredRole: UserRole): boolean => {
      if (!user) return false;
      if (role === 'admin') return true;
      return role === requiredRole;
    },
    [role, user],
  );

  return (
    <SessionContext.Provider
      value={{ user, server, ready, error, role, login, logout, refresh, can }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = (): SessionContextValue => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
};
