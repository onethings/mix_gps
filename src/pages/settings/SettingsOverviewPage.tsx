import { useSession } from '@/context/SessionContext';
import { useT } from '@/lib/i18n';

export default function SettingsOverviewPage() {
  const { user, server } = useSession();
  const { t } = useT();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('settings')}</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-2">{t('myAccount')}</h2>
          <p className="text-xs text-muted-foreground">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-2">{t('server')}</h2>
          <p className="text-xs text-muted-foreground">
            {server ? `${t('version')}: ${String((server as unknown as { version?: string }).version || '—')}` : t('loading')}
          </p>
        </div>
      </div>
    </div>
  );
}
