import React from 'react';
import { createRoot } from 'react-dom/client';
// HDS consumed directly from public npm (ADR-0005): styles.css = tokens + component
// styles + utilities with NO global reset (scoped to [data-hds], set on <body> so MUI
// portals stay inside the scope). brand-jade.css remaps the accent to jade after it.
import '@hirobius/design-system/styles.css';
import './theme/brand-jade.css';
import { ColorModeProvider } from './ColorMode';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ColorModeProvider>
      <App />
    </ColorModeProvider>
  </React.StrictMode>,
);
