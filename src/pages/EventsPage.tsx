import { useMemo, useState } from 'react';
import { useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import { Activity, Search, Filter } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import LoadingScreen from '@/components/common/LoadingScreen';
import { useListFetch } from '@/hooks/useListFetch';
import { useLiveData } from '@/context/LiveDataContext';
import { formatDate } from '@/lib/utils';

const EVENT_TYPE_COLORS = {
  deviceOnline: 'text-green-600 dark:text-green-400',
  deviceOffline: 'text-muted-foreground',
  deviceMoving: 'text-blue-600 dark:text-blue-400',
  deviceStopped: 'text-amber-600 dark:text-amber-400',
  geofenceEnter: 'text-indigo-600 dark:text-indigo-400',
  geofenceExit: 'text-purple-600 dark:text-purple-400',
  alarm: 'text-red-600 dark:text-red-400',
  ignitionOn: 'text-emerald-600 dark:text-emerald-400',
  ignitionOff: 'text-orange-600 dark:text-orange-400',
  maintenance: 'text-cyan-600 dark:text-cyan-400',
  report: 'text-slate-600 dark:text-slate-400',
  commandResult: 'text-rose-600 dark:text-rose-400',
  driverChanged: 'text-teal-600 dark:text-teal-400',
};

function eventIcon(type) {
  const color = EVENT_TYPE_COLORS[type] || 'text-muted-foreground';
  return <Activity className={`h-4 w-4 ${color}`} />;
}

export default function EventsPage() {
  const { t } = useT();
  const { data: allEvents, loading, error } = useListFetch(() => api.reports.events({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
  }));
  const { vehicles } = useLiveData();
  const [search, setSearch] = useState('');

  const events = allEvents || [];

  // Resolve device ID → vehicle name (plate)
  const vehicleLabel = useMemo(() => {
    const map = {};
    (vehicles || []).forEach((v) => {
      map[v.id] = v.name;
    });
    return (deviceId) => map[deviceId] || null;
  }, [vehicles]);
  const filtered = search
    ? events.filter((e) => {
        const q = search.toLowerCase();
        return e.type?.toLowerCase().includes(q) || String(e.deviceId || '').includes(q);
      })
    : events;

  if (loading) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-6xl space-y-3 md:space-y-6">
      <PageHeader
        title={t('events')}
        description={t('systemEventsTimeline')}
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchEvents')}
          className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm outline-none ring-offset-background transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          {t('failedLoadEvents')}: {(error as any).message || error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState title={t('noEvents')} description={t('noEventsMsg')} />
      )}

      {/* Timeline */}
      <div className="space-y-1">
        {filtered.map((e, idx) => (
          <div
            key={e.id || idx}
            className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/30"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
              {eventIcon(e.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium capitalize">{e.type?.replace(/([A-Z])/g, ' $1').trim() || t('unknown')}</span>
                {e.deviceId && (
                  <span className="text-xs text-muted-foreground">· {vehicleLabel(e.deviceId) || `${t('devicePrefix')} #${e.deviceId}`}</span>
                )}
              </div>
              {e.geofenceId && (
                <p className="text-xs text-muted-foreground mt-0.5">{t('geofencePrefix')} #{e.geofenceId}</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <time className="text-xs text-muted-foreground">{formatDate(e.eventTime)}</time>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
