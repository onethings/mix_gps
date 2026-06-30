import { Outlet, NavLink } from 'react-router-dom';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import SettingsBreadcrumb from './SettingsBreadcrumb';

const SETTINGS_NAV = [
  { to: '/settings', key: 'preferences', end: true },
  { to: '/settings/server', key: 'server' },
  { to: '/settings/users', key: 'users' },
  { to: '/settings/devices', key: 'devicesDesc' },
  { to: '/settings/groups', key: 'groups' },
  { to: '/settings/geofences', key: 'geofences' },
  { to: '/settings/notifications', key: 'notifications' },
  { to: '/settings/commands', key: 'savedCommands' },
  { to: '/settings/calendars', key: 'calendars' },
  { to: '/settings/drivers', key: 'driversDesc' },
  { to: '/settings/maintenance', key: 'maintenanceDesc' },
  { to: '/settings/attributes', key: 'computedAttributes' },
  { to: '/settings/permissions', key: 'permissions' },
  { to: '/settings/announcement', key: 'announcement' },
  { to: '/settings/connections', key: 'connections' },
];

export default function SettingsLayout() {
  const { t } = useT();

  return (
    <div className="flex gap-6 h-full">
      <nav className="w-48 shrink-0 space-y-0.5">
        {SETTINGS_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'block rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )
            }
          >
            {t(item.key)}
          </NavLink>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto">
        <SettingsBreadcrumb />
        <Outlet />
      </div>
    </div>
  );
}
