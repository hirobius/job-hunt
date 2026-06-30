import React from 'react';
import { createRoot } from 'react-dom/client';
// HDS token layer (generated, framework-neutral) + the jade brand override. MUI reads
// resolved values via the theme; these expose the same tokens as CSS vars for raw CSS.
import './tokens/hds-tokens.css';
// Full HDS stylesheet (tokens + @layer base/components/utilities) so HDS COMPONENTS are styled,
// not just tokens. Its base reset is in @layer base — MUI/emotion are unlayered and so win over
// it (no MUI regression). brand-jade.css loads after to keep the jade accent. See docs/adr/0004.
import '@hirobius/design-system/tokens.css';
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
