import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/common/EmptyState';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { formatDate } from '@/lib/utils';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

interface ScheduledReport {
  id: number;
  type: string;
  name?: string;
  description?: string;
  calendarId?: number;
  attributes?: Record<string, unknown>;
}

export default function ScheduledReportPage() {
  const { t } = useT();
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledReport | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.scheduledReports.list() as ScheduledReport[];
      setReports(Array.isArray(data) ? data : []);
    } catch { setReports([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.scheduledReports.remove(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch { /* ignore */ } finally { setDeleting(false); }
  }, [deleteTarget, load]);

  return (
    <div className="space-y-3 md:space-y-5">
      <PageHeader title={t('scheduledReports')} description={t('manageAutomatedReportGeneration')} className="max-md:hidden" />
      <Card>
        <CardHeader>
          <CardTitle>{t('scheduledReports')}</CardTitle>
          <CardDescription>{loading ? t('loading') : `${reports.length} ${t('scheduledReports')?.toLowerCase()}`}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="p-6 text-center text-sm text-muted-foreground">{t('loading')}</div>
          : reports.length === 0 ? <div className="p-6"><EmptyState title={t('noScheduledReports')} description={t('scheduledReportsCreatedFrom')} /></div>
          : <Table><TableHeader><TableRow>
            <TableHead>{t('reportColId')}</TableHead><TableHead>{t('type')}</TableHead><TableHead>{t('description')}</TableHead><TableHead>{t('calendar')}</TableHead><TableHead className="w-16"></TableHead>
          </TableRow></TableHeader><TableBody>
            {reports.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.id}</TableCell>
                <TableCell className="text-xs font-medium">{r.type}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.description || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.calendarId ? `#${r.calendarId}` : '—'}</TableCell>
                <TableCell>
                  <button type="button" onClick={() => setDeleteTarget(r)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody></Table>}
        </CardContent>
      </Card>

      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={() => setDeleteTarget(null)}
          title={t('deleteScheduledReport')}
          description={`${t('delete')} "${deleteTarget.description || deleteTarget.type}"?`}
          confirmLabel={t('delete')}
          onConfirm={handleDelete}
          destructive
        />
      )}
    </div>
  );
}
