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
import ReportFilter, { downloadCsvBlob } from '@/components/reports/ReportFilterV2';
import type { ReportFilterValue } from '@/components/reports/ReportFilterV2';

export default function LogsReportPage() {
  const { t } = useT();
  const { devices } = useLiveData();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        // Logs API: GET /api/positions/log?deviceId=&from=&to=
        const data = await api.positions.list({ from: value.from, to: value.to, deviceId: value.deviceIds }) as any[];
        if (key !== fetchKeyRef.current) return;
        setRows((data || []).sort((a: any, b: any) => ((b.serverTime || b.deviceTime) || '').localeCompare((a.serverTime || a.deviceTime) || '')));
      } catch (e) {
        if (key === fetchKeyRef.current) setError((e as Error).message || 'Failed');
      } finally {
        if (key === fetchKeyRef.current) setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const dev = devices.find((d) => d.id === r.deviceId);
      return (dev?.name || '').toLowerCase().includes(needle);
    });
  }, [rows, q, devices]);

  return (
    <div className="space-y-5">
      <PageHeader title={t('logs')} description={t('deviceCommunicationLogs')} />
      <ReportFilter loading={loading} onShow={handleShow}>
        <Button variant="outline" size="sm" disabled={!filtered.length}
          onClick={() => downloadCsvBlob(`logs-${new Date().toISOString().slice(0, 10)}.csv`,
            ['Device', 'Time', 'Latitude', 'Longitude', 'Speed', 'Course'],
            filtered.map((r) => {
              const dev = devices.find((d) => d.id === r.deviceId);
              return [dev?.name || `Device ${r.deviceId}`, formatDate(r.serverTime || r.deviceTime || ''), (r.latitude || 0).toFixed(6), (r.longitude || 0).toFixed(6), `${((r.speed || 0) * 1.852).toFixed(1)} km/h`, r.course != null ? `${r.course}°` : '—'];
            })
          )}>
          {t('exportCsv')}
        </Button>
      </ReportFilter>
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('deviceLogs')}</CardTitle>
            <CardDescription>
              {!showTriggered ? t('setFiltersAndShow') : loading ? t('loading') : `${filtered.length} entries`}
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
          : filtered.length === 0 ? <div className="p-6"><EmptyState title={t('noLogEntriesInRange')} /></div>
          : <Table><TableHeader><TableRow>
            <TableHead>Device</TableHead><TableHead>Time</TableHead><TableHead>Latitude</TableHead><TableHead>Longitude</TableHead><TableHead>Speed</TableHead><TableHead>Course</TableHead>
          </TableRow></TableHeader><TableBody>
            {filtered.map((row, i) => {
              const dev = devices.find((d) => d.id === row.deviceId);
              return (
                <TableRow key={row.id || i}>
                  <TableCell className="font-medium text-xs">{dev?.name || `Device ${row.deviceId}`}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(row.serverTime || row.deviceTime || '')}</TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">{(row.latitude || 0).toFixed(6)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">{(row.longitude || 0).toFixed(6)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">{((row.speed || 0) * 1.852).toFixed(1)} km/h</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.course != null ? `${row.course}°` : '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody></Table>}
        </CardContent>
      </Card>
    </div>
  );
}
