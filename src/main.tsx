import React from 'react';
import { createRoot } from 'react-dom/client';
// HDS consumed directly from public npm (ADR-0005): styles.css = tokens + component
// styles + utilities with NO global reset (scoped to [data-hds], set on <body>).
// brand-jade.css remaps the accent to jade; base.css supplies the reset/body chrome MUI's
// CssBaseline used to (MUI is gone — issue #11).
import '@hirobius/design-system/styles.css';
import './theme/brand-jade.css';
import './theme/base.css';
import { inject } from '@vercel/analytics';
import { ColorModeProvider } from './ColorMode';
import App from './App';

// Vercel Web Analytics (page counts only; needs the dashboard toggle — see issue #16).
inject();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ColorModeProvider>
      <App />
    </ColorModeProvider>
  </React.StrictMode>,
);
