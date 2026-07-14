// Dynamic language file loader — avoids bundling all 106 languages
// Placed in lib/ directory to avoid Vite dynamic-import-vars self-import restriction
interface Translations {
  nav: Record<string, string>;
  status: Record<string, string>;
  alarms: Record<string, string>;
}

// In-memory cache for loaded translations
const cache = new Map<string, Translations>();

let enPromise: Promise<Translations> | null = null;

function getEnglish(): Promise<Translations> {
  if (!enPromise) {
    enPromise = import('../language/en.js').then(
      (m) => ({ nav: m.nav, status: m.status, alarms: m.alarms }),
    );
  }
  return enPromise;
}

// Warm the English cache eagerly
getEnglish().then((en) => { if (!cache.has('en')) cache.set('en', en); });

/**
 * Dynamically load translations for the given locale.
 * Falls back to English if the language file fails to load.
 * Results are cached in memory after first load.
 */
export async function loadTranslations(locale: string): Promise<Translations> {
  if (cache.has(locale)) {
    return cache.get(locale)!;
  }

  try {
    const module = await import(`../language/${locale}.js`);
    const translations: Translations = {
      nav: module.nav ?? {},
      status: module.status ?? {},
      alarms: module.alarms ?? {},
    };
    cache.set(locale, translations);
    return translations;
  } catch {
    const en = await getEnglish();
    // Create a new object to ensure React detects a state change and re-renders
    const fallback: Translations = {
      nav: { ...en.nav },
      status: { ...en.status },
      alarms: { ...en.alarms },
    };
    cache.set(locale, fallback);
    return fallback;
  }
}
