import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import ReportToolbar from '@/components/reports/ReportToolbar';
import EmptyState from '@/components/common/EmptyState';
import ExportButton from '@/components/reports/ExportButton';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/context/SessionContext';
import { formatDate } from '@/lib/utils';
import { downloadCsv, downloadExcel, downloadPdf } from '@/lib/exportUtils';

type ReportParams = Record<string, unknown>;

const FETCHERS: Record<string, (p: ReportParams) => Promise<unknown>> = {
  trips: (p) => api.reports.trips(p),
  route: (p) => api.reports.route(p),
  stops: (p) => api.reports.stops(p),
  summary: (p) => api.reports.summary(p),
  events: (p) => api.reports.events(p),
  geofences: (p) => api.reports.geofences(p),
  combined: (p) => api.reports.combined(p),
  chart: (p) => api.reports.chart(p),
};

const KNOTS_TO_KMH = 1.852;
const KNOTS_TO_MPH = 1.15078;

const SPEED_FIELDS = new Set(['averageSpeed', 'maxSpeed', 'speed', 'avgSpeed']);
const DISTANCE_FIELDS = new Set(['distance', 'startOdometer', 'endOdometer', 'odometer', 'totalDistance']);
const TIME_FIELDS = new Set(['startTime', 'endTime', 'eventTime', 'serverTime', 'fixTime', 'deviceTime']);
const DURATION_FIELDS = new Set(['duration']);
const FUEL_FIELDS = new Set(['spentFuel', 'fuelUsed']);
const ENGINE_HOURS_FIELDS = new Set(['engineHours']);

function readableLabel(key: string, t: (k: string) => string): string {
  const translated = t(`reportCol${key.charAt(0).toUpperCase() + key.slice(1)}`);
  if (translated !== `reportCol${key.charAt(0).toUpperCase() + key.slice(1)}`) return translated;
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

function formatCell(key: string, value: unknown, speedUnit: string, t: (k: string) => string): string {
  if (value == null) return '—';

  if (key === 'type' && typeof value === 'string') {
    const translated = t(`eventType_${value}`);
    if (translated !== `eventType_${value}`) return translated;
    return value.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
  }

  if (TIME_FIELDS.has(key)) return formatDate(value as string);

  if (DURATION_FIELDS.has(key)) {
    const totalSec = Number(value) / 1000;
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.round(totalSec % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  if (DISTANCE_FIELDS.has(key)) {
    const km = Number(value) / 1000;
    if (km >= 1000) return `${(km / 1000).toFixed(1)}k km`;
    return `${km.toFixed(1)} km`;
  }

  if (SPEED_FIELDS.has(key)) {
    const factor = speedUnit === 'kmh' ? KNOTS_TO_KMH : KNOTS_TO_MPH;
    const converted = Number(value) * factor;
    const label = speedUnit === 'kmh' ? 'km/h' : 'mph';
    return `${converted.toFixed(1)} ${label}`;
  }

  if (FUEL_FIELDS.has(key)) {
    return `${Math.round(Number(value) * 10) / 10} L`;
  }

  if (ENGINE_HOURS_FIELDS.has(key)) {
    const h = Number(value) / 3600;
    return `${h.toFixed(1)} h`;
  }

  if (typeof value === 'object') return JSON.stringify(value).slice(0, 60);

  return String(value).slice(0, 80);
}

export default function ReportPage() {
  const { t } = useT();
  const { user } = useSession();
  const speedUnit = (user?.attributes as Record<string, string> | undefined)?.speedUnit || 'kmh';
  const { type } = useParams<{ type: string }>();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = type ? FETCHERS[type] : undefined;

  useEffect(() => {
    if (!fetcher) return;
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (!from || !to) { setRows(null); setError(null); return; }
    const deviceIds = searchParams.getAll('deviceId').map(Number).filter((n) => Number.isFinite(n));
    const params: ReportParams = { from, to };
    if (deviceIds.length) params.deviceId = deviceIds;

    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const data = await fetcher(params);
        if (cancelled) return;
        if (Array.isArray(data)) setRows(data as Record<string, unknown>[]);
        else if (data) setRows([data as Record<string, unknown>]);
        else setRows([]);
      } catch (e) {
        if (!cancelled) { setError((e as Error).message || 'Failed'); setRows(null); }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [searchParams, fetcher, type]);

  const keys = useMemo(() => {
    if (!rows?.length || typeof rows[0] !== 'object') return [];
    const allKeys = Object.keys(rows[0]);
    return allKeys.slice(0, 12);
  }, [rows]);

  if (!fetcher) return <EmptyState title={t('unknownReportType')} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(type || '') || type || ''}
        description={t('reportApiDesc')}
        actions={
          <>
            <ExportButton disabled={!rows?.length}
              csv={{
                onClick: () => {
                  if (!rows?.length) return;
                  const csvHeaders = keys.map((k) => readableLabel(k, t));
                  downloadCsv(`${type}-${new Date().toISOString().slice(0, 10)}.csv`, csvHeaders,
                    rows.map((row) => keys.map((k) => formatCell(k, row[k], speedUnit, t)))
                  );
                }
              }}
              excel={{
                onClick: () => {
                  if (!rows?.length) return;
                  const excelHeaders = keys.map((k) => readableLabel(k, t));
                  downloadExcel(`${type}-${new Date().toISOString().slice(0, 10)}.xlsx`, `${type} Report`,
                    [{ name: type || 'Data', rows: rows.map((row) => {
                      const obj: Record<string, string> = {};
                      keys.forEach((k) => { obj[readableLabel(k, t)] = formatCell(k, row[k], speedUnit, t); });
                      return obj;
                    })}]
                  );
                }
              }}
              pdf={{
                onClick: () => {
                  if (!rows?.length) return;
                  const pdfHeaders = keys.map((k) => readableLabel(k, t));
                  // Group by deviceId if available
                  const hasDeviceId = rows.some((r: any) => r.deviceId != null);
                  if (hasDeviceId) {
                    const groupsMap = new Map<string, typeof rows>();
                    rows.forEach((r: any) => {
                      const name = r.deviceName || `Device ${r.deviceId}`;
                      if (!groupsMap.has(name)) groupsMap.set(name, []);
                      groupsMap.get(name)!.push(r);
                    });
                    const pdfGroups = Array.from(groupsMap.entries()).map(([deviceName, groupRows]) => ({
                      title: deviceName,
                      headers: pdfHeaders,
                      rows: groupRows.map((row: any) => keys.map((k) => formatCell(k, row[k], speedUnit, t))),
                    }));
                    downloadPdf(`${type}-${new Date().toISOString().slice(0, 10)}.pdf`, `${type} Report`, pdfGroups);
                  } else {
                    downloadPdf(`${type}-${new Date().toISOString().slice(0, 10)}.pdf`, `${type} Report`, pdfHeaders,
                      rows.map((row: any) => keys.map((k) => formatCell(k, row[k], speedUnit, t)))
                    );
                  }
                }
              }}
            />
            <Link to="/reports" className="text-sm text-primary underline">{t('allReports')}</Link>
          </>
        }
      />
      <ReportToolbar loading={loading} />

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {keys.map((k) => <th key={k} className="px-4 py-3">{readableLabel(k, t)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                  {keys.map((k) => (
                    <td key={k} className="px-4 py-2.5 text-xs tabular-nums">
                      {formatCell(k, row[k], speedUnit, t)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">{t('loading')}</div>
      ) : (
        <EmptyState title={t('noData')} description={t('selectTimeDevice')} />
      )}
    </div>
  );
}
