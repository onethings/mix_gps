import { useCallback, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/common/EmptyState';
import { formatDate } from '@/lib/utils';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import ReportFilter from '@/components/reports/ReportFilterV2';
import type { ReportFilterValue } from '@/components/reports/ReportFilterV2';
import ExportButton from '@/components/reports/ExportButton';
import { downloadCsv, downloadExcel, downloadPdf } from '@/lib/exportUtils';

const COLUMNS = [
  { key: 'captureTime', labelKey: 'statisticsCaptureTime', always: true },
  { key: 'activeUsers', labelKey: 'statisticsActiveUsers' },
  { key: 'activeDevices', labelKey: 'statisticsActiveDevices' },
  { key: 'requests', labelKey: 'statisticsRequests' },
  { key: 'messagesReceived', labelKey: 'statisticsMessagesReceived' },
  { key: 'messagesStored', labelKey: 'statisticsMessagesStored' },
  { key: 'mailSent', labelKey: 'notificatorMail' },
  { key: 'smsSent', labelKey: 'notificatorSms' },
  { key: 'geocoderRequests', labelKey: 'statisticsGeocoder' },
  { key: 'geolocationRequests', labelKey: 'statisticsGeolocation' },
];

function formatCell(key: string, value: unknown): string {
  if (value == null) return '—';
  if (key === 'captureTime') return formatDate(value as string);
  return String(value);
}

export default function StatisticsReportPage() {
  const { t } = useT();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTriggered, setShowTriggered] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(['activeUsers', 'activeDevices', 'requests', 'messagesReceived', 'messagesStored']));
  const [q, setQ] = useState('');
  const fetchKeyRef = useRef(0);

  const handleShow = useCallback((value: ReportFilterValue) => {
    const key = ++fetchKeyRef.current;
    setShowTriggered(true);
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await api.statistics.list({ from: value.from, to: value.to }) as any[];
        if (key !== fetchKeyRef.current) return;
        setRows(data || []);
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
      const time = formatDate(r.captureTime || '').toLowerCase();
      return time.includes(needle);
    });
  }, [rows, q]);

  const activeColumns = useMemo(() => COLUMNS.filter((c) => visibleCols.has(c.key) || c.always), [visibleCols]);
  const toggleColumn = useCallback((key: string) => {
    setVisibleCols((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }, []);

  return (
    <div className="space-y-3 md:space-y-5">
      <PageHeader title={t('statistics')} description={t('reportStatisticsDesc')} className="max-md:hidden" />
      <ReportFilter loading={loading} onShow={handleShow}
        columnDefs={COLUMNS} visibleColumns={visibleCols} onToggleColumn={toggleColumn}
      >
        <ExportButton disabled={!filtered.length}
          csv={{
            onClick: () => {
              const csvHeaders = activeColumns.map((c) => t(c.labelKey));
              downloadCsv(`statistics-${new Date().toISOString().slice(0, 10)}.csv`, csvHeaders,
                filtered.map((r) => activeColumns.map((c) => formatCell(c.key, r[c.key])))
              );
            }
          }}
          excel={{
            onClick: () => {
              const excelHeaders = activeColumns.map((c) => t(c.labelKey));
              downloadExcel(`statistics-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Statistics',
                [{ name: 'Statistics', rows: filtered.map((r) => {
                  const obj: Record<string, string> = {};
                  activeColumns.forEach((c) => { obj[t(c.labelKey)] = formatCell(c.key, r[c.key]); });
                  return obj;
                })}]
              );
            }
          }}
          pdf={{
            onClick: () => {
              const pdfHeaders = activeColumns.map((c) => t(c.labelKey));
              downloadPdf(`statistics-${new Date().toISOString().slice(0, 10)}.pdf`, 'Statistics Report',
                [{
                  title: 'Statistics',
                  headers: pdfHeaders,
                  rows: filtered.map((r) => activeColumns.map((c) => formatCell(c.key, r[c.key]))),
                }]
              );
            }
          }}
        />
      </ReportFilter>
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('statistics')}</CardTitle>
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
          {!showTriggered ? <div className="p-4 md:p-6"><EmptyState title={t('setFiltersAndShow')} /></div>
          : loading ? <div className="p-4 md:p-6 text-center text-sm text-muted-foreground">{t('loading')}</div>
          : error ? <div className="p-4 md:p-6 text-center text-sm text-destructive">{error}</div>
          : filtered.length === 0 ? <div className="p-4 md:p-6"><EmptyState title={t('noData')} /></div>
          : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {activeColumns.map((c) => (
                      <TableHead key={c.key}>{t(c.labelKey)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row, i) => (
                    <TableRow key={row.id ?? i}>
                      {activeColumns.map((c) => (
                        <TableCell key={c.key} className="text-xs text-muted-foreground">
                          {c.key === 'captureTime'
                            ? <span className="font-medium text-foreground">{formatDate(row.captureTime || '')}</span>
                            : formatCell(c.key, row[c.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
