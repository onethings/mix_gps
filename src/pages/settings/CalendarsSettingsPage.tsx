import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  Plus, Search, Edit, Trash2, CalendarDays, Save, X, Upload,
} from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import type { TraccarCalendar } from '@/types';

const PAGE_SIZE = 20;

/* ═══════════════════════════════════════════════════════════════════ */
/*  iCalendar helpers                                                 */
/* ═══════════════════════════════════════════════════════════════════ */

const formatCalendarTime = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const str = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `TZID=${tzid}:${str}`;
};

const parseRRULE = (rule: string): { frequency: string; by?: string[] } => {
  if (!rule || rule.endsWith('COUNT=1')) return { frequency: 'ONCE' };
  const fragments = rule.split(';');
  const frequency = fragments[0].substring(11);
  const by = fragments.length > 1 ? fragments[1].split('=')[1].split(',') : undefined;
  return { frequency, by };
};

const formatRRULE = (frequency: string, by?: string[]): string => {
  switch (frequency) {
    case 'DAILY':
      return 'RRULE:FREQ=DAILY';
    case 'WEEKLY':
      return `RRULE:FREQ=WEEKLY;BYDAY=${(by?.length ? by : ['SU']).join(',')}`;
    case 'MONTHLY':
      return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${(by?.length ? by : ['1']).join(',')}`;
    default:
      return 'RRULE:FREQ=DAILY;COUNT=1';
  }
};

const decodeB64 = (b64?: string): string =>
  b64 ? decodeURIComponent(escape(atob(b64))) : '';

const encodeB64 = (text: string): string =>
  btoa(unescape(encodeURIComponent(text)));

const defaultSimpleData = (): string => {
  const now = new Date();
  const fromIso = now.toISOString().slice(0, 16);
  const toIso = new Date(now.getTime() + 3600000).toISOString().slice(0, 16);
  return encodeB64([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Traccar//NONSGML Traccar//EN',
    'BEGIN:VEVENT',
    'UID:00000000-0000-0000-0000-000000000000',
    `DTSTART;${formatCalendarTime(fromIso)}`,
    `DTEND;${formatCalendarTime(toIso)}`,
    'RRULE:FREQ=DAILY',
    'SUMMARY:Event',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n'));
};

interface CalendarForm {
  name: string;
  mode: 'simple' | 'custom';
  fromDate: string;
  toDate: string;
  recurrence: string;
  days: string[];
  customData: string;
}

const defaultForm = (cal?: TraccarCalendar): CalendarForm => {
  if (!cal) {
    return {
      name: '', mode: 'simple',
      fromDate: new Date().toISOString().slice(0, 16),
      toDate: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
      recurrence: 'DAILY', days: ['SU'], customData: '',
    };
  }
  const ical = decodeB64(cal.data);
  const lines = ical.split('\n');
  const dtstartLine = lines.find((l) => l.startsWith('DTSTART'));
  const dtendLine = lines.find((l) => l.startsWith('DTEND'));
  const rruleLine = lines.find((l) => l.startsWith('RRULE'));

  const parseDt = (line?: string): string => {
    if (!line) return new Date().toISOString().slice(0, 16);
    const m = line.match(/:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    if (!m) return new Date().toISOString().slice(0, 16);
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  };

  const rule = rruleLine ? parseRRULE(rruleLine) : { frequency: 'DAILY' };

  return {
    name: cal.name, mode: 'simple',
    fromDate: parseDt(dtstartLine),
    toDate: parseDt(dtendLine),
    recurrence: rule.frequency,
    days: rule.by || ['SU'],
    customData: ical,
  };
};

const formToData = (form: CalendarForm): string => {
  if (form.mode === 'custom') return encodeB64(form.customData);
  return encodeB64([
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Traccar//NONSGML Traccar//EN',
    'BEGIN:VEVENT',
    'UID:00000000-0000-0000-0000-000000000000',
    `DTSTART;${formatCalendarTime(form.fromDate)}`,
    `DTEND;${formatCalendarTime(form.toDate)}`,
    formatRRULE(form.recurrence, form.days),
    'SUMMARY:Event', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\n'));
};

/* ═══════════════════════════════════════════════════════════════════ */
/*  Constants                                                         */
/* ═══════════════════════════════════════════════════════════════════ */

const WEEKDAYS = [
  { code: 'SU', key: 'calendarSunday' },
  { code: 'MO', key: 'calendarMonday' },
  { code: 'TU', key: 'calendarTuesday' },
  { code: 'WE', key: 'calendarWednesday' },
  { code: 'TH', key: 'calendarThursday' },
  { code: 'FR', key: 'calendarFriday' },
  { code: 'SA', key: 'calendarSaturday' },
] as const;

const RECURRENCE_OPTIONS = [
  { value: 'ONCE', key: 'calendarOnce' },
  { value: 'DAILY', key: 'calendarDaily' },
  { value: 'WEEKLY', key: 'calendarWeekly' },
  { value: 'MONTHLY', key: 'calendarMonthly' },
] as const;

/* ═══════════════════════════════════════════════════════════════════ */
/*  Page component                                                    */
/* ═══════════════════════════════════════════════════════════════════ */

export default function CalendarsSettingsPage() {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();

  const [reloadKey, reload] = useReducer((k) => k + 1, 0);
  const [items, setItems] = useState<TraccarCalendar[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TraccarCalendar | null>(null);
  const [form, setForm] = useState<CalendarForm>(() => defaultForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TraccarCalendar | null>(null);

  const loadItems = useCallback(async (offset: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (searchKeyword) params.append('keyword', searchKeyword);
    const data = await api.calendars.list(params) as TraccarCalendar[];
    if (!signal?.aborted) {
      setItems((prev) => (offset ? [...prev, ...data] : data));
      setHasMore(data.length >= PAGE_SIZE);
    }
  }, [searchKeyword]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true); setItems([]);
    loadItems(0, controller.signal).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [reloadKey, loadItems]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        setLoading(true);
        loadItems(items.length).finally(() => setLoading(false));
      }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, items.length, loadItems]);

  const handleAdd = useCallback(() => {
    setEditTarget(null);
    setForm(defaultForm());
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((cal: TraccarCalendar) => {
    setEditTarget(cal);
    setForm(defaultForm(cal));
    setDialogOpen(true);
  }, []);

  const updateForm = useCallback((patch: Partial<CalendarForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateForm({ customData: reader.result as string });
    reader.readAsText(file);
  }, [updateForm]);

  const toggleDay = useCallback((code: string) => {
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(code)
        ? prev.days.filter((d) => d !== code)
        : [...prev.days, code],
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { showError(t('nameRequired')); return; }
    setSaving(true);
    try {
      const data = formToData(form);
      const payload = { name: form.name.trim(), data };
      if (editTarget) {
        await api.calendars.update(editTarget.id, { ...editTarget, ...payload });
        showSuccess(t('entitySaved'));
      } else {
        await api.calendars.create(payload);
        showSuccess(t('entityCreated'));
      }
      setDialogOpen(false);
      reload();
    } catch (err: unknown) {
      showError(`${t('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  }, [form, editTarget, showSuccess, showError, t, reload]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await api.calendars.remove(deleteTarget.id);
      showSuccess(t('calendarDeleted'));
      setDeleteTarget(null);
      reload();
    } catch { showError(t('deleteFailed')); }
  }, [deleteTarget, showSuccess, showError, t, reload]);

  const fieldClass =
    'rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full';

  const freqLabel = (freq: string) => {
    if (freq === 'ONCE') return t('calendarOnce');
    return t('calendar' + freq.charAt(0) + freq.slice(1).toLowerCase());
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('calendars')}</h2>
          <p className="text-sm text-muted-foreground">{t('calendarsDesc')}</p>
        </div>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-1" />{t('add')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchKeyword}
          onChange={(e) => { setSearchKeyword(e.target.value); reload(); }}
          placeholder={t('search')}
          className="pl-8"
        />
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              {t('loading')}…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
              <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
              <p>{t('noData')}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((c) => {
                const rrule = c.data
                  ? decodeB64(c.data).split('\n').find((l) => l.startsWith('RRULE'))
                  : null;
                const freq = rrule ? parseRRULE(rrule).frequency : null;
                return (
                  <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <CalendarDays className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        {freq && (
                          <p className="text-xs text-muted-foreground">{freqLabel(freq)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors"
                        title={t('edit')} onClick={() => handleEdit(c)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title={t('delete')} onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {hasMore && <div ref={sentinelRef} className="h-4" />}
        </CardContent>
      </Card>

      {/* ══════════════ Create/Edit Dialog ══════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              <CalendarDays className="h-4 w-4 inline mr-1.5 -mt-0.5" />
              {editTarget ? t('edit') : t('add')} {t('calendar')}
            </DialogTitle>
            <DialogDescription>
              {editTarget ? t('calendarEditDesc') : t('calendarCreateDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('name')} *</label>
              <Input
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder={t('calendarNamePlaceholder')}
                autoFocus
              />
            </div>

            {/* Mode selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('calendarType')}</label>
              <div className="flex gap-3">
                {(['simple', 'custom'] as const).map((mode) => (
                  <label
                    key={mode}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm cursor-pointer transition-all ${
                      form.mode === mode
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <input
                      type="radio" name="mode" value={mode}
                      checked={form.mode === mode}
                      onChange={() => updateForm({ mode })}
                      className="sr-only"
                    />
                    {mode === 'simple' ? t('calendarSimple') : t('calendarCustom')}
                  </label>
                ))}
              </div>
            </div>

            {/* ── Simple Fields ── */}
            {form.mode === 'simple' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t('calendarFrom')}</label>
                    <input type="datetime-local" value={form.fromDate}
                      onChange={(e) => updateForm({ fromDate: e.target.value })}
                      className={fieldClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">{t('calendarTo')}</label>
                    <input type="datetime-local" value={form.toDate}
                      onChange={(e) => updateForm({ toDate: e.target.value })}
                      className={fieldClass} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t('calendarRecurrence')}</label>
                  <select value={form.recurrence}
                    onChange={(e) => updateForm({ recurrence: e.target.value, days: form.recurrence !== e.target.value ? [] : form.days })}
                    className={fieldClass}
                  >
                    {RECURRENCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{t(opt.key)}</option>
                    ))}
                  </select>
                </div>

                {/* Days */}
                {form.recurrence === 'WEEKLY' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('calendarDaysOfWeek')}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map((wd) => (
                        <button key={wd.code} type="button" onClick={() => toggleDay(wd.code)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            form.days.includes(wd.code)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:bg-accent'
                          }`}
                        >{t(wd.key)}</button>
                      ))}
                    </div>
                  </div>
                )}

                {form.recurrence === 'MONTHLY' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('calendarDaysOfMonth')}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <button key={d} type="button" onClick={() => toggleDay(String(d))}
                          className={`w-9 h-9 rounded-lg text-xs font-medium border transition-colors ${
                            form.days.includes(String(d))
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:bg-accent'
                          }`}
                        >{d}</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Custom Fields ── */}
            {form.mode === 'custom' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t('calendarUploadIcs')}</label>
                  <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-sm text-muted-foreground cursor-pointer hover:bg-accent/30 transition-colors">
                    <Upload className="h-5 w-5" />
                    <span>{t('calendarClickToUpload')}</span>
                    <input type="file" accept=".ics,.ical,text/calendar"
                      onChange={handleFileUpload} className="sr-only" />
                  </label>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t('calendarData')}</label>
                  <Textarea value={form.customData}
                    onChange={(e) => updateForm({ customData: e.target.value })}
                    placeholder={t('calendarDataPlaceholder')}
                    rows={8} className="font-mono text-xs" spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">{t('calendarDataHint')}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              <X className="h-4 w-4 mr-1.5" />{t('cancel')}
            </Button>
            <Button variant="default" onClick={handleSave} disabled={saving}>
              {saving ? (
                <><div className="h-4 w-4 mr-1.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('saving')}</>
              ) : (
                <><Save className="h-4 w-4 mr-1.5" />{editTarget ? t('save') : t('add')}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════ Delete Confirm ══════════════ */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              {t('deleteCalendarTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('deleteCalendarMsg')} &ldquo;{deleteTarget?.name}&rdquo;?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1.5" />{t('delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
