import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useListFetch } from '@/hooks/useListFetch';
import { api } from '@/lib/api';
import type { TraccarUser } from '@/types';

export default function UsersSettingsPage() {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const { data: users, loading, reload } = useListFetch<TraccarUser[]>(() => api.users.list() as Promise<TraccarUser[]>, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">{t('users')}</h2><p className="text-sm text-muted-foreground">{t('usersDesc')}</p></div>
        <Button size="sm"><Plus className="h-4 w-4" />{t('addUser')}</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? <div className="p-4 text-sm text-muted-foreground">{t('loading')}</div> :
            !users?.length ? <div className="p-4 text-sm text-muted-foreground">{t('noData')}</div> :
            <div className="divide-y divide-border text-sm">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-4 py-3">
                  <div><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></div>
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
