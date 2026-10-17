// One C v3 screen per page load: ?s=<screen id>&theme=dark. The gallery frames each one in an
// iframe at its real width, so HDS breakpoints behave as they would on that device.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@hirobius/design-system/styles.css';
import '@hirobius/design-system/fonts.css';
import '../../../../../src/theme/base.css';
import { ToastProvider } from '@hirobius/design-system';
import placement from '../placement.json';
import { SCREENS } from './screens';

const params = new URLSearchParams(window.location.search);
const meta = placement.screens.find((s) => s.id === params.get('s'));
const id = (meta && 'of' in meta && meta.of) || params.get('s') || 'companies';
const theme = params.get('theme') ?? (meta && 'theme' in meta ? meta.theme : undefined);
if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
document.title = `C v3 · ${meta?.name ?? id}`;

const Screen = SCREENS[id] ?? SCREENS.companies;
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>{Screen()}</ToastProvider>
  </React.StrictMode>,
);
