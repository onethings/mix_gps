import { useEffect } from 'react';
import { useSession } from '@/context/SessionContext';

export default function SessionExpiredListener() {
  const { logout } = useSession();

  useEffect(() => {
    const handler = () => {
      logout();
    };
    window.addEventListener('fleet-session-expired', handler);
    return () => window.removeEventListener('fleet-session-expired', handler);
  }, [logout]);

  return null;
}
