import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe, Map as MapIcon, Mountain, Satellite } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { getMapStyleDef, MAP_STYLES, type MapStyleId } from '@/lib/mapStyles';

const STYLE_ICONS = {
  map: MapIcon,
  satellite: Satellite,
  globe: Globe,
  mountain: Mountain,
} as const;

interface MapStyleMenuProps {
  value: MapStyleId;
  onChange: (id: MapStyleId) => void;
}

export default function MapStyleMenu({ value, onChange }: MapStyleMenuProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = getMapStyleDef(value);
  const CurrentIcon = STYLE_ICONS[current.icon];

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
      >
        <CurrentIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t(current.labelKey, current.label)}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[10rem] rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {MAP_STYLES.map((s) => {
            const Icon = STYLE_ICONS[s.icon];
            const active = s.id === value;
            return (
              <button
                key={s.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(s.id);
                  close();
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                  active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="flex-1 text-left">{t(s.labelKey, s.label)}</span>
                {active && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
