import { useParams } from 'react-router-dom';
import { useT } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsJsonEntityPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const { t } = useT();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t('entityEdit').replace('{kind}', kind || 'unknown')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">ID: {id}</p>
        <p className="text-sm text-muted-foreground">{t('editInClassicUi')}</p>
      </CardContent>
    </Card>
  );
}
