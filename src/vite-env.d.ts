/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRACCAR_URL: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENV?: 'development' | 'staging' | 'production';
  readonly VITE_SENTRY_AUTH_TOKEN?: string;
  readonly VITE_SENTRY_ORG?: string;
  readonly VITE_SENTRY_PROJECT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'virtual:pwa-register/react' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useRegisterSW(options?: any): {
    needRefresh: [boolean, (v: boolean) => void];
    offlineReady: [boolean, (v: boolean) => void];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
