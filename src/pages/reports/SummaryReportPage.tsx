import { useCallback, useMemo, useRef, useState } from 'react';
import { Search, ToggleLeft, ToggleRight } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { formatDate, formatDuration } from '@/lib/utils';
import { api } from '@/lib/api';
import { useLiveData } from '@/context/LiveDataContext';
import { useT } from '@/lib/i18n';
import ReportFilter from '@/components/reports/ReportFilterV2';
import type { ReportFilterValue } from '@/components/reports/ReportFilterV2';
import ExportButton from '@/components/reports/ExportButton';
import { downloadCsv, downloadExcel, downloadPdf } from '@/lib/exportUtils';

const COLUMNS = [
  { key: 'deviceName', labelKey: 'deviceName', always: true },
  { key: 'startTime', labelKey: 'startTime' },
  { key: 'distance', labelKey: 'distance' },
  { key: 'averageSpeed', labelKey: 'averageSpeed' },
  { key: 'maxSpeed', labelKey: 'maxSpeed' },
  { key: 'spentFuel', labelKey: 'spentFuel' },
  { key: 'engineHours', labelKey: 'engineHours' },
  { key: 'startOdometer', labelKey: 'startOdometer' },
  { key: 'endOdometer', labelKey: 'endOdometer' },
  { key: 'startHours', labelKey: 'startHours' },
  { key: 'endHours', labelKey: 'endHours' },
];

function formatSummaryCell(key: string, r: any): string {
  if (key === 'startTime') return formatDate(r[key] || '');
  if (key === 'distance') return `${((r.distance || 0) / 1000).toFixed(1)} km`;
  if (key === 'averageSpeed' || key === 'maxSpeed') return `${((r[key] || 0) * 1.852).toFixed(1)} km/h`;
  if (key === 'spentFuel') return `${(r.spentFuel || 0).toFixed(1)} L`;
  if (key === 'engineHours') return `${((r.engineHours || 0) / 3600).toFixed(1)} h`;
  if (key === 'startHours' || key === 'endHours') return r[key] != null ? `${(r[key] / 3600).toFixed(1)} h` : '—';
  if (key === 'startOdometer' || key === 'endOdometer') return `${((r[key] || 0) / 1000).toFixed(1)} km`;
  return String(r[key] ?? '—');
}

export default function SummaryReportPage() {
  const { t } = useT();
  const { devices } = useLiveData();
  const nameByDeviceId = useMemo(() => { const m: Record<number, string> = {}; devices.forEach((d) => { m[d.id] = d.name; }); return m; }, [devices]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [daily, setDaily] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(['startTime', 'distance', 'averageSpeed', 'maxSpeed']));
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
        const params: any = { from: value.from, to: value.to, deviceId: value.deviceIds };
        if (daily) params.daily = true;
        const data = await api.reports.summary(params) as any[];
        if (key !== fetchKeyRef.current) return;
        const enriched = (data || []).map((row: any) => ({
          ...row,
          deviceName: nameByDeviceId[row.deviceId] || `Device ${row.deviceId}`,
        }));
        enriched.sort((a: any, b: any) => ((b.startTime) || '').localeCompare((a.startTime) || ''));
        setRows(enriched);
      } catch (e) {
        if (key === fetchKeyRef.current) setError((e as Error).message || 'Failed');
      } finally {
        if (key === fetchKeyRef.current) setLoading(false);
      }
    })();
  }, [nameByDeviceId, daily]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => (r.deviceName || '').toLowerCase().includes(needle));
  }, [rows, q]);

  const activeColumns = useMemo(() => COLUMNS.filter((c) => visibleCols.has(c.key) || c.always), [visibleCols]);
  const toggleColumn = useCallback((key: string) => {
    setVisibleCols((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }, []);

  return (
    <div className="space-y-3 md:space-y-5">
      <PageHeader title={t('summary')} description={t('reportApiDesc')} className="max-md:hidden" />
      <ReportFilter loading={loading} onShow={handleShow}
        columnDefs={COLUMNS} visibleColumns={visibleCols} onToggleColumn={toggleColumn}
        extraFilters={
          <button type="button" onClick={() => setDaily((v) => !v)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            {daily ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4" />}
            {daily ? t('daily') : t('summary')}
          </button>
        }
      >
        <ExportButton disabled={!filtered.length}
          csv={{
            onClick: () => {
              const csvHeaders = activeColumns.map((c) => t(c.labelKey));
              downloadCsv(`summary-${new Date().toISOString().slice(0, 10)}.csv`, csvHeaders,
                filtered.map((r) => activeColumns.map((c) => formatSummaryCell(c.key, r)))
              );
            }
          }}
          excel={{
            onClick: () => {
              const excelHeaders = activeColumns.map((c) => t(c.labelKey));
              downloadExcel(`summary-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Summary Report',
                [{ name: 'Summary', rows: filtered.map((r) => {
                  const obj: Record<string, string> = {};
                  activeColumns.forEach((c) => { obj[t(c.labelKey)] = formatSummaryCell(c.key, r); });
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
                rows: rows.map((r) => activeColumns.map((c) => formatSummaryCell(c.key, r))),
              }));
              downloadPdf(`summary-${new Date().toISOString().slice(0, 10)}.pdf`, 'Summary Report', pdfGroups);
            }
          }}
        />
      </ReportFilter>
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{daily ? t('daily') : t('summary')}</CardTitle>
            <CardDescription>
              {!showTriggered ? t('setFiltersAndShow') : loading ? t('loading') : `${filtered.length} ${t('results')}`}
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
          : filtered.length === 0 ? <div className="p-6"><EmptyState title={t('noSummaryData')} /></div>
          : <Table><TableHeader><TableRow>
            {activeColumns.map((c) => <TableHead key={c.key}>{t(c.labelKey)}</TableHead>)}
          </TableRow></TableHeader><TableBody>
            {filtered.map((row, i) => (
              <TableRow key={row.id || i}>
                {activeColumns.map((c) => (
                  <TableCell key={c.key} className="text-xs text-muted-foreground">
                    {c.key === 'deviceName' ? <span className="font-medium text-foreground">{row.deviceName}</span> :
                     c.key === 'startTime' ? formatDate(row[c.key] || '') :
                     c.key === 'distance' ? `${((row.distance || 0) / 1000).toFixed(1)} km` :
                     c.key === 'averageSpeed' || c.key === 'maxSpeed' ? `${((row[c.key] || 0) * 1.852).toFixed(1)} km/h` :
                     c.key === 'spentFuel' ? `${(row.spentFuel || 0).toFixed(1)} L` :
                     c.key === 'engineHours' ? `${((row.engineHours || 0) / 3600).toFixed(1)} h` :
                     c.key === 'startOdometer' || c.key === 'endOdometer' ? `${((row[c.key] || 0) / 1000).toFixed(1)} km` :
                     c.key === 'startHours' || c.key === 'endHours' ? (row[c.key] != null ? `${(row[c.key] / 3600).toFixed(1)} h` : '—') :
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
