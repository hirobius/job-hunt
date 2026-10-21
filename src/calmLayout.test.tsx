// Calm list 7/7 (#241): the header and spacing pass. Tested at the route seam through App.
// - The app name never competes with a page title: a small mark on a phone, a body-size (16px)
//   wordmark from `sm` up; both are the one h1, named by BRAND.
// - None of the old card patterns: the Pipeline and the Templates list are flat rows on the page
//   (no bordered cards, no tinted banner boxes).
// - HDS docs-site rhythm: the Pipeline's sections stack 48 apart (Stack gap `spacious`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});

import { ColorModeProvider } from './ColorMode';
import App from './App';
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

describe('app bar (#241)', () => {
  it('on a phone the app name is a small mark: one letter, still named by the brand', () => {
    renderApp();
    const h1 = screen.getByRole('heading', { level: 1, name: BRAND.name });
    expect(h1.textContent).toBe(BRAND.name[0]);
  });

  it('from sm up it is the 16px (body) wordmark, never title-size', () => {
    viewport(1440);
    renderApp();
    const h1 = screen.getByRole('heading', { level: 1, name: BRAND.name });
    expect(h1.textContent).toBe(BRAND.name);
    expect(h1.className).toMatch(/hds-type-body/);
    expect(h1.className).not.toMatch(/hds-type-(title|display)/);
  });
});

describe('no old card patterns (#241)', () => {
  it('the Pipeline is flat rows: no bordered cards, no tinted banners', async () => {
    loadSample();
    window.location.hash = '#/queue';
    renderApp();
    const toApply = await screen.findByRole('region', { name: /^To apply/ });
    const panel = toApply.closest('[role="tabpanel"]')!;
    expect(screen.getByRole('region', { name: 'Sync your data' })).toBeInTheDocument();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    expect(cardsIn(panel)).toHaveLength(0);
    expect(tintedBoxesIn(panel)).toHaveLength(0);
  });

  it('the Pipeline sections stack 48 apart (HDS spacious)', async () => {
    loadSample();
    window.location.hash = '#/queue';
    renderApp();
    const toApply = await screen.findByRole('region', { name: /^To apply/ });
    const sections = toApply.parentElement!;
    expect(sections).toHaveAttribute('data-hds-metrics', 'gap:spacious');
    // ...and the page header sits 24 over them (HDS normal).
    const page = screen
      .getByRole('heading', { name: 'Pipeline' })
      .closest('[data-hds-metrics="gap:normal"]');
    expect(page).not.toBeNull();
  });

  it('the Documents library is flat rows, not a card per document (#227)', async () => {
    viewport(1440);
    window.location.hash = '#/copy-deck';
    renderApp();
    const outreach = await screen.findByRole('region', { name: 'Outreach messages' });
    await waitFor(() =>
      expect(within(outreach).getAllByRole('listitem').length).toBeGreaterThan(0),
    );
    expect(cardsIn(outreach)).toHaveLength(0);
  });
});
