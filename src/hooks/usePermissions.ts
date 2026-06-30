import { useMemo } from 'react';
import { useSession } from '@/context/SessionContext';

export function usePermissions() {
  const { user, server } = useSession();

  return useMemo(() => {
    const administrator = Boolean(user?.administrator);
    const userLimit = user?.userLimit ?? 0;
    const manager = userLimit !== 0;
    const readonly = !administrator && Boolean(server?.readonly || user?.readonly);
    const deviceReadonly = !administrator && Boolean(server?.deviceReadonly || user?.deviceReadonly);
    const disableReports = !administrator && Boolean(server?.disableReports || user?.disableReports);
    const disableDevices = !administrator && Boolean(server?.disableDevices || user?.disableDevices);

    return {
      administrator,
      manager: administrator || manager,
      readonly,
      deviceReadonly,
      disableReports,
      disableDevices,
      canAdminSettings: administrator,
      canWriteDevices: administrator || (!readonly && !deviceReadonly && !disableDevices),
    };
  }, [user, server]);
}
