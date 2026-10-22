// Calm list 7/7 (#241): the header and spacing pass. Tested at the route seam through App.
// - The app name never competes with a page title: a body-size wordmark at every width (rev-3
//   mock), the one h1, named by BRAND.
// - Roomy layout (2026-10-22): every Pipeline section is a label with a count Badge on the canvas
//   over filled, borderless HDS Cards: To apply is one block card; Follow up and Jobs are item
//   cards. No tinted banner boxes, no outlines. Each document in the library is a card too.
// - Roomy rhythm: sections stack 40 apart (HDS `inset`, a scale step that follows density).
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
const isCard = (el: Element) => el.matches('[data-padding][data-variant]');
/** A card HDS draws with an outline: `bordered`, a feedback tone or the accent variant. */
const outlined = (el: Element) =>
  el.getAttribute('data-bordered') === 'true' ||
  (el.getAttribute('data-tone') ?? 'neutral') !== 'neutral' ||
  el.getAttribute('data-variant') === 'accent';
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
  it('To apply is a block card; Follow up and Jobs are item cards; none outlined (roomy)', async () => {
    loadSample();
    window.location.hash = '#/queue';
    renderApp();
    const toApply = await screen.findByRole('region', { name: /^To apply/ });
    const panel = toApply.closest('[role="tabpanel"]')!;
    // The section itself is not a card: its label sits on the canvas, its content on one card.
    expect(isCard(toApply)).toBe(false);
    expect(cardsIn(toApply)).toHaveLength(1);
    expect(within(toApply).getByText('3')).toBeInTheDocument();
    // Follow up: each item is its own card.
    const followUps = within(screen.getByRole('region', { name: /^Follow up/ })).getAllByRole(
      'listitem',
    );
    expect(followUps.length).toBeGreaterThan(0);
    for (const li of followUps) expect(isCard(li)).toBe(true);
    // Jobs: each job is an article card.
    const articles = within(screen.getByRole('region', { name: /^Jobs$/ })).getAllByRole('article');
    expect(articles.length).toBeGreaterThan(0);
    for (const a of articles) expect(isCard(a)).toBe(true);
    // No card on the page is outlined.
    expect([...cardsIn(panel)].filter(outlined)).toEqual([]);
    expect(tintedBoxesIn(panel)).toHaveLength(0);
    // No sync banner: the Account avatar's dot says it.
    expect(screen.queryByRole('region', { name: 'Sync your data' })).toBeNull();
  });

  it('the Pipeline sections stack 40 apart (inset)', async () => {
    loadSample();
    window.location.hash = '#/queue';
    renderApp();
    const toApply = await screen.findByRole('region', { name: /^To apply/ });
    expect(toApply.parentElement).toHaveAttribute('data-hds-metrics', 'gap:inset');
  });

  it('each document in the library is a filled card, with no hairline (roomy; was flat rows, #227)', async () => {
    viewport(1440);
    window.location.hash = '#/copy-deck';
    renderApp();
    const outreach = await screen.findByRole('region', { name: 'Outreach messages' });
    await waitFor(() =>
      expect(within(outreach).getAllByRole('listitem').length).toBeGreaterThan(0),
    );
    const items = within(outreach).getAllByRole('listitem');
    for (const li of items) expect(isCard(li)).toBe(true);
    expect([...cardsIn(outreach)].filter(outlined)).toEqual([]);
  });
});
