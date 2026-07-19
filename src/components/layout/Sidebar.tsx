import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, BarChart3, Route, Fuel, Wrench, Package,
  Bell, Activity, ClipboardList, History, Fence, MapPin,
  Smartphone, Settings, Users, Shield, Calendar, Cpu,
  Terminal, Server, Megaphone, Cable,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface NavItemConfig {
  to: string;
  key: string;
  icon: LucideIcon;
}

// ── Report sidebar items ──
const REPORT_NAV: NavItemConfig[] = [
  { to: '/reports/trips', key: 'trips', icon: Route },
  { to: '/fuel', key: 'fuel', icon: Fuel },
  { to: '/logistics', key: 'logistics', icon: Package },
  { to: '/alerts', key: 'alerts', icon: Bell },
  { to: '/events', key: 'events', icon: Activity },
  { to: '/orders', key: 'orders', icon: ClipboardList },
  { to: '/replay', key: 'replay', icon: History },
  { to: '/route-planning', key: 'routePlans', icon: MapPin },
];

// ── MGMT sidebar items ──
const MGMT_NAV: NavItemConfig[] = [
  { to: '/settings/preferences', key: 'preferences', icon: LayoutDashboard },
  { to: '/settings/notifications', key: 'notifications', icon: Bell },
  { to: '/settings', key: 'account', icon: Shield },
  { to: '/devices', key: 'devices', icon: Smartphone },
  { to: '/geofences', key: 'geofences', icon: Fence },
  { to: '/settings/groups', key: 'groups', icon: Users },
  { to: '/drivers', key: 'drivers', icon: Users },
  { to: '/settings/calendars', key: 'calendars', icon: Calendar },
  { to: '/settings/attributes', key: 'computedAttributes', icon: Cpu },
  { to: '/settings/maintenance', key: 'maintenance', icon: Wrench },
  { to: '/settings/commands', key: 'savedCommands', icon: Terminal },
];

// ── Admin-only items (not in main MGMT nav) ──
const ADMIN_NAV: NavItemConfig[] = [
  { to: '/settings/server', key: 'server', icon: Server },
  { to: '/settings/users', key: 'users', icon: Users },
  { to: '/settings/permissions', key: 'permissions', icon: Shield },
  { to: '/settings/announcement', key: 'announcement', icon: Megaphone },
  { to: '/settings/devices', key: 'devicesDesc', icon: Smartphone },
  { to: '/settings/connections', key: 'connections', icon: Cable },
];

function NavItem({ item }: { item: NavItemConfig & { label: string } }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/dashboard' || item.to === '/reports' || item.to === '/settings'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )
      }
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {item.label}
    </NavLink>
  );
}

export default function Sidebar() {
  const { t } = useT();
  const { user } = useSession();
  const { pathname } = useLocation();
  const basePath = '/' + (pathname.split('/')[1] || '');

  const REPORT_PATHS = new Set(['/reports','/trips','/fuel','/logistics','/alerts','/events','/orders','/replay','/route-planning']);
  const MGMT_PATHS = new Set(['/devices','/drivers','/settings']);

  const isReport = REPORT_PATHS.has(basePath);
  const isMgmt = MGMT_PATHS.has(basePath);

  // Build MGMT nav with dynamic Account link
  const mgmtNav = MGMT_NAV.map((item) => {
    if (item.key === 'account' && user?.id) {
      return { ...item, to: `/settings/user/${user.id}` };
    }
    return item;
  });

  const navItems = isMgmt ? mgmtNav : REPORT_NAV;
  const sectionLabel = isMgmt ? 'management' : 'reports';
  const isAdmin = Boolean(user?.administrator);

  return (
    <aside className="hidden w-60 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          {isMgmt ? (
            <Settings className="h-4 w-4 text-primary" />
          ) : (
            <BarChart3 className="h-4 w-4 text-primary" />
          )}
        </div>
        <span className="text-sm font-semibold">{t(sectionLabel)}</span>
      </div>

      <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto">
        <div className="mb-2 flex items-center gap-3 px-1">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            {t(isMgmt ? 'management' : 'reports')}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {navItems.map((item) => (
          <NavItem key={item.to} item={{ ...item, label: t(item.key) }} />
        ))}

        {isMgmt && isAdmin && (
          <>
            <div className="mt-4 mb-2 flex items-center gap-3 px-1">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                {t('administration')}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            {ADMIN_NAV.map((item) => (
              <NavItem key={item.to} item={{ ...item, label: t(item.key) }} />
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
