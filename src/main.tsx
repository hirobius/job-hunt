import React from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
// HDS token layer (generated, framework-neutral) + the jade brand override. MUI reads
// resolved values from theme.ts; these expose the same tokens as CSS vars for raw CSS.
import './tokens/hds-tokens.css';
import './theme/brand-jade.css';
import { theme } from './theme';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
