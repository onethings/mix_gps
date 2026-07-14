import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { SessionProvider } from './context/SessionContext';
import { LiveDataProvider } from './context/LiveDataContext';
import { FlashProvider } from './context/FlashContext';
import { I18nProvider } from './lib/i18n';
import { TabsProvider } from './context/TabsContext';
import { env } from './lib/env';
import './index.css';

// Sentry initialisation (requires VITE_SENTRY_DSN in production)
if (env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENV,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    beforeSend: (event) => {
      if (import.meta.env.DEV && event.exception) {
        console.warn('[Sentry] Error caught in dev:', event.exception.values?.[0]?.value);
        return null;
      }
      return event;
    },
  });
}

const AppRoot = env.VITE_SENTRY_DSN
  ? Sentry.withProfiler(App)
  : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <BrowserRouter>
          <FlashProvider>
            <SessionProvider>
              <LiveDataProvider>
                <TabsProvider>
                  <AppRoot />
                </TabsProvider>
              </LiveDataProvider>
            </SessionProvider>
          </FlashProvider>
        </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
