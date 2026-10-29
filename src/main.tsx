// First: a magic link's session tokens leave the address bar before anything else reads it.
import './authFragment';
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
import { setScanOnOpen } from './feed/scanOnOpenFlag';
import { moveLegacyDecided } from './decided';
import App from './App';
import { getRoute } from './route';
import { preloadLanding } from './routeViews';
import { installFocusRescue } from './focusRescue';
import { installScrollMemory } from './scrollMemory';
import { installStaleBuildGuard } from './staleBuild';

// Vercel Web Analytics (page counts only; needs the dashboard toggle — see issue #16).
inject();
// Scrubbed crash reports to Supabase on the live site only (#47; never from localhost).
installErrorReporting();
// The auto-scan runs on open (#415); App's AutoScanOnOpen starts it once sync settles.
setScanOnOpen(true);
// Review new's old per-browser decisions into the synced stores, before sync reads them (#388).
moveLegacyDecided();
// Pages come back at the scroll they had (return paths): Back, Forward, a top tab, a reload.
installScrollMemory();
// Focus is never dropped: a page change focuses its heading, a row leaving hands focus on.
installFocusRescue();
// A tab older than the deploy: a chunk that is gone says "A new version is ready" (staleBuild.ts).
installStaleBuildGuard();

// The landing page's view first, so it renders with the shell instead of behind a skeleton (#372).
void preloadLanding(getRoute()).then(() =>
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
  ),
);
