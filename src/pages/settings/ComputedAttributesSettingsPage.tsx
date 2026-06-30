import { Calculator } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useListFetch } from '@/hooks/useListFetch';
import { api } from '@/lib/api';
import type { TraccarComputedAttribute } from '@/types';

export default function ComputedAttributesSettingsPage() {
  const { t } = useT();
  const { data: attrs, loading } = useListFetch<TraccarComputedAttribute[]>(() => api.computedAttributes.list() as Promise<TraccarComputedAttribute[]>, []);

  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">{t('computedAttributes')}</h2><p className="text-sm text-muted-foreground">{t('computedAttributesDesc')}</p></div>
      <Card>
        <CardContent className="p-0">
          {loading ? <div className="p-4 text-sm text-muted-foreground">{t('loading')}</div> :
            !attrs?.length ? <div className="p-4 text-sm text-muted-foreground">{t('noData')}</div> :
            <div className="divide-y divide-border text-sm">
              {attrs.map((a: TraccarComputedAttribute) => (
                <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <Calculator className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1"><p className="font-medium">{a.name}</p><p className="text-xs text-muted-foreground font-mono">{a.expression}</p></div>
                  <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
