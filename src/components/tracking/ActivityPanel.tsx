import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import StatusBadge from '@/components/common/StatusBadge';
import { useLiveData } from '@/context/LiveDataContext';
import { useDeviceActivity } from '@/hooks/useDeviceActivity';
import { mergeLiveEvents, formatHoursMinutes, type ActivityEvent, type ActivityRange } from '@/lib/activity';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Vehicle } from '@/types';

const RANGES: ActivityRange[] = ['today', '24h'];
const KNOT_TO_KMH = 1.852;

function dotClass(type: string): string {
  if (type === 'alarm' || type === 'deviceOverspeed') return 'bg-red-500';
  if (type.startsWith('geofence')) return 'bg-indigo-500';
  if (type === 'deviceOnline' || type === 'ignitionOn') return 'bg-emerald-500';
  if (type === 'deviceOffline' || type === 'ignitionOff') return 'bg-slate-400';
  return 'bg-blue-400';
}

function humanizeType(type: string): string {
  return type.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

function eventLabel(ev: ActivityEvent, t: (key: string, fallback?: string) => string): string {
  const base = t(`eventType_${ev.type}`, humanizeType(ev.type));
  const alarm = ev.attributes?.alarm;
  if (ev.type === 'alarm' && typeof alarm === 'string') {
    return `${base} · ${t(`alarmType_${alarm}`, alarm)}`;
  }
  const speed = ev.attributes?.speed;
  if (ev.type === 'deviceOverspeed' && typeof speed === 'number') {
    return `${base} · ${Math.round(Number(speed) * KNOT_TO_KMH)} km/h`;
  }
  return base;
}

function eventTime(ms: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>{' '}
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </span>
  );
}

interface ActivityPanelProps {
  vehicle: Vehicle | null;
}

export default function ActivityPanel({ vehicle }: ActivityPanelProps) {
  const { t } = useT();
  const [range, setRange] = useState<ActivityRange>('today');
  const { data, loading, error, fetchedAt, refresh } = useDeviceActivity(vehicle?.id ?? null, range);
  const { events: liveEvents } = useLiveData();

  const merged = useMemo(() => {
    if (!data || vehicle?.id == null) return data?.events ?? [];
    return mergeLiveEvents(data.events, liveEvents, vehicle.id, data.fromMs);
  }, [data, liveEvents, vehicle?.id]);

  const stats = data?.stats ?? null;
  const isEmpty = merged.length === 0 && (!stats || stats.distanceKm === 0);

  let body: React.ReactNode;
  if (!vehicle) {
    body = (
      <div className="flex flex-1 items-center justify-center px-3 text-center">
        <p className="text-xs text-muted-foreground">
          {t('selectVehicleForActivity', 'Select a vehicle to see its recent activity.')}
        </p>
      </div>
    );
  } else if (error) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-3 text-center">
        <p className="text-xs text-destructive">{error}</p>
        <button type="button" onClick={refresh} className="text-[11px] text-primary hover:underline">
          {t('refresh')}
        </button>
      </div>
    );
  } else if (!data) {
    body = (
      <div className="flex-1 space-y-1.5 px-3 py-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  } else if (isEmpty) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-3 text-center">
        <p className="text-xs text-muted-foreground">
          {range === 'today'
            ? t('noActivityToday', 'No activity today.')
            : t('noActivityIn24h', 'No activity in the last 24 hours.')}
        </p>
        {range === 'today' && (
          <button type="button" onClick={() => setRange('24h')} className="text-[11px] text-primary hover:underline">
            {t('checkLast24h', 'Check last 24 hours')}
          </button>
        )}
      </div>
    );
  } else {
    body = (
      <>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-b border-border/60 px-3 py-1 text-[10px]">
          <Stat label={t('distance')} value={stats ? `${stats.distanceKm.toFixed(1)} km` : '—'} />
          <Stat label={t('engineHours', 'Engine hours')} value={stats ? formatHoursMinutes(stats.engineHours) : '—'} />
          <Stat label={t('maxSpeed', 'Max Speed')} value={stats ? `${Math.round(stats.maxSpeedKmh)} km/h` : '—'} />
          <Stat label={t('events')} value={String(merged.length)} />
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {merged.map((ev) => (
            <div key={ev.id} className="flex items-center gap-2.5 px-3 py-[3px] text-[11px]">
              <span className="w-14 shrink-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground">
                {eventTime(ev.eventTime)}
              </span>
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass(ev.type))} />
              <span className="min-w-0 flex-1 truncate text-foreground">{eventLabel(ev, t)}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        {vehicle && (
          <>
            <span className="truncate text-xs font-semibold">{vehicle.name}</span>
            <StatusBadge status={vehicle.status} />
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <div className="flex items-center rounded border border-border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] transition-colors',
                  range === r
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-accent/40',
                )}
              >
                {r === 'today' ? t('today') : t('last24h', 'Last 24 hours')}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={refresh}
            title={t('refresh')}
            aria-label={t('refresh')}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {body}

      {fetchedAt && (
        <div className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground">
          {t('updated')} {new Date(fetchedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
