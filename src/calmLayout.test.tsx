// Calm list 7/7 (#241): the header and spacing pass. Tested at the route seam through App.
// - The app name never competes with a page title: a body-size wordmark at every width (rev-3
//   mock), the one h1, named by BRAND.
// - The Pipeline is panels (rev-3 mock): To apply, Follow up and Jobs are HDS Cards with a count
//   Badge; no tinted banner boxes. The Documents list stays flat rows.
// - Rev-3 rhythm: the Pipeline's panels stack 24 apart.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addStarterMessages } from './addStarters';
import { BRAND } from './brand';
import { getAllJobs, removeJob } from './store';
import { loadSample } from './demo/loadSample';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

function viewport(width: number) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return {
      matches: min ? width >= Number(min[1]) : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  });
}

/** HDS Card marks its root with data-padding + data-variant; Callout is a tinted bg-muted box. */
const cardsIn = (el: Element) => el.querySelectorAll('[data-padding][data-variant]');
const tintedBoxesIn = (el: Element) => el.querySelectorAll('.bg-muted[data-tone]');

beforeEach(() => {
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  // @ts-expect-error -- jsdom has no matchMedia; tests that need one install it
  delete window.matchMedia;
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe('app bar (rev-3)', () => {
  it('the app name is the titleSm wordmark (rev-3 .brand) on a phone and on desktop, never title-size', () => {
    for (const width of [390, 1440]) {
      viewport(width);
      renderApp();
      const h1 = screen.getByRole('heading', { level: 1, name: BRAND.name });
      expect(h1.textContent).toBe(BRAND.name);
      expect(h1.className).toMatch(/hds-type-title-sm/);
      expect(h1.className).not.toMatch(/hds-type-(title|display)(?!-sm)\b/);
      cleanup();
    }
  });
});

describe('Pipeline panels (rev-3)', () => {
  it('To apply, Follow up and Jobs are HDS Cards with a count Badge; no tinted banners', async () => {
    loadSample();
    window.location.hash = '#/queue';
    renderApp();
    const toApply = await screen.findByRole('region', { name: /^To apply/ });
    const panel = toApply.closest('[role="tabpanel"]')!;
    for (const name of [/^To apply/, /^Follow up/, /^Jobs$/]) {
      const region = screen.getByRole('region', { name });
      expect(region).toHaveAttribute('data-padding');
    }
    expect(within(toApply).getByText('3')).toBeInTheDocument();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    expect(tintedBoxesIn(panel)).toHaveLength(0);
    // No sync banner (and no avatar dot): the Account menu's sync line says it.
    expect(screen.queryByRole('region', { name: 'Sync your data' })).toBeNull();
  });

  it('the Pipeline panels stack 24 apart', async () => {
    loadSample();
    window.location.hash = '#/queue';
    renderApp();
    const toApply = await screen.findByRole('region', { name: /^To apply/ });
    expect(toApply.parentElement).toHaveAttribute('data-hds-metrics', 'gap:px24');
  });

  it('the Documents library is flat rows, not a card per document (#227)', async () => {
    viewport(1440);
    addStarterMessages(); // a clean first run has none (Adrian 2026-10-22)
    window.location.hash = '#/copy-deck';
    renderApp();
    const outreach = await screen.findByRole('region', { name: 'Outreach messages' });
    await waitFor(() =>
      expect(within(outreach).getAllByRole('listitem').length).toBeGreaterThan(0),
    );
    expect(cardsIn(outreach)).toHaveLength(0);
  });
});
