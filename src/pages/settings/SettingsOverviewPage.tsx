import { useNavigate } from 'react-router-dom';
import {
  User, Server, Users, Smartphone, Layers, Fence, BellRing,
  Terminal, CalendarDays, UserRound, Wrench, Calculator,
  Shield, Megaphone, Cable, ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import { useT } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface QuickLink {
  to: string;
  key: string;
  icon: LucideIcon;
  descKey: string;
}

const QUICK_LINKS: QuickLink[] = [
  { to: '/settings/preferences', key: 'preferences', icon: User, descKey: 'preferencesDesc' },
  { to: '/settings/server', key: 'server', icon: Server, descKey: 'serverDesc' },
  { to: '/settings/users', key: 'users', icon: Users, descKey: 'usersDesc' },
  { to: '/settings/devices', key: 'devices', icon: Smartphone, descKey: 'devicesDesc' },
  { to: '/settings/groups', key: 'groups', icon: Layers, descKey: 'groupsDesc' },
  { to: '/geofences', key: 'geofences', icon: Fence, descKey: 'geofencesListDesc' },
  { to: '/settings/notifications', key: 'notifications', icon: BellRing, descKey: 'notificationsDesc' },
  { to: '/settings/commands', key: 'savedCommands', icon: Terminal, descKey: 'savedCommandsDesc' },
  { to: '/settings/calendars', key: 'calendars', icon: CalendarDays, descKey: 'calendarsDesc' },
  { to: '/settings/drivers', key: 'drivers', icon: UserRound, descKey: 'driversDesc' },
  { to: '/settings/maintenance', key: 'maintenance', icon: Wrench, descKey: 'maintenanceDesc' },
  { to: '/settings/attributes', key: 'computedAttributes', icon: Calculator, descKey: 'computedAttributesDesc' },
  { to: '/settings/permissions', key: 'permissions', icon: Shield, descKey: 'permissionsDesc' },
  { to: '/settings/announcement', key: 'announcement', icon: Megaphone, descKey: 'announcementDesc' },
  { to: '/settings/connections', key: 'connections', icon: Cable, descKey: 'connectionsDesc' },
];

export default function SettingsOverviewPage() {
  const { user, server } = useSession();
  const { t } = useT();
  const navigate = useNavigate();
  const serverVersion = (server as unknown as { version?: string })?.version || '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('preferencesDesc')}
        </p>
      </div>

      {/* Status cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* User account card */}
        <Card className="overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">{t('myAccount')}</p>
                  <p className="text-xs text-muted-foreground">{user?.name || '—'}</p>
                </div>
              </div>
              <Badge variant={user?.administrator ? 'default' : 'secondary'} className="text-[10px]">
                {user?.administrator ? t('userAdmin') : t('users')}
              </Badge>
            </div>
            {user?.email && (
              <p className="mt-3 text-xs text-muted-foreground truncate">{user.email}</p>
            )}
          </CardContent>
        </Card>

        {/* Server status card */}
        <Card className="overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">{t('server')}</p>
                  <p className="text-xs text-muted-foreground">v{serverVersion}</p>
                </div>
              </div>
              <Badge variant={server ? 'success' : 'destructive'} className="text-[10px]">
                {server ? t('connectionOnline') : t('connectionOffline')}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Settings grid */}
      <div>
        <h2 className="text-sm font-semibold mb-3">{t('allSettings')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.to}
              type="button"
              onClick={() => navigate(link.to)}
              className={cn(
                'group flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left',
                'transition-all hover:border-primary/30 hover:shadow-sm hover:bg-accent/30',
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                <link.icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{t(link.key)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {t(link.descKey)}
                </p>
              </div>
              <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 group-hover:text-primary transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
