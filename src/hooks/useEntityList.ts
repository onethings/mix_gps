import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

interface UseEntityListOptions<T> {
  fetchFn: (params: URLSearchParams, signal?: AbortSignal) => Promise<T[]>;
  pageSize?: number;
  searchKey?: string;
}

interface UseEntityListReturn<T> {
  items: T[];
  loading: boolean;
  hasMore: boolean;
  searchKeyword: string;
  setSearchKeyword: (val: string) => void;
  reload: () => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

export function useEntityList<T>({ fetchFn, pageSize = 20, searchKey = 'keyword' }: UseEntityListOptions<T>): UseEntityListReturn<T> {
  const [reloadKey, reload] = useReducer((k: number) => k + 1, 0);
  const [items, setItems] = useState<T[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);

  const loadItems = useCallback(async (offset: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    if (searchKeyword) params.append(searchKey, searchKeyword);
    const data = await fetchFn(params, signal);
    if (!signal?.aborted) {
      setItems((prev) => (offset ? [...prev, ...data] : data));
      setHasMore(data.length >= pageSize);
      offsetRef.current = offset;
    }
  }, [fetchFn, pageSize, searchKeyword, searchKey]);

  // Initial load / reload
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setItems([]);
    offsetRef.current = 0;
    loadItems(0, controller.signal).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [reloadKey, loadItems]);

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loading) {
          setLoading(true);
          loadItems(offsetRef.current + pageSize).finally(() => setLoading(false));
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, pageSize, loadItems]);

  return {
    items,
    loading,
    hasMore,
    searchKeyword,
    setSearchKeyword: (val: string) => { setSearchKeyword(val); reload(); },
    reload,
    sentinelRef,
  };
}
