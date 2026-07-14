import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn, formatDate, formatDistance, formatDuration } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { Vehicle, TraccarReportTrip } from '@/types';

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function dayKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface ReplaySidebarProps {
  vehicles: Vehicle[];
  deviceId: string;
  onDeviceChange: (id: string) => void;
  calYear: number;
  calMonth: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  dailyKm: Record<string, number>;
  loadingKm: boolean;
  kmError?: string | null;
  selectedDate: string | null;
  onDayClick: (day: number) => void;
  trips: TraccarReportTrip[];
  loadingTrips: boolean;
  onTripClick?: (trip: TraccarReportTrip) => void;
  onSearchChange?: (q: string) => void;
}

export default function ReplaySidebar({
  vehicles,
  deviceId,
  onDeviceChange,
  calYear,
  calMonth,
  onPrevMonth,
  onNextMonth,
  dailyKm,
  loadingKm,
  selectedDate,
  onDayClick,
  kmError,
  trips,
  loadingTrips,
  onTripClick,
  onSearchChange,
}: ReplaySidebarProps) {
  const { t } = useT();
  const [searchQ, setSearchQ] = useState('');
  const today = new Date();
  const dim = daysInMonth(calYear, calMonth);
  const firstDay = new Date(calYear, calMonth, 1).getDay();

  const handleSearch = (val: string) => {
    setSearchQ(val);
    onSearchChange?.(val);
  };

  const filteredTrips = useMemo(() => {
    if (!searchQ.trim()) return trips;
    const q = searchQ.toLowerCase();
    return trips.filter((t) =>
      String(t.deviceName).toLowerCase().includes(q) ||
      String(t.startAddress || '').toLowerCase().includes(q) ||
      String(t.endAddress || '').toLowerCase().includes(q),
    );
  }, [trips, searchQ]);

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Device selector */}
      <div className="border-b border-border px-3 py-2.5">
        <label className="flex items-center gap-2 text-xs font-medium">
          <span className="text-muted-foreground shrink-0">{t('device')}</span>
          <select
            value={deviceId}
            onChange={(e) => onDeviceChange(e.target.value)}
            className="h-8 flex-1 rounded border border-input bg-background px-2 text-xs outline-none"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Calendar */}
      <div className="border-b border-border p-3">
        {/* Month navigation */}
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={onPrevMonth} className="rounded p-1 hover:bg-accent">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">
            {new Date(calYear, calMonth).toLocaleString('default', { month: 'short', year: 'numeric' })}
          </span>
          <button
            type="button"
            onClick={onNextMonth}
            className="rounded p-1 hover:bg-accent"
            disabled={calYear === today.getFullYear() && calMonth === today.getMonth()}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Day headers */}
        <div className="mb-1 grid grid-cols-7 gap-px text-center text-[10px] font-medium text-muted-foreground">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <div key={d} className="py-0.5">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-px">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`e${i}`} />
          ))}
          {Array.from({ length: dim }, (_, i) => {
            const day = i + 1;
            const dk = dayKey(calYear, calMonth, day);
            const km = dailyKm[dk];
            const isToday =
              calYear === today.getFullYear() &&
              calMonth === today.getMonth() &&
              day === today.getDate();
            const isSelected = selectedDate === dk;
            const hasData = km != null;
            return (
              <button
                key={day}
                type="button"
                onClick={() => onDayClick(day)}
                disabled={!deviceId}
                className={cn(
                  'flex flex-col items-center rounded px-0.5 py-1 text-[11px] leading-tight transition-colors',
                  isSelected && 'bg-primary text-primary-foreground',
                  !isSelected && isToday && 'ring-1 ring-inset ring-primary/40',
                  !isSelected && !isToday && 'hover:bg-accent',
                  !deviceId && 'opacity-40 cursor-not-allowed',
                )}
              >
                <span className="font-medium">{day}</span>
                {loadingKm ? (
                  <span className="text-[9px] opacity-60">…</span>
                ) : hasData ? (
                  <span className="text-[9px] tabular-nums">{km}km</span>
                ) : (
                  <span className="text-[9px] opacity-30">—</span>
                )}
              </button>
            );
          })}
        </div>
        {kmError && (
          <div className="mt-1 rounded border border-destructive/30 bg-destructive/10 px-1 py-0.5 text-[9px] text-destructive">
            {kmError}
          </div>
        )}
      </div>

      {/* Search + Trip List */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedDate && (
          <div className="border-b border-border px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('searchTrips')}
                value={searchQ}
                onChange={(e) => handleSearch(e.target.value)}
                className="h-8 w-full rounded border border-input bg-background pl-7 pr-2 text-[11px] outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loadingTrips && trips.length === 0 && (
            <div className="space-y-2 p-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          )}

          {!loadingTrips && trips.length === 0 && selectedDate && (
            <div className="flex items-center justify-center p-6 text-center">
              <p className="text-xs text-muted-foreground">{t('noTripsFound') || 'No trips found'}</p>
            </div>
          )}

          {!selectedDate && (
            <div className="flex items-center justify-center p-6 text-center">
              <p className="text-xs text-muted-foreground">{t('selectDateToView')}</p>
            </div>
          )}

          {filteredTrips.map((trip, i) => (
            <button
              key={`${trip.deviceId}-${trip.startTime}-${i}`}
              type="button"
              onClick={() => onTripClick?.(trip)}
              className="w-full border-b border-border/40 px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">
                  Trip {i + 1}
                </span>
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                  {formatDistance(trip.distance)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{formatDate(trip.startTime)}</span>
                <span className="text-muted-foreground/40">→</span>
                <span>{formatDate(trip.endTime)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>{formatDuration(trip.duration)}</span>
                <span className="text-muted-foreground/30">|</span>
                <span>{trip.averageSpeed?.toFixed(0)} km/h avg</span>
                <span className="text-muted-foreground/30">|</span>
                <span className="text-amber-600 font-medium">{trip.maxSpeed?.toFixed(0)} km/h max</span>
              </div>
              {(trip.startAddress || trip.endAddress) && (
                <div className="mt-0.5 truncate text-[10px] text-muted-foreground/60">
                  {trip.startAddress || '—'} → {trip.endAddress || '—'}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Trip count footer */}
        {trips.length > 0 && (
          <div className="border-t border-border bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground">
            <span className="font-semibold text-foreground">{filteredTrips.length}</span> trips
            {filteredTrips.length !== trips.length && (
              <span className="ml-1">(filtered from {trips.length})</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
