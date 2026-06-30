import { Wrench } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useListFetch } from '@/hooks/useListFetch';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { TraccarMaintenance } from '@/types';

export default function MaintenanceSettingsPage() {
  const { t } = useT();
  const { data: rows, loading } = useListFetch<TraccarMaintenance[]>(() => api.maintenance.list() as Promise<TraccarMaintenance[]>, []);

  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">{t('maintenance')}</h2><p className="text-sm text-muted-foreground">{t('maintenanceDesc')}</p></div>
      <Card>
        <CardContent className="p-0">
          {loading ? <div className="p-4 text-sm text-muted-foreground">{t('loading')}</div> :
            !rows?.length ? <div className="p-4 text-sm text-muted-foreground">{t('noData')}</div> :
            <div className="divide-y divide-border text-sm">
              {rows.map((m: TraccarMaintenance) => (
                <div key={m.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div><p className="font-medium">{m.name}</p><p className="text-xs text-muted-foreground">{m.type} · {t('startDate')}: {formatDate(m.start)}</p></div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{m.period}d</Badge>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
