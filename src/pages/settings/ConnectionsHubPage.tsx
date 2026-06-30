import { Link } from 'react-router-dom';
import { Cable, ExternalLink } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ConnectionsHubPage() {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">{t('connections')}</h2><p className="text-sm text-muted-foreground">{t('connectionsDesc')}</p></div>
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <Cable className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t('connectionsEditDesc')}</p>
          <Button variant="outline" size="sm" asChild>
            <a href={window.location.origin + '/api'} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> {t('editInClassicUi')}
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
