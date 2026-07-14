import { useCallback, useMemo, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLiveData } from '@/context/LiveDataContext';
import { useReportFilter } from '@/context/ReportFilterContext';
import { useT } from '@/lib/i18n';

/* ── Types ── */
export type PeriodKey = 'today' | 'yesterday' | 'thisWeek' | 'prevWeek' | 'thisMonth' | 'prevMonth' | 'custom';

export interface ReportFilterValue {
  deviceIds: number[];
  from: string;
  to: string;
}

interface ColumnDef {
  key: string;
  labelKey: string;
  always?: boolean;
}

interface ReportFilterProps {
  children?: React.ReactNode;
  loading?: boolean;
  onShow: (value: ReportFilterValue) => void;
  extraFilters?: React.ReactNode;
  columnDefs?: ColumnDef[];
  visibleColumns?: Set<string>;
  onToggleColumn?: (key: string) => void;
}

/* ── Period presets ── */
const PERIODS: PeriodKey[] = ['today', 'yesterday', 'thisWeek', 'prevWeek', 'thisMonth', 'prevMonth', 'custom'];

export function periodToRange(key: PeriodKey): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const day = now.getDay();
  switch (key) {
    case 'today': return { from: new Date(y, m, d), to: now };
    case 'yesterday': {
      const yest = new Date(y, m, d - 1);
      return { from: yest, to: new Date(y, m, d, 0, 0, 0, -1) };
    }
    case 'thisWeek': {
      const mon = new Date(y, m, d - (day === 0 ? 6 : day - 1));
      return { from: mon, to: now };
    }
    case 'prevWeek': {
      const prevMon = new Date(y, m, d - (day === 0 ? 6 : day - 1) - 7);
      const prevSun = new Date(prevMon);
      prevSun.setDate(prevSun.getDate() + 6);
      prevSun.setHours(23, 59, 59, 999);
      return { from: prevMon, to: prevSun };
    }
    case 'thisMonth': return { from: new Date(y, m, 1), to: now };
    case 'prevMonth': return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59, 999) };
    default: return { from: new Date(Date.now() - 86400000), to: now };
  }
}

/* ── Dropdown ── */
function Dropdown({ label, icon: Icon, children, align = 'left' }: { label: string; icon?: any; children: React.ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="relative" onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget)) setOpen(false); }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground hover:bg-accent transition-colors whitespace-nowrap"
      >
        {Icon && <Icon className="h-4 w-4" />}{label}
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={`absolute z-20 mt-1 min-w-[180px] rounded-lg border bg-popover p-1 shadow-md ${align === 'right' ? 'right-0' : 'left-0'}`}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Export CSV helper ── */
export function downloadCsvBlob(filename: string, headers: string[], rows: string[][]) {
  const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── ReportFilter Component ── */
export default function ReportFilter({ children, loading, onShow, extraFilters, columnDefs, visibleColumns, onToggleColumn }: ReportFilterProps) {
  const { t } = useT();
  const { devices } = useLiveData();
  const { filters, setSelectedDeviceIds, setPeriod } = useReportFilter();
  const { selectedDeviceIds, period } = filters;
  const allDeviceIds = useMemo(() => devices.map((d) => d.id), [devices]);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const selectedPeriodLabel = t(period);
  const selectedDeviceCount = selectedDeviceIds.length === 0 ? allDeviceIds.length : selectedDeviceIds.length;

  const handleShow = useCallback(() => {
    const ids = selectedDeviceIds.length === 0 ? allDeviceIds : selectedDeviceIds;
    let fromIso: string, toIso: string;
    if (period === 'custom') {
      fromIso = customFrom ? new Date(customFrom).toISOString() : '';
      toIso = customTo ? new Date(customTo).toISOString() : '';
    } else {
      const range = periodToRange(period);
      fromIso = range.from.toISOString();
      toIso = range.to.toISOString();
    }
    onShow({ deviceIds: ids, from: fromIso, to: toIso });
  }, [selectedDeviceIds, allDeviceIds, period, customFrom, customTo, onShow]);

  const canShow = period !== 'custom' || (customFrom && customTo);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      {/* Devices */}
      <Dropdown label={selectedDeviceIds.length === 0 ? `${t('allDevices')} (${allDeviceIds.length})` : t('deviceSelected').replace('{n}', String(selectedDeviceCount))}>
        <div className="max-h-56 overflow-y-auto">
          <button type="button"
            className={`flex w-full items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors ${selectedDeviceIds.length === 0 ? 'bg-accent/50' : ''}`}
            onClick={() => setSelectedDeviceIds([])}
          >
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selectedDeviceIds.length === 0 ? 'border-primary bg-primary' : 'border-input'}`}>
              {selectedDeviceIds.length === 0 && <Check className="h-3 w-3 text-primary-foreground" />}
            </span>
            <span className="font-medium">{t('allDevices')}</span>
          </button>
          <div className="border-t my-1" />
          {devices.map((d) => {
            const checked = selectedDeviceIds.length === 0 || selectedDeviceIds.includes(d.id);
            return (
              <button key={d.id} type="button"
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors ${checked ? 'bg-accent/50' : ''}`}
                onClick={() => {
                  setSelectedDeviceIds((prev) => {
                    if (prev.length === 0) return [d.id];
                    return checked ? prev.filter((id) => id !== d.id) : [...prev, d.id];
                  });
                }}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-primary bg-primary' : 'border-input'}`}>
                  {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                </span>
                <span className="flex-1 truncate text-left">{d.name}</span>
                <span className="text-[10px] text-muted-foreground">{d.uniqueId}</span>
              </button>
            );
          })}
        </div>
      </Dropdown>

      {/* Groups placeholder */}
      <div className="flex h-9 items-center rounded-md border border-input bg-background px-3 text-xs font-medium text-muted-foreground">{t('groups')}</div>

      {/* Period */}
      <Dropdown label={selectedPeriodLabel} icon={Calendar}>
        {PERIODS.map((key) => (
          <button key={key} type="button"
            className={`flex w-full items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors ${period === key ? 'bg-accent font-medium' : ''}`}
            onClick={() => setPeriod(key)}
          >
            {period === key && <Check className="h-3.5 w-3.5 text-primary" />}
            <span className={period === key ? '' : 'ml-5'}>{t(key)}</span>
          </button>
        ))}
      </Dropdown>

      {/* Custom date */}
      {period === 'custom' && (
        <div className="flex items-center gap-1.5">
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-36 text-xs" />
          <span className="text-xs text-muted-foreground">—</span>
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-36 text-xs" />
        </div>
      )}

      {/* Extra filters (event type, geofence, etc.) */}
      {extraFilters}

      {/* Columns */}
      {columnDefs && visibleColumns && onToggleColumn && (
        <Dropdown label={`${visibleColumns.size} ${t('columns')}`} align="right">
          <div className="max-h-64 overflow-y-auto">
            {columnDefs.filter((c) => !c.always).map((c) => (
              <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent rounded cursor-pointer">
                <input type="checkbox" checked={visibleColumns.has(c.key)}
                  onChange={() => onToggleColumn(c.key)} className="rounded" />
                {t(c.labelKey)}
              </label>
            ))}
          </div>
        </Dropdown>
      )}

      {/* Show */}
      <Button size="sm" onClick={handleShow} disabled={loading || !canShow}>
        {loading ? t('loading') : t('show')}
      </Button>

      {children}
    </div>
  );
}
