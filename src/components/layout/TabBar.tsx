import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useTabs, TAB_META } from '@/context/TabsContext';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export default function TabBar() {
  const { tabs, activePath, closeTab, switchTab, openTab } = useTabs();
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();

  const currentBase = '/' + (location.pathname.split('/')[1] || '');
  useEffect(() => {
    if (currentBase && currentBase !== '/' && currentBase !== '/login') {
      openTab(currentBase);
    }
  }, [currentBase, openTab]);

  const tabList = useMemo(
    () =>
      tabs.map((tab) => {
        const meta = TAB_META[tab.path] || { key: 'dashboard', closable: false };
        return { ...tab, label: t(meta.key), closable: meta.closable };
      }),
    [tabs, t],
  );

  const handleTabClick = useCallback(
    (path: string) => { switchTab(path); navigate(path); },
    [switchTab, navigate],
  );

  const handleClose = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      e.preventDefault();
      const meta = TAB_META[path];
      if (meta && !meta.closable) return;
      closeTab(path);
      if (path === activePath) {
        const remaining = tabs.filter((t) => t.path !== path);
        if (remaining.length > 0) {
          const idx = tabs.findIndex((t) => t.path === path);
          const nextPath = remaining[Math.min(idx, remaining.length - 1)]?.path || '/dashboard';
          navigate(nextPath);
        } else { navigate('/dashboard'); }
      }
    },
    [tabs, activePath, closeTab, navigate],
  );

  if (!tabList || tabList.length === 0) return null;

  return (
    <div className="flex items-center gap-0 overflow-x-auto border-b border-border bg-muted/30 px-2 scrollbar-thin">
      {tabList.map((tab) => (
        <button
          key={tab.path}
          type="button"
          onClick={() => handleTabClick(tab.path)}
          className={cn(
            'group relative flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
            'border-r border-border last:border-r-0 hover:bg-accent/50',
            tab.path === activePath
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground',
          )}
        >
          <span className="truncate max-w-[120px]">{tab.label}</span>
          {tab.closable && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => handleClose(e, tab.path)}
              className={cn(
                'ml-0.5 flex h-4 w-4 items-center justify-center rounded-sm',
                'opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted-foreground/20',
              )}
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
