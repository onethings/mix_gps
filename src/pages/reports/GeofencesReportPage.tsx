import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
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
  { key: 'geofenceId', labelKey: 'geofence' },
  { key: 'deviceName', labelKey: 'deviceName', always: true },
  { key: 'startTime', labelKey: 'startTime' },
  { key: 'endTime', labelKey: 'endTime' },
  { key: 'duration', labelKey: 'duration' },
];

function formatGeofenceCell(key: string, r: any): string {
  if (key === 'startTime' || key === 'endTime') return formatDate(r[key] || '');
  if (key === 'duration') return formatDuration(r.duration || 0);
  if (key === 'geofenceId') return r.geofenceName || `#${r.geofenceId}`;
  return String(r[key] ?? '—');
}

export default function GeofencesReportPage() {
  const { t } = useT();
  const { devices } = useLiveData();
  const nameByDeviceId = useMemo(() => { const m: Record<number, string> = {}; devices.forEach((d) => { m[d.id] = d.name; }); return m; }, [devices]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(['geofenceId', 'startTime', 'endTime']));
  const [geofenceList, setGeofenceList] = useState<any[]>([]);
  const [selectedGeofenceIds, setSelectedGeofenceIds] = useState<Set<number>>(new Set());
  const [q, setQ] = useState('');
  const [showTriggered, setShowTriggered] = useState(false);
  const fetchKeyRef = useRef(0);

  // Fetch geofence list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const data = await api.geofences.list() as any[]; if (!cancelled) setGeofenceList(Array.isArray(data) ? data : []); } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleShow = useCallback((value: ReportFilterValue) => {
    const key = ++fetchKeyRef.current;
    setShowTriggered(true);
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const params: any = { from: value.from, to: value.to, deviceId: value.deviceIds };
        if (selectedGeofenceIds.size > 0) params.geofenceId = Array.from(selectedGeofenceIds);
        const data = await api.reports.geofences(params) as any[];
        if (key !== fetchKeyRef.current) return;
        const enriched = (data || []).map((row: any) => ({
          ...row,
          deviceName: nameByDeviceId[row.deviceId] || `Device ${row.deviceId}`,
          geofenceName: geofenceList.find((g: any) => g.id === row.geofenceId)?.name || `#${row.geofenceId}`,
        }));
        enriched.sort((a: any, b: any) => ((b.startTime) || '').localeCompare((a.startTime) || ''));
        setRows(enriched);
      } catch (e) {
        if (key === fetchKeyRef.current) setError((e as Error).message || 'Failed');
      } finally {
        if (key === fetchKeyRef.current) setLoading(false);
      }
    })();
  }, [nameByDeviceId, geofenceList, selectedGeofenceIds]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      (r.deviceName || '').toLowerCase().includes(needle)
    );
  }, [rows, q]);

  const activeColumns = useMemo(() => COLUMNS.filter((c) => visibleCols.has(c.key) || c.always), [visibleCols]);
  const toggleColumn = useCallback((key: string) => {
    setVisibleCols((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }, []);

  return (
    <div className="space-y-3 md:space-y-5">
      <PageHeader title={t('geofences')} description={t('reportApiDesc')} className="max-md:hidden" />
      <ReportFilter loading={loading} onShow={handleShow}
        columnDefs={COLUMNS} visibleColumns={visibleCols} onToggleColumn={toggleColumn}
        extraFilters={
          <div className="inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs">
            <span className="text-muted-foreground">{t('geofence')}:</span>
            <select
              value={selectedGeofenceIds.size === 0 ? 'all' : Array.from(selectedGeofenceIds)[0]?.toString() || 'all'}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedGeofenceIds(val === 'all' ? new Set() : new Set([Number(val)]));
              }}
              className="bg-transparent text-foreground outline-none text-xs max-w-[140px]"
            >
              <option value="all">{t('allGeofences')}</option>
              {geofenceList.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        }
      >
        <ExportButton disabled={!filtered.length}
          csv={{
            onClick: () => {
              const csvHeaders = activeColumns.map((c) => t(c.labelKey));
              downloadCsv(`geofences-${new Date().toISOString().slice(0, 10)}.csv`, csvHeaders,
                filtered.map((r) => activeColumns.map((c) => formatGeofenceCell(c.key, r)))
              );
            }
          }}
          excel={{
            onClick: () => {
              const excelHeaders = activeColumns.map((c) => t(c.labelKey));
              downloadExcel(`geofences-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Geofences Report',
                [{ name: 'Geofences', rows: filtered.map((r) => {
                  const obj: Record<string, string> = {};
                  activeColumns.forEach((c) => { obj[t(c.labelKey)] = formatGeofenceCell(c.key, r); });
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
                rows: rows.map((r) => activeColumns.map((c) => formatGeofenceCell(c.key, r))),
              }));
              downloadPdf(`geofences-${new Date().toISOString().slice(0, 10)}.pdf`, 'Geofences Report', pdfGroups);
            }
          }}
        />
      </ReportFilter>
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('geofenceEvents')}</CardTitle>
            <CardDescription>
              {!showTriggered ? t('setFiltersAndShow') : loading ? t('loading') : `${filtered.length} results`}
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
          {!showTriggered ? <div className="p-4 md:p-6"><EmptyState title={t('setFiltersAndShow')} /></div>
          : loading ? (
            <div className="p-0">
              <Table><TableHeader><TableRow>{activeColumns.map((c) => <TableHead key={c.key}>{t(c.labelKey)}</TableHead>)}</TableRow></TableHeader><TableBody>
                {[1,2,3,4,5].map((i) => (
                  <TableRow key={i}>{activeColumns.map((_, j) => <TableCell key={j}><div className="h-4 w-full animate-pulse rounded bg-muted" /></TableCell>)}</TableRow>
                ))}
              </TableBody></Table>
            </div>
          ) : error ? <div className="p-4 md:p-6 text-center text-sm text-destructive">{error}</div>
          : filtered.length === 0 ? <div className="p-4 md:p-6"><EmptyState title={t('noEventsInRange')} /></div>
          : <Table><TableHeader><TableRow>
            {activeColumns.map((c) => <TableHead key={c.key}>{t(c.labelKey)}</TableHead>)}
          </TableRow></TableHeader><TableBody>
            {filtered.map((row, i) => (
              <TableRow key={row.id || i}>
                {activeColumns.map((c) => (
                  <TableCell key={c.key} className="text-xs text-muted-foreground">
                    {c.key === 'deviceName' ? <span className="font-medium text-foreground">{row.deviceName}</span> :
                     c.key === 'startTime' || c.key === 'endTime' ? formatDate(row[c.key] || '') :
                     c.key === 'duration' ? formatDuration(row.duration || 0) :
                     c.key === 'geofenceId' ? (row.geofenceName || `#${row.geofenceId}`) :
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
