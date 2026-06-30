import { Terminal } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { useListFetch } from '@/hooks/useListFetch';
import { api } from '@/lib/api';
import type { TraccarCommand } from '@/types';

export default function CommandsSettingsPage() {
  const { t } = useT();
  const { data: commands, loading } = useListFetch<TraccarCommand[]>(() => api.commands.list() as Promise<TraccarCommand[]>, []);

  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">{t('savedCommands')}</h2><p className="text-sm text-muted-foreground">{t('savedCommandsDesc')}</p></div>
      <Card>
        <CardContent className="p-0">
          {loading ? <div className="p-4 text-sm text-muted-foreground">{t('loading')}</div> :
            !commands?.length ? <div className="p-4 text-sm text-muted-foreground">{t('noData')}</div> :
            <div className="divide-y divide-border text-sm">
              {commands.map((c: TraccarCommand) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium">{c.description || c.type}</p>
                    <p className="text-xs text-muted-foreground font-mono">{c.type}</p>
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
