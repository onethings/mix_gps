import { useEffect, useRef } from 'react';
import { useSession } from '@/context/SessionContext';
import { cacheSet, cacheGet } from '@/lib/db';
import { api } from '@/lib/api';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const CACHED_RESOURCES = [
  { key: 'geofences', fetcher: () => api.geofences.list() },
  { key: 'groups', fetcher: () => api.groups.list() },
  { key: 'drivers', fetcher: () => api.drivers.list() },
  { key: 'calendars', fetcher: () => api.calendars.list() },
  { key: 'maintenance', fetcher: () => api.maintenance.list() },
] as const;

/**
 * Pre-fetches reference data (geofences, groups, drivers, etc.) after login
 * and caches them in IndexedDB for faster subsequent access.
 */
export default function CachingController() {
  const { user } = useSession();
  const cachedRef = useRef(false);

  useEffect(() => {
    if (!user || cachedRef.current) return;
    cachedRef.current = true;

    CACHED_RESOURCES.forEach(({ key, fetcher }) => {
      cacheGet(key, 'list').then((cached) => {
        if (cached) return; // Already cached, skip
        fetcher().then((data) => {
          cacheSet(key, 'list', data, CACHE_TTL);
        }).catch(() => {
          // Silently fail — data will be fetched on-demand
        });
      });
    });
  }, [user]);

  return null;
}
