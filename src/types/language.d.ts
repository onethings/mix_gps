declare module '@/language/index.js' {
  interface LanguageInfo { native: string;
    code: string;
    name: string;
    nativeName: string;
  }

  interface Translations {
    nav: Record<string, string>;
    status: Record<string, string>;
    alarms: Record<string, string>;
  }

  export const LANGUAGES: LanguageInfo[];
  export const TRANSLATIONS: Record<string, Translations>;
}
