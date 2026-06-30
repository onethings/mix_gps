import { useMemo, useState } from 'react';
import { Smartphone, Search, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useLiveData } from '@/context/LiveDataContext';
import type { TraccarDevice } from '@/types';

export default function DevicesSettingsPage() {
  const { t } = useT();
  const { devices } = useLiveData();
  const [q, setQ] = useState('');
  const list = useMemo(() => Array.isArray(devices) ? devices : [], [devices]);
  const filtered = useMemo(() => {
    if (!q.trim()) return list;
    return list.filter((d) => d.name.toLowerCase().includes(q.toLowerCase()) || d.uniqueId.includes(q));
  }, [list, q]);

  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">{t('devices')}</h2><p className="text-sm text-muted-foreground">{t('devicesDesc')}</p></div>
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="pl-8" />
      </div>
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? <div className="p-4 text-sm text-muted-foreground">{t('noData')}</div> :
            <div className="divide-y divide-border text-sm">
              {filtered.map((d: TraccarDevice) => (
                <div key={d.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <div><p className="font-medium">{d.name}</p><p className="text-xs text-muted-foreground font-mono">{d.uniqueId}</p></div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{d.status}</Badge>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}
