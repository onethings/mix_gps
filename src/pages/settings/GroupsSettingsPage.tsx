import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useListFetch } from '@/hooks/useListFetch';
import { api } from '@/lib/api';
import type { TraccarGroup } from '@/types';

export default function GroupsSettingsPage() {
  const { t } = useT();
  const { showSuccess } = useFlash();
  const { data: groups, loading, reload } = useListFetch<TraccarGroup[]>(() => api.groups.list() as Promise<TraccarGroup[]>, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">{t('groups')}</h2><p className="text-sm text-muted-foreground">{t('groupsDesc')}</p></div>
        <Button size="sm"><Plus className="h-4 w-4" />{t('addGroup')}</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? <div className="p-4 text-sm text-muted-foreground">{t('loading')}</div> :
            !groups?.length ? <div className="p-4 text-sm text-muted-foreground">{t('noData')}</div> :
            <div className="divide-y divide-border text-sm">
              {groups.map((g) => (
                <div key={g.id} className="flex items-center justify-between px-4 py-3">
                  <p className="font-medium">{g.name}</p>
                  <div className="flex gap-1">
                    <button className="rounded p-1 hover:bg-accent"><Pencil className="h-3.5 w-3.5" /></button>
                    <button className="rounded p-1 hover:bg-accent text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
