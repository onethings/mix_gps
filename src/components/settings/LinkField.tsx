import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { BASE } from '@/lib/api/client';
import { useFlash } from '@/context/FlashContext';

interface LinkedItem {
  id: number;
  name?: string;
  description?: string;
  uniqueId?: string;
  [key: string]: unknown;
}

interface LinkFieldProps {
  /** Label shown in the UI */
  label: string;
  /** API endpoint to fetch all available items (e.g. '/api/geofences') */
  endpointAll: string;
  /** API endpoint to fetch already-linked items (e.g. '/api/geofences?deviceId=123') */
  endpointLinked: string;
  /** The entity ID that items are being linked to (deviceId, groupId, or userId) */
  baseId: number;
  /** The permission key for the base entity (e.g. 'deviceId', 'groupId', 'userId') */
  keyBase: string;
  /** The permission key for the linked entity (e.g. 'geofenceId', 'attributeId') */
  keyLink: string;
  /** Optional function to derive a display title from an item */
  titleGetter?: (item: LinkedItem) => string;
}

const defaultTitleGetter = (item: LinkedItem) => item.name || item.description || `#${item.id}`;

export default function LinkField({
  label,
  endpointAll,
  endpointLinked,
  baseId,
  keyBase,
  keyLink,
  titleGetter = defaultTitleGetter,
}: LinkFieldProps) {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const [open, setOpen] = useState(false);
  const [allItems, setAllItems] = useState<LinkedItem[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [dataLoaded, setDataLoaded] = useState(false);
  const mountedRef = useRef(true);

  // Fetch both lists when dialog opens
  useEffect(() => {
    if (!open || dataLoaded) return;
    mountedRef.current = true;
    setLoading(true);

    const fetchData = async () => {
      try {
        const controller = new AbortController();
        const [allRes, linkedRes] = await Promise.all([
          fetch(`${BASE}${endpointAll}`, { credentials: 'include', signal: controller.signal }),
          fetch(`${BASE}${endpointLinked}`, { credentials: 'include', signal: controller.signal }),
        ]);
        if (!mountedRef.current) return;
        const all: LinkedItem[] = await allRes.json();
        const linked: LinkedItem[] = await linkedRes.json();
        if (!mountedRef.current) return;
        setAllItems(all);
        setLinkedIds(new Set(linked.map((item) => item.id)));
        setDataLoaded(true);
      } catch (err) {
        if (!mountedRef.current) return;
        showError(t('loadFailed'));
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    fetchData();
    return () => { mountedRef.current = false; };
    // We intentionally only re-fetch when dialog (re)opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, endpointAll, endpointLinked, showError, t]);

  const handleReset = useCallback(() => {
    setAllItems([]);
    setLinkedIds(new Set());
    setDataLoaded(false);
    setSearch('');
    setOpen(false);
  }, []);

  const toggleItem = useCallback((id: number) => {
    setLinkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Determine what was added and removed by comparing with data from initial load
      // We need to get the original linked set before any toggles
      // Since we don't have it easily, let's fetch latest linked items to diff
      const linkedRes = await fetch(`${BASE}${endpointLinked}`, { credentials: 'include' });
      const linked: LinkedItem[] = await linkedRes.json();
      const originalIds = new Set(linked.map((item) => item.id));

      const toAdd: number[] = [];
      const toRemove: number[] = [];

      linkedIds.forEach((id) => {
        if (!originalIds.has(id)) toAdd.push(id);
      });
      originalIds.forEach((id) => {
        if (!linkedIds.has(id)) toRemove.push(id);
      });

      const createBody = (linkId: number) => ({ [keyBase]: baseId, [keyLink]: linkId });

      const ops: Promise<unknown>[] = [];
      toAdd.forEach((id) => {
        ops.push(api.permissions.create(createBody(id)));
      });
      toRemove.forEach((id) => {
        ops.push(api.permissions.remove(createBody(id)));
      });

      if (ops.length > 0) {
        await Promise.all(ops);
        showSuccess(t('entitySaved'));
      }

      handleReset();
    } catch {
      showError(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [linkedIds, endpointLinked, keyBase, baseId, keyLink, handleReset, showSuccess, showError, t]);

  const filteredItems = allItems.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const title = titleGetter(item).toLowerCase();
    return title.includes(q);
  });

  const linkedCount = linkedIds.size;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 py-2">
        <span className="text-sm font-medium">{label}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="shrink-0"
        >
          <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
          {linkedCount > 0 ? `${linkedCount} ${t('sharedSelect')}` : t('sharedSelect')}
        </Button>
      </div>

      {linkedCount > 0 && (
        <div className="flex flex-wrap gap-1 pb-2">
          {allItems
            .filter((item) => linkedIds.has(item.id))
            .slice(0, 10)
            .map((item) => (
              <Badge key={item.id} variant="secondary" className="text-xs">
                {titleGetter(item)}
              </Badge>
            ))}
          {linkedCount > 10 && (
            <Badge variant="outline" className="text-xs">
              +{linkedCount - 10} more
            </Badge>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {t('sharedConnections')}
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search')}
              className="pl-8"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-0.5 border rounded-md">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground text-center">{t('loading')}</div>
            ) : filteredItems.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">{t('noData')}</div>
            ) : (
              filteredItems.map((item) => {
                const checked = linkedIds.has(item.id);
                return (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent/50 transition-colors"
                  >
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                        checked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input'
                      }`}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleItem(item.id)}
                      className="sr-only"
                    />
                    <span className="truncate">{titleGetter(item)}</span>
                  </label>
                );
              })
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">{t('cancel')}</Button>
            </DialogClose>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
