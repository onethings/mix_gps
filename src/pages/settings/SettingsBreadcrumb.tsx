import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useT } from '@/lib/i18n';

const LABEL_MAP: Record<string, string> = {
  server: 'server', users: 'users', devices: 'devicesDesc', groups: 'groups',
  geofences: 'geofences', notifications: 'notifications', commands: 'savedCommands',
  calendars: 'calendars', drivers: 'driversDesc', maintenance: 'maintenanceDesc',
  attributes: 'computedAttributes', permissions: 'permissions', announcement: 'announcement',
  connections: 'connections', preferences: 'preferences',
};

export default function SettingsBreadcrumb() {
  const { t } = useT();
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
      <Link to="/settings" className="hover:text-foreground">{t('settings')}</Link>
      {segments.slice(1).map((seg, i) => {
        const labelKey = LABEL_MAP[seg];
        return (
          <span key={seg} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <span className={i === segments.length - 2 ? 'text-foreground font-medium' : ''}>
              {labelKey ? t(labelKey) : seg}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
