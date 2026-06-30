import { useT } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function GeofencesSettingsPage() {
  const { t } = useT();
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">{t('geofences')}</CardTitle></CardHeader>
      <CardContent className="text-sm text-muted-foreground">{t('geofencesMapDesc')}</CardContent>
    </Card>
  );
}
