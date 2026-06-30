import { useCallback, useMemo, useState } from 'react';
import { Copy, Share2, Clock, XCircle, Check, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import StatusBadge from '@/components/common/StatusBadge';
import { cn, formatDate } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { api } from '@/lib/api';
import type { Vehicle } from '@/types';

interface ShareRecord {
  id: string;
  token: string;
  deviceIds: number[];
  expiresAt: string;
  createdAt: string;
  viewCount: number;
}

const DURATION_OPTIONS = [
  { label: 'h1', value: 1, unit: 'hours' },
  { label: 'h6', value: 6, unit: 'hours' },
  { label: 'h12', value: 12, unit: 'hours' },
  { label: 'd1', value: 1, unit: 'days' },
  { label: 'd3', value: 3, unit: 'days' },
  { label: 'd7', value: 7, unit: 'days' },
  { label: 'd15', value: 15, unit: 'days' },
  { label: 'm1', value: 1, unit: 'months' },
  { label: 'y1', value: 1, unit: 'years' },
];

function Checkbox({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 cursor-pointer rounded border-border bg-background text-primary focus:ring-2 focus:ring-primary/30"
    />
  );
}

function DurationChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
        active
          ? 'border-primary bg-primary/10 text-primary shadow-sm'
          : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicles: Vehicle[];
  title?: string;
}

export default function ShareDialog({ open, onOpenChange, vehicles = [], title }: ShareDialogProps) {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[5]); // default 7 days
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<{ id: string; token: string; expiresAt: string } | null>(null);
  const [activeShares, setActiveShares] = useState<ShareRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem('mixok-share-links') || '[]'); }
    catch { return []; }
  });
  const [creatingLink, setCreatingLink] = useState(false);

  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      setSelectedIds([]);
      setSelectedDuration(DURATION_OPTIONS[5]);
      setCreatedLink(null);
      setCopiedId(null);
    }
    onOpenChange(open);
  }, [onOpenChange]);

  const toggleVehicle = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    setSelectedIds((prev) => prev.length === (vehicles || []).length ? [] : (vehicles || []).map((v) => v.id));
  };

  const selectedVehicles = useMemo(() => (vehicles || []).filter((v) => selectedIds.includes(v.id)), [vehicles, selectedIds]);

  const getExpirationIso = (value: number, unit: string): string => {
    const now = new Date();
    const unitMap: Record<string, (d: Date, v: number) => void> = {
      hours: (d, v) => d.setHours(d.getHours() + v),
      days: (d, v) => d.setDate(d.getDate() + v),
      months: (d, v) => d.setMonth(d.getMonth() + v),
      years: (d, v) => d.setFullYear(d.getFullYear() + v),
    };
    unitMap[unit]?.(now, value);
    return now.toISOString();
  };

  const handleCreateLink = async () => {
    if ((selectedVehicles || []).length === 0) { showError(t('selectVehiclesToShare')); return; }
    setCreatingLink(true);
    try {
      const expiration = getExpirationIso(selectedDuration.value, selectedDuration.unit);
      const share = await api.share.device(selectedVehicles[0]!.id, expiration) as { token?: string } | undefined;
      const token = share?.token || crypto.randomUUID();
      const record: ShareRecord = {
        id: token,
        token,
        deviceIds: selectedIds,
        expiresAt: expiration,
        createdAt: new Date().toISOString(),
        viewCount: 0,
      };
      const updated = [record, ...activeShares];
      setActiveShares(updated);
      localStorage.setItem('mixok-share-links', JSON.stringify(updated));
      setCreatedLink({ id: token, token, expiresAt: expiration });
      showSuccess(t('shareCreateSuccess'));
    } catch (err) {
      showError((err as Error).message || 'Failed to create share link');
    } finally {
      setCreatingLink(false);
    }
  };

  const handleCopyLink = async (token: string) => {
    const url = `${window.location.origin}/shared?token=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(token);
      showSuccess(t('linkCopied'));
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showError('Failed to copy');
    }
  };

  const handleRevoke = (token: string) => {
    const updated = activeShares.filter((s) => s.token !== token);
    setActiveShares(updated);
    localStorage.setItem('mixok-share-links', JSON.stringify(updated));
    showSuccess(t('shareRevoked'));
    if (createdLink?.token === token) setCreatedLink(null);
  };

  const handleRevokeAll = () => {
    setActiveShares([]);
    localStorage.setItem('mixok-share-links', JSON.stringify([]));
    showSuccess(t('shareRevokeAllSuccess'));
    setCreatedLink(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            {title || t('shareVehicle')}
          </DialogTitle>
          <DialogDescription>{t('selectVehiclesToShare')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {vehicles.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-medium">{t('vehicles')} ({selectedIds.length}/{vehicles.length})</h4>
                <button type="button" onClick={toggleAll} className="text-xs text-primary hover:underline">
                  {selectedIds.length === vehicles.length ? t('deselectAll') : t('selectAll')}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                {vehicles.map((v) => (
                  <label key={v.id} className={cn(
                    'flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-muted/40',
                    selectedIds.includes(v.id) && 'bg-primary/5',
                  )}>
                    <Checkbox checked={selectedIds.includes(v.id)} onChange={() => toggleVehicle(v.id)} id={`v-${v.id}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{v.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{v.plate}</div>
                    </div>
                    <StatusBadge status={v.status} />
                  </label>
                ))}
              </div>
            </section>
          )}

          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {t('validityPeriod')}
            </h4>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <DurationChip
                  key={opt.label}
                  label={t(opt.label)}
                  active={selectedDuration.label === opt.label}
                  onClick={() => setSelectedDuration(opt)}
                />
              ))}
            </div>
          </section>

          {!createdLink ? (
            <Button className="w-full" onClick={handleCreateLink} disabled={selectedIds.length === 0 || creatingLink}>
              <Share2 className="mr-2 h-4 w-4" />
              {creatingLink ? t('creating') : t('shareLink')}
            </Button>
          ) : (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{t('shareLink')}</span>
              </div>
              <div className="flex gap-2">
                <Input value={`${window.location.origin}/shared?token=${createdLink.token}`} readOnly className="flex-1 font-mono text-xs" />
                <Button size="sm" variant={copiedId === createdLink.id ? 'default' : 'outline'} onClick={() => handleCopyLink(createdLink.token)}>
                  {copiedId === createdLink.id ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                  {t('copyLink')}
                </Button>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {t('shareExpiresAt')}: {formatDate(createdLink.expiresAt)}
              </div>
            </div>
          )}

          <Separator />

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-medium">
                {t('shareHistory')}
                {activeShares.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{activeShares.length}</Badge>}
              </h4>
              {activeShares.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={handleRevokeAll}>
                  <XCircle className="mr-1 h-3.5 w-3.5" />{t('revokeAll')}
                </Button>
              )}
            </div>
            {activeShares.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('noActiveShares')}</p>
            ) : (
              <div className="space-y-2">
                {activeShares.slice(0, 10).map((share) => (
                  <div key={share.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t('sharedVehicles')} ({(share.deviceIds || []).length})</p>
                      <p className="text-muted-foreground">{t('shareExpiresAt')}: {formatDate(share.expiresAt)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleCopyLink(share.token)} className="rounded p-1 hover:bg-accent">
                        {copiedId === share.token ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => handleRevoke(share.token)} className="rounded p-1 hover:bg-accent text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
