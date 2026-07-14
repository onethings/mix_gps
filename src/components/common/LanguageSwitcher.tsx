import { useState } from 'react';
import { useT, LANGUAGES } from '@/lib/i18n';

export default function LanguageSwitcher({ className = '' }) {
  const { locale, setLocale } = useT();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find(l => l.code === locale) || LANGUAGES[0];

  return (
    <div className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
        <span className="shrink-0 text-base leading-none">{flagEmoji(locale)}</span>
        <span>{current.nativeName}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-80 w-52 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
          {LANGUAGES.map(l => (
            <button key={l.code} type="button"
              onClick={() => { setLocale(l.code); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
                l.code === locale ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}>
              <span className="shrink-0 w-5 text-center">{flagEmoji(l.code)}</span>
              <span>{l.nativeName}</span>
              <span className="ml-auto text-[10px] opacity-60">{l.code.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function flagEmoji(code) {
  const map = {
    en: '🇬🇧', zh: '🇨🇳', tw: '🇹🇼', fr: '🇫🇷', es: '🇪🇸',
    pt: '🇵🇹', ru: '🇷🇺', id: '🇮🇩', tr: '🇹🇷', fa: '🇮🇷',
    ja: '🇯🇵', vi: '🇻🇳', ar: '🇸🇦',
    ko: '🇰🇷', th: '🇹🇭', my: '🇲🇲',
    de: '🇩🇪', hi: '🇮🇳', it: '🇮🇹', nl: '🇳🇱', pl: '🇵🇱',
    ms: '🇲🇾', tl: '🇵🇭',
    uk: '🇺🇦', ro: '🇷🇴', cs: '🇨🇿', hu: '🇭🇺', sv: '🇸🇪',
    el: '🇬🇷', iw: '🇮🇱', bn: '🇧🇩', bg: '🇧🇬',
    da: '🇩🇰', no: '🇳🇴', fi: '🇫🇮', hr: '🇭🇷', sr: '🇷🇸',
    sk: '🇸🇰', lt: '🇱🇹', lv: '🇱🇻', et: '🇪🇪',
    sw: '🇹🇿', ur: '🇵🇰', kk: '🇰🇿', ka: '🇬🇪', sl: '🇸🇮',
    ne: '🇳🇵', km: '🇰🇭', si: '🇱🇰', af: '🇿🇦',
    ta: '🇮🇳', te: '🇮🇳', mr: '🇮🇳', gu: '🇮🇳', pa: '🇮🇳', kn: '🇮🇳', ml: '🇮🇳',
    am: '🇪🇹', ha: '🇳🇬', yo: '🇳🇬', so: '🇸🇴', zu: '🇿🇦',
    uz: '🇺🇿', az: '🇦🇿', hy: '🇦🇲', ku: '🇹🇷', ps: '🇦🇫',
    mn: '🇲🇳', lo: '🇱🇦', mk: '🇲🇰', ky: '🇰🇬', tg: '🇹🇯',
    jv: '🇮🇩', su: '🇮🇩', ig: '🇳🇬', om: '🇪🇹', or: '🇮🇳', ceb: '🇵🇭',
    mg: '🇲🇬', sd: '🇵🇰', sq: '🇦🇱', bs: '🇧🇦', ca: '🇪🇸', be: '🇧🇾',
    tk: '🇹🇲', sn: '🇿🇼', mi: '🇳🇿', cy: '🇬🇧', ga: '🇮🇪',
    xh: '🇿🇦', st: '🇱🇸', tn: '🇧🇼', ak: '🇬🇭', ff: '🇳🇬',
    ln: '🇨🇩', ny: '🇲🇼', rw: '🇷🇼', ti: '🇪🇷', ug: '🇨🇳',
    ht: '🇭🇹', gn: '🇵🇾', qu: '🇵🇪', ilo: '🇵🇭', hil: '🇵🇭',
    wo: '🇸🇳', rn: '🇧🇮',
  };
  return map[code] || '🌐';
}
