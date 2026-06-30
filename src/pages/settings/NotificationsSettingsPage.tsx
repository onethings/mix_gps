import { useState } from 'react';
import { Plus, Pencil, Trash2, Bell } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useListFetch } from '@/hooks/useListFetch';
import { api } from '@/lib/api';
import type { TraccarNotification } from '@/types';

export default function NotificationsSettingsPage() {
  const { t } = useT();
  const { data: notifications, loading } = useListFetch<TraccarNotification[]>(() => api.notifications.list() as Promise<TraccarNotification[]>, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">{t('notifications')}</h2><p className="text-sm text-muted-foreground">{t('notificationsDesc')}</p></div>
        <Button size="sm"><Plus className="h-4 w-4" />{t('add')}</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? <div className="p-4 text-sm text-muted-foreground">{t('loading')}</div> :
            !notifications?.length ? <div className="p-4 text-sm text-muted-foreground">{t('noData')}</div> :
            <div className="divide-y divide-border text-sm">
              {notifications.map((n) => (
                <div key={n.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <div><p className="font-medium">{n.type}</p><p className="text-xs text-muted-foreground">{n.notificators?.join(', ') || '—'}</p></div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{n.type}</Badge>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
