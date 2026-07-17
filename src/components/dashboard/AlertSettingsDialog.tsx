import { useEffect, useState } from 'react';
import { Settings, Clock, Palette, Layout, HelpCircle, GripVertical, Eye, EyeOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useT } from '@/lib/i18n';
import {
  getAlertSettings,
  updateAlertSettings,
  resetAlertSettings,
  ALL_CARD_FIELDS,
  PRESET_COLORS,
  type AlertSettings,
  type AlertCardFieldKey,
} from '@/lib/alertSettingsService';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsChange: () => void;
}

export default function AlertSettingsDialog({ open, onOpenChange, onSettingsChange }: Props) {
  const { t } = useT();
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState('timer');

  useEffect(() => {
    if (open) {
      getAlertSettings().then(setSettings);
      setDirty(false);
    }
  }, [open]);

  const handleChange = (partial: Partial<AlertSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...partial };
    if (partial.timerColors) {
      next.timerColors = { ...settings.timerColors, ...partial.timerColors };
    }
    if (partial.cardFieldsVisible) {
      next.cardFieldsVisible = { ...settings.cardFieldsVisible, ...partial.cardFieldsVisible };
    }
    if (partial.cardFieldsOrder) {
      next.cardFieldsOrder = partial.cardFieldsOrder;
    }
    setSettings(next);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!settings) return;
    await updateAlertSettings(settings);
    setDirty(false);
    onSettingsChange();
    onOpenChange(false);
  };

  const handleReset = async () => {
    const defaults = await resetAlertSettings();
    setSettings(defaults);
    setDirty(true);
  };

  const moveField = (index: number, direction: -1 | 1) => {
    if (!settings) return;
    const order = [...settings.cardFieldsOrder];
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    handleChange({ cardFieldsOrder: order });
  };

  if (!settings) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t('alerts')} — {t('preferences')}
          </DialogTitle>
          <DialogDescription>
            Customise countdown timer, colours, and card layout
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="timer">
              <Clock className="h-3.5 w-3.5 mr-1" /> Timer
            </TabsTrigger>
            <TabsTrigger value="colors">
              <Palette className="h-3.5 w-3.5 mr-1" /> Colors
            </TabsTrigger>
            <TabsTrigger value="layout">
              <Layout className="h-3.5 w-3.5 mr-1" /> Layout
            </TabsTrigger>
            <TabsTrigger value="help">
              <HelpCircle className="h-3.5 w-3.5 mr-1" /> Help
            </TabsTrigger>
          </TabsList>

          {/* ── Timer Tab ── */}
          <TabsContent value="timer" className="space-y-4">
            <div>
              <label className="text-sm font-medium">Countdown Duration</label>
              <p className="text-xs text-muted-foreground mb-2">
                Set how long the countdown timer runs (in seconds). Default: 300 (5 min).
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={30}
                  max={1800}
                  step={30}
                  value={settings.timerDuration}
                  onChange={(e) => handleChange({ timerDuration: Number(e.target.value) })}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  sec ({Math.round(settings.timerDuration / 60)} min)
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                <strong>Timer colour changes</strong> based on remaining time:{' '}
                <span className="font-mono">≥5m</span> →{' '}
                <span className="font-mono">≥4m</span> →{' '}
                <span className="font-mono">≥3m</span> →{' '}
                <span className="font-mono">≥2m</span> →{' '}
                <span className="font-mono">≤1m</span>. Set colours in the Colors tab.
              </p>
            </div>
          </TabsContent>

          {/* ── Colors Tab ── */}
          <TabsContent value="colors" className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Pick a colour for each remaining-minute threshold. Expired alerts turn grey.
            </p>
            {[5, 4, 3, 2, 1].map((min) => (
              <div key={min} className="flex items-center gap-3">
                <span className="text-sm font-medium w-16 shrink-0">
                  ≥ {min} min
                </span>
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() =>
                        handleChange({ timerColors: { [min]: color } })
                      }
                      className="h-6 w-6 rounded-full border border-border transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring"
                      style={{
                        backgroundColor: color,
                        boxShadow:
                          settings.timerColors[min] === color
                            ? '0 0 0 2px hsl(var(--background)), 0 0 0 3.5px currentColor'
                            : 'none',
                      }}
                      title={color}
                    />
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.timerColors[min] ?? '#ef4444'}
                    onChange={(e) =>
                      handleChange({ timerColors: { [min]: e.target.value } })
                    }
                    className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  />
                  <span className="text-[10px] font-mono text-muted-foreground w-16 truncate">
                    {settings.timerColors[min]}
                  </span>
                </div>
              </div>
            ))}
          </TabsContent>

          {/* ── Layout Tab ── */}
          <TabsContent value="layout" className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Reorder fields by moving them up/down. Toggle visibility on/off.
            </p>
            <div className="space-y-1.5">
              {settings.cardFieldsOrder.map((key, idx) => {
                const field = ALL_CARD_FIELDS.find((f) => f.key === key);
                if (!field) return null;
                const visible = settings.cardFieldsVisible[key] ?? true;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    <span className="flex-1 text-sm">{field.label}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveField(idx, -1)}
                        className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-20"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={idx === settings.cardFieldsOrder.length - 1}
                        onClick={() => moveField(idx, 1)}
                        className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-20"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleChange({
                          cardFieldsVisible: { [key]: !visible },
                        })
                      }
                      className={`rounded p-1 transition-colors ${
                        visible
                          ? 'text-primary hover:text-primary/80'
                          : 'text-muted-foreground/40 hover:text-muted-foreground'
                      }`}
                      title={visible ? 'Hide' : 'Show'}
                    >
                      {visible ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                <strong>Dynamic font size:</strong> 1 field → large (20pt), 2 fields → medium
                (15–17pt), 3+ fields → normal (13–15pt).
              </p>
            </div>
          </TabsContent>

          {/* ── Help Tab ── */}
          <TabsContent value="help" className="space-y-3 text-sm">
            <div>
              <h4 className="font-medium mb-1">Countdown Timer</h4>
              <p className="text-muted-foreground text-xs">
                Each alert shows a <code>MM:SS</code> countdown from the event time. The colour
                changes as time runs out. Expired alerts show a grey <em>timer_off</em> icon.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-1">Timer Colours</h4>
              <p className="text-muted-foreground text-xs">
                Each minute threshold (5/4/3/2/1 min) can have its own colour. 14 preset colours
                are available plus a custom colour picker.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-1">Event Type Filter</h4>
              <p className="text-muted-foreground text-xs">
                The server's notification settings are used automatically — only enabled event
                types appear. No duplicate configuration needed.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-1">Card Layout</h4>
              <p className="text-muted-foreground text-xs">
                Drag (▲/▼) to reorder fields and toggle visibility with the Eye icon. Font size
                adjusts automatically based on how many fields are shown.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* ── Actions ── */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty}>
              {t('save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
