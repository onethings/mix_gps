import { useCallback, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { api } from '@/lib/api';
import { useLiveData } from '@/context/LiveDataContext';
import { useT } from '@/lib/i18n';
import ReportFilter from '@/components/reports/ReportFilterV2';
import type { ReportFilterValue } from '@/components/reports/ReportFilterV2';
import ExportButton from '@/components/reports/ExportButton';
import { downloadCsv, downloadExcel, downloadPdf } from '@/lib/exportUtils';

const COLUMNS = [
  { key: 'deviceName', labelKey: 'deviceName', always: true },
  { key: 'fixTime', labelKey: 'fixTime' },
  { key: 'latitude', labelKey: 'latitude' },
  { key: 'longitude', labelKey: 'longitude' },
  { key: 'speed', labelKey: 'speed' },
  { key: 'course', labelKey: 'course' },
  { key: 'altitude', labelKey: 'altitude' },
  { key: 'address', labelKey: 'address' },
];

function formatRouteCell(key: string, r: any): string {
  if (key === 'fixTime') return formatDate(r.fixTime || '');
  if (key === 'speed') return r.speedKmh || '—';
  if (key === 'latitude' || key === 'longitude') return (r[key] ?? '—').toString();
  return String(r[key] ?? '—');
}

export default function RouteReportPage() {
  const { t } = useT();
  const { devices } = useLiveData();
  const nameByDeviceId = useMemo(() => { const m: Record<number, string> = {}; devices.forEach((d) => { m[d.id] = d.name; }); return m; }, [devices]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(['fixTime', 'latitude', 'longitude', 'speed']));
  const [q, setQ] = useState('');
  const [showTriggered, setShowTriggered] = useState(false);
  const fetchKeyRef = useRef(0);

  const handleShow = useCallback((value: ReportFilterValue) => {
    const key = ++fetchKeyRef.current;
    setShowTriggered(true);
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await api.reports.route({ from: value.from, to: value.to, deviceId: value.deviceIds }) as any[];
        if (key !== fetchKeyRef.current) return;
        const enriched = (data || []).map((row: any) => ({
          ...row,
          deviceName: nameByDeviceId[row.deviceId] || `Device ${row.deviceId}`,
          speedKmh: row.speed != null ? (row.speed * 1.852).toFixed(1) : '—',
        }));
        enriched.sort((a: any, b: any) => ((b.fixTime) || '').localeCompare((a.fixTime) || ''));
        setRows(enriched);
      } catch (e) {
        if (key === fetchKeyRef.current) setError((e as Error).message || 'Failed');
      } finally {
        if (key === fetchKeyRef.current) setLoading(false);
      }
    })();
  }, [nameByDeviceId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      (r.deviceName || '').toLowerCase().includes(needle) ||
      (r.address || '').toLowerCase().includes(needle)
    );
  }, [rows, q]);

  const activeColumns = useMemo(() => COLUMNS.filter((c) => visibleCols.has(c.key) || c.always), [visibleCols]);
  const toggleColumn = useCallback((key: string) => {
    setVisibleCols((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }, []);

  return (
    <div className="space-y-3 md:space-y-5">
      <PageHeader title={t('route')} description={t('reportRouteDesc')} className="max-md:hidden" />
      <ReportFilter loading={loading} onShow={handleShow}
        columnDefs={COLUMNS} visibleColumns={visibleCols} onToggleColumn={toggleColumn}
      >
        <ExportButton disabled={!filtered.length}
          csv={{
            onClick: () => {
              const csvHeaders = activeColumns.map((c) => t(c.labelKey));
              downloadCsv(`route-${new Date().toISOString().slice(0, 10)}.csv`, csvHeaders,
                filtered.map((r) => activeColumns.map((c) => formatRouteCell(c.key, r)))
              );
            }
          }}
          excel={{
            onClick: () => {
              const excelHeaders = activeColumns.map((c) => t(c.labelKey));
              downloadExcel(`route-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Route Report',
                [{ name: 'Route', rows: filtered.map((r) => {
                  const obj: Record<string, string> = {};
                  activeColumns.forEach((c) => { obj[t(c.labelKey)] = formatRouteCell(c.key, r); });
                  return obj;
                })}]
              );
            }
          }}
          pdf={{
            onClick: () => {
              const pdfHeaders = activeColumns.map((c) => t(c.labelKey));
              const groupsMap = new Map<string, typeof filtered>();
              filtered.forEach((r) => {
                const name = r.deviceName || `Device ${r.deviceId}`;
                if (!groupsMap.has(name)) groupsMap.set(name, []);
                groupsMap.get(name)!.push(r);
              });
              const pdfGroups = Array.from(groupsMap.entries()).map(([deviceName, rows]) => ({
                title: deviceName,
                headers: pdfHeaders,
                rows: rows.map((r) => activeColumns.map((c) => formatRouteCell(c.key, r))),
              }));
              downloadPdf(`route-${new Date().toISOString().slice(0, 10)}.pdf`, 'Route Report', pdfGroups);
            }
          }}
        />
      </ReportFilter>
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('routePositions')}</CardTitle>
            <CardDescription>
              {!showTriggered ? t('setFiltersAndShow') : loading ? t('loading') : `${filtered.length} ${t('positions')}`}
            </CardDescription>
          </div>
          {showTriggered && !loading && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="h-9 w-60 pl-9" />
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!showTriggered ? <div className="p-6"><EmptyState title={t('setFiltersAndShow')} /></div>
          : loading ? <div className="p-6 text-center text-sm text-muted-foreground">{t('loading')}</div>
          : error ? <div className="p-6 text-center text-sm text-destructive">{error}</div>
          : filtered.length === 0 ? <div className="p-6"><EmptyState title={t('noPositionsInRange')} /></div>
          : <Table><TableHeader><TableRow>
            {activeColumns.map((c) => <TableHead key={c.key}>{t(c.labelKey)}</TableHead>)}
          </TableRow></TableHeader><TableBody>
            {filtered.map((row, i) => (
              <TableRow key={row.id || i}>
                {activeColumns.map((c) => (
                  <TableCell key={c.key} className="text-xs text-muted-foreground">
                    {c.key === 'deviceName' ? <span className="font-medium text-foreground">{row.deviceName}</span> :
                     c.key === 'fixTime' ? formatDate(row.fixTime || '') :
                     c.key === 'speed' ? (row.speedKmh || '—') :
                     c.key === 'latitude' ? row.latitude?.toFixed(6) :
                     c.key === 'longitude' ? row.longitude?.toFixed(6) :
                     c.key === 'course' ? (row.course != null ? `${row.course}°` : '—') :
                     c.key === 'altitude' ? (row.altitude != null ? `${row.altitude} m` : '—') :
                     String(row[c.key] ?? '—')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody></Table>}
        </CardContent>
      </Card>
    </div>
  );
}
