import { CalendarDays } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { useListFetch } from '@/hooks/useListFetch';
import { api } from '@/lib/api';
import type { TraccarCalendar } from '@/types';

export default function CalendarsSettingsPage() {
  const { t } = useT();
  const { data: calendars, loading } = useListFetch<TraccarCalendar[]>(() => api.calendars.list() as Promise<TraccarCalendar[]>, []);

  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">{t('calendars')}</h2><p className="text-sm text-muted-foreground">{t('calendarsDesc')}</p></div>
      <Card>
        <CardContent className="p-0">
          {loading ? <div className="p-4 text-sm text-muted-foreground">{t('loading')}</div> :
            !calendars?.length ? <div className="p-4 text-sm text-muted-foreground">{t('noData')}</div> :
            <div className="divide-y divide-border text-sm">
              {calendars.map((c: TraccarCalendar) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div><p className="font-medium">{c.name}</p></div>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
