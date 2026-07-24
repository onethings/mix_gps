import { useMemo, useState, memo } from 'react';
import StatusBadge from '@/components/common/StatusBadge';
import { cn, formatDate } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { Vehicle } from '@/types';

type BottomTab = 'checked' | 'emergency' | 'alarm';

function getLocType(vehicle: Vehicle, t: (key: string) => string): string {
  if (vehicle.lat == null || vehicle.lng == null) return '—';
  if (vehicle.address) return t('locTypeAddress');
  return t('locTypeCoords');
}

function getLocatedStatus(vehicle: Vehicle, t: (key: string) => string): string {
  if (vehicle.lat == null || vehicle.lng == null) return t('noGps');
  if (Number(vehicle.lat) === 0 && Number(vehicle.lng) === 0) return t('invalidGps');
  return t('located');
}

interface LiveTrackingBottomPanelProps {
  vehicles: Vehicle[];
  selectedId: number | null;
  onSelect: (vehicle: Vehicle) => void;
}

const LiveTrackingBottomPanel = memo(function LiveTrackingBottomPanel({ vehicles, selectedId, onSelect }: LiveTrackingBottomPanelProps) {
  const { t } = useT();
  const [tab, setTab] = useState<BottomTab>('checked');
  const [localQ, setLocalQ] = useState('');

  // Classify vehicles by tab
  const { checked, emergency, alarm } = useMemo(() => {
    const ckd: Vehicle[] = [];
    const emg: Vehicle[] = [];
    const alm: Vehicle[] = [];

    vehicles.forEach((v) => {
      if (v.status === 'alert') {
        alm.push(v);
      } else if (v.status === 'offline') {
        emg.push(v);
      } else {
        ckd.push(v);
      }
    });

    return { checked: ckd, emergency: emg, alarm: alm };
  }, [vehicles]);

  const activeList = useMemo(() => {
    switch (tab) {
      case 'emergency': return emergency;
      case 'alarm': return alarm;
      default: return checked;
    }
  }, [tab, checked, emergency, alarm]);

  const filtered = useMemo(() => {
    if (!localQ.trim()) return activeList;
    const q = localQ.toLowerCase();
    return activeList.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.plate.toLowerCase().includes(q) ||
        v.driver.toLowerCase().includes(q),
    );
  }, [activeList, localQ]);

  const allTabs: { key: BottomTab; label: string; count: number }[] = [
    { key: 'checked', label: t('checked'), count: vehicles.length },
    { key: 'emergency', label: t('emergency'), count: emergency.length },
    { key: 'alarm', label: t('alarm'), count: alarm.length },
  ];

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border bg-muted/20 px-3">
        {allTabs.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors',
              tab === key
                ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
            )}
          >
            {label}
            <span className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
              tab === key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
            )}>
              {count}
            </span>
          </button>
        ))}
        {/* Search */}
        <div className="ml-auto flex items-center">
          <input
            type="text"
            placeholder={t('search')}
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            className="h-7 w-44 rounded border border-input bg-background px-2 text-[11px] outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto" style={{ contain: 'layout' }}>
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr className="border-b border-border">
              {[['sn', 'SN'], ['status', 'Status'], ['name', 'Name'], ['lastUpdate', 'Update'], ['located', 'Located'], ['locType', 'Loc Type'], ['speed', 'Speed'], ['address', 'Address']].map(([key, fallback]) => (
                <th key={fallback} className="whitespace-nowrap px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((v, i) => (
              <tr
                key={v.id}
                onClick={() => onSelect(v)}
                className={cn(
                  'border-b border-border/40 transition-colors cursor-pointer',
                  selectedId === v.id ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : 'hover:bg-accent/40',
                )}
              >
                <td className="px-2.5 py-2 font-mono text-[10px] text-muted-foreground">{i + 1}</td>
                <td className="px-2.5 py-2">
                  <StatusBadge status={v.status} />
                </td>
                <td className="px-2.5 py-2 font-medium text-foreground">{v.name}</td>
                <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[10px] text-muted-foreground">
                  {formatDate(v.lastUpdate)}
                </td>
                <td className="px-2.5 py-2 text-muted-foreground">{getLocatedStatus(v, t)}</td>
                <td className="px-2.5 py-2 text-muted-foreground">{getLocType(v, t)}</td>
                <td className="px-2.5 py-2 font-mono tabular-nums text-foreground">{v.speed}</td>
                <td className="max-w-[200px] truncate px-2.5 py-2 text-muted-foreground" title={v.address || ''}>
                  {v.address || '—'}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-2.5 py-8 text-center text-xs text-muted-foreground">
                  {t('noVehiclesFound')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 border-t border-border bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span><span className="font-semibold text-foreground">{vehicles.length}</span> {t('total')}</span>
        <span className="text-muted-foreground/30">|</span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          <span className="font-semibold text-foreground">{checked.length}</span> {t('checked')}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          <span className="font-semibold text-foreground">{alarm.length}</span> {t('alarm')}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span className="font-semibold text-foreground">{emergency.length}</span> {t('emergency')}
        </span>
      </div>
    </div>
  );
});

export default LiveTrackingBottomPanel;
