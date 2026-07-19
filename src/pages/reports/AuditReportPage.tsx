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
  { key: 'actionTime', labelKey: 'positionServerTime', always: true },
  { key: 'userId', labelKey: 'settingsUser' },
  { key: 'actionType', labelKey: 'sharedActionType' },
  { key: 'objectType', labelKey: 'sharedObjectType' },
  { key: 'objectId', labelKey: 'deviceIdentifier' },
  { key: 'address', labelKey: 'positionAddress' },
];

function formatAuditCell(key: string, value: unknown, t: (k: string) => string): string {
  if (value == null) return '—';
  if (key === 'actionTime') return formatDate(value as string);
  if (key === 'actionType' && typeof value === 'string') {
    const translated = t(`eventType_${value}`);
    if (translated !== `eventType_${value}`) return translated;
    return value.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
  }
  if (key === 'objectType' && typeof value === 'string') {
    return value.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
  }
  return String(value);
}

export default function AuditReportPage() {
  const { t } = useT();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTriggered, setShowTriggered] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(['actionTime', 'userId', 'actionType', 'objectType']));
  const [q, setQ] = useState('');
  const fetchKeyRef = useRef(0);

  const handleShow = useCallback((value: ReportFilterValue) => {
    const key = ++fetchKeyRef.current;
    setShowTriggered(true);
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await api.audit.list({ from: value.from, to: value.to }) as any[];
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
      const time = formatDate(r.actionTime || '').toLowerCase();
      const user = String(r.userId ?? '');
      const action = String(r.actionType ?? '');
      const object = String(r.objectType ?? '');
      return time.includes(needle) || user.includes(needle) || action.includes(needle) || object.includes(needle);
    });
  }, [rows, q]);

  const activeColumns = useMemo(() => COLUMNS.filter((c) => visibleCols.has(c.key) || c.always), [visibleCols]);
  const toggleColumn = useCallback((key: string) => {
    setVisibleCols((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }, []);

  return (
    <div className="space-y-3 md:space-y-5">
      <PageHeader title={t('audit')} description={t('reportAuditDesc')} className="max-md:hidden" />
      <ReportFilter loading={loading} onShow={handleShow}
        columnDefs={COLUMNS} visibleColumns={visibleCols} onToggleColumn={toggleColumn}
      >
        <ExportButton disabled={!filtered.length}
          csv={{
            onClick: () => {
              const csvHeaders = activeColumns.map((c) => t(c.labelKey));
              downloadCsv(`audit-${new Date().toISOString().slice(0, 10)}.csv`, csvHeaders,
                filtered.map((r) => activeColumns.map((c) => formatAuditCell(c.key, r[c.key], t)))
              );
            }
          }}
          excel={{
            onClick: () => {
              const excelHeaders = activeColumns.map((c) => t(c.labelKey));
              downloadExcel(`audit-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Audit Log',
                [{ name: 'Audit', rows: filtered.map((r) => {
                  const obj: Record<string, string> = {};
                  activeColumns.forEach((c) => { obj[t(c.labelKey)] = formatAuditCell(c.key, r[c.key], t); });
                  return obj;
                })}]
              );
            }
          }}
          pdf={{
            onClick: () => {
              const pdfHeaders = activeColumns.map((c) => t(c.labelKey));
              downloadPdf(`audit-${new Date().toISOString().slice(0, 10)}.pdf`, 'Audit Log',
                [{
                  title: 'Audit Log',
                  headers: pdfHeaders,
                  rows: filtered.map((r) => activeColumns.map((c) => formatAuditCell(c.key, r[c.key], t))),
                }]
              );
            }
          }}
        />
      </ReportFilter>
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('audit')}</CardTitle>
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
          : filtered.length === 0 ? <div className="p-6"><EmptyState title={t('noData')} /></div>
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
                          {c.key === 'actionTime'
                            ? <span className="font-medium text-foreground">{formatDate(row.actionTime || '')}</span>
                            : c.key === 'actionType'
                              ? <span className="font-medium text-foreground">{formatAuditCell(c.key, row[c.key], t)}</span>
                              : formatAuditCell(c.key, row[c.key], t)}
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
