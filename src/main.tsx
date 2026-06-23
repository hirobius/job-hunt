import React from 'react';
import { createRoot } from 'react-dom/client';
// HDS token layer (generated, framework-neutral) + the jade brand override. MUI reads
// resolved values via the theme; these expose the same tokens as CSS vars for raw CSS.
import './tokens/hds-tokens.css';
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
