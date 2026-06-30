import { useSession } from '@/context/SessionContext';
import { useTheme } from '@/context/ThemeContext';
import { LogOut, Moon, Sun, ChevronRight } from 'lucide-react';
import { initials, cn } from '@/lib/utils';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';
import { useLocation, Link } from 'react-router-dom';
import { useT } from '@/lib/i18n';

const BREADCRUMB_MAP = {
  '/dashboard': 'dashboard',
  '/tracking': 'tracking',
  '/devices': 'devices',
  '/trips': 'trips',
  '/fuel': 'fuel',
  '/drivers': 'drivers',
  '/maintenance': 'maintenance',
  '/logistics': 'logistics',
  '/route-planning': 'routePlans',
  '/replay': 'replay',
  '/alerts': 'alerts',
  '/reports': 'reports',
  '/geofences': 'geofences',
  '/orders': 'orders',
  '/events': 'events',
  '/settings': 'settings',
};

export default function Topbar() {
  const { user, logout } = useSession();
  const { theme, toggle } = useTheme();
  const { t } = useT();
  const location = useLocation();

  const basePath = '/' + (location.pathname.split('/')[1] || '');
  const breadcrumbKey = BREADCRUMB_MAP[basePath];

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
      {/* Left — Breadcrumb / Page Title */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Logo — visible on all screen sizes */}
        <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
          <img
            src="/custom/nav_icon_head.webp"
            alt="Logo"
            className="h-7 w-7 rounded object-contain"
            onError={(e: any) => { e.target.style.display = 'none'; }}
          />
          <span className="hidden text-sm font-semibold sm:inline">Kevin GPS </span>
        </Link>

        {/* Breadcrumb separator + current page */}
        {breadcrumbKey && (
          <div className="hidden items-center gap-2 md:flex">
            <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
            <span className="text-sm font-medium text-muted-foreground">
              {t(breadcrumbKey)}
            </span>
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Language switcher */}
        <LanguageSwitcher />
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          className={cn(
            'rounded-lg p-2 text-muted-foreground hover:bg-accent transition-colors',
          )}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* User */}
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/50 transition-colors cursor-default">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {initials(user?.name || user?.email)}
          </div>
          <span className="hidden text-sm font-medium sm:inline">
            {user?.name || user?.email}
          </span>
        </div>

        {/* Logout (mobile) */}
        <button
          type="button"
          onClick={logout}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent lg:hidden"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
