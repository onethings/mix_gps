import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useSession } from '@/context/SessionContext';

/**
 * Handles Traccar-style URL query params: locale, token, uniqueId, openid.
 */
export default function NavigationBootstrap() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useSession();

  useEffect(() => {
    const has =
      searchParams.has('locale') ||
      searchParams.has('token') ||
      searchParams.has('uniqueId') ||
      searchParams.has('openid');
    if (!has) return undefined;

    const run = async () => {
      const next = new URLSearchParams(searchParams);

      if (searchParams.has('token')) {
        const token = searchParams.get('token');
        try {
          await api.session.loginWithToken(token);
          await refresh();
        } catch {
          /* login page will show error if needed */
        }
        next.delete('token');
      }

      if (searchParams.has('uniqueId')) {
        try {
          const list = await api.devices.list({ uniqueId: searchParams.get('uniqueId') });
          if (list?.length && list[0]?.id) {
            navigate(`/devices/${list[0].id}`, { replace: true });
          }
        } catch {
          /* ignore */
        }
        next.delete('uniqueId');
      }

      if (searchParams.has('locale')) {
        try {
          window.localStorage.setItem('fleet-locale', searchParams.get('locale'));
        } catch {
          /* ignore */
        }
        next.delete('locale');
      }

      if (searchParams.has('openid')) {
        next.delete('openid');
      }

      setSearchParams(next, { replace: true });
    };

    run();
  }, [searchParams, setSearchParams, navigate, refresh]);

  return null;
}
