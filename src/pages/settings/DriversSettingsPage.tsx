import { User } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { useListFetch } from '@/hooks/useListFetch';
import { api } from '@/lib/api';
import type { TraccarDriver } from '@/types';

export default function DriversSettingsPage() {
  const { t } = useT();
  const { data: drivers, loading } = useListFetch<TraccarDriver[]>(() => api.drivers.list() as Promise<TraccarDriver[]>, []);

  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">{t('drivers')}</h2><p className="text-sm text-muted-foreground">{t('driversDesc')}</p></div>
      <Card>
        <CardContent className="p-0">
          {loading ? <div className="p-4 text-sm text-muted-foreground">{t('loading')}</div> :
            !drivers?.length ? <div className="p-4 text-sm text-muted-foreground">{t('noData')}</div> :
            <div className="divide-y divide-border text-sm">
              {drivers.map((d: TraccarDriver) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div><p className="font-medium">{d.name}</p><p className="text-xs text-muted-foreground">{d.uniqueId}{d.phone ? ` · ${d.phone}` : ''}</p></div>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
