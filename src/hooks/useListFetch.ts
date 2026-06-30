import { useCallback, useEffect, useRef, useState } from 'react';

interface UseListFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<T | null>;
}

export function useListFetch<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options: { enabled?: boolean } = {},
): UseListFetchResult<T> {
  const { enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(async () => {
    if (!enabled) { setLoading(false); setData(null); setError(null); return null; }
    setLoading(true); setError(null);
    try {
      const result = await fetcherRef.current();
      setData(result);
      return result;
    } catch (e) {
      const msg = (e as Error)?.message || 'Request failed';
      setError(msg);
      setData(null);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) { setLoading(false); setData(null); setError(null); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const result = await fetcherRef.current();
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) { setError((e as Error)?.message || 'Request failed'); setData(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { data, loading, error, reload };
}
