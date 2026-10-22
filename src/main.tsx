import React from 'react';
import { createRoot } from 'react-dom/client';
// HDS consumed directly from public npm (ADR-0005): styles.css = tokens + component
// styles + utilities with NO global reset (scoped to [data-hds], set on <body>).
// The theme is pure HDS: graphite accent, no local override (jade was removed 2026-10-15).
// base.css supplies the reset/body chrome MUI's CssBaseline used to (MUI is gone — issue #11).
import '@hirobius/design-system/styles.css';
import '@hirobius/design-system/fonts.css';
import './theme/base.css';
import { inject } from '@vercel/analytics';
import { ToastProvider } from '@hirobius/design-system';
import { ColorModeProvider } from './ColorMode';
import { ErrorBoundary } from './ErrorBoundary';
import { installErrorReporting } from './errorReport';
import App from './App';
import { installScrollMemory } from './scrollMemory';

// Vercel Web Analytics (page counts only; needs the dashboard toggle — see issue #16).
inject();
// Scrubbed crash reports to Supabase on the live site only (#47; never from localhost).
installErrorReporting();
// Pages come back at the scroll they had (return paths): Back, Forward, a top tab, a reload.
installScrollMemory();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ColorModeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ColorModeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
