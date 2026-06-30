import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { SessionProvider } from './context/SessionContext';
import { LiveDataProvider } from './context/LiveDataContext';
import { FlashProvider } from './context/FlashContext';
import { I18nProvider } from './lib/i18n';
import { TabsProvider } from './context/TabsContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <BrowserRouter>
          <FlashProvider>
            <SessionProvider>
              <LiveDataProvider>
                <TabsProvider>
                  <App />
                </TabsProvider>
              </LiveDataProvider>
            </SessionProvider>
          </FlashProvider>
        </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
