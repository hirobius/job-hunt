// Calm list 7/7 (#241): the header and spacing pass. Tested at the route seam through App.
// - The app name never competes with a page title: a body-size wordmark at every width (rev-3
//   mock), named by BRAND (an image, not a heading: #363).
// - The Pipeline is panels (rev-3 mock): Follow up and Jobs are HDS Cards with a count
//   Badge; no tinted banner boxes.
// - No cards within cards, ever (Adrian 2026-11-01, #449; replaced "lists are cards", 2026-10-23):
//   one card level max. A list inside a panel is rows in the panel's flow, split by spacing and
//   hairlines (`ItemList` / `ItemRow`), never a Card per item. Review new on Today has no card at
//   all: its heading, count and metadata declare the group.
// - Rev-3 rhythm: the Pipeline's panels stack 24 apart.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openAllJobs } from './test/allJobs';
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

/** An HDS Card root carries data-padding and data-variant. */
const CARD = '[data-padding][data-variant]';
const isCard = (el: Element) => el.matches(CARD);
/** Every Card that sits inside another Card: Adrian's rule is one card level max (#449). */
const nestedCards = (root: Element) =>
  Array.from(root.querySelectorAll(CARD))
    .filter((c) => c.parentElement?.closest(CARD))
    .map((c) => c.getAttribute('aria-label') ?? c.textContent?.slice(0, 40));

/** Callout is a tinted bg-muted box. */
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
  it('the app name is the 19px lockup wordmark on a phone and on desktop, never title-size', () => {
    for (const width of [390, 1440]) {
      viewport(width);
      renderApp();
      const word = screen.getByRole('img', { name: BRAND.name });
      expect(word.textContent).toBe(BRAND.name);
      expect(word.className).toBe('rjb-logo-word');
      cleanup();
    }
  });
});

describe('Pipeline panels (rev-3)', () => {
  it('Follow up and Jobs are HDS Cards with a count Badge; no To apply panel (#471), no tinted banners', async () => {
    loadSample();
    window.location.hash = '#/apply';
    renderApp();
    // On a phone the list is the All jobs sheet (Proposal A, Adrian 2026-11-08).
    const panel = await openAllJobs();
    await screen.findByRole('region', { name: /^Jobs$/ });
    expect(screen.getByRole('region', { name: /^Follow up/ })).toHaveAttribute('data-padding');
    // Jobs is flat: each job is its own card (Adrian 2026-11-08).
    expect(screen.getByRole('region', { name: /^Jobs$/ })).not.toHaveAttribute('data-padding');
    expect(screen.queryByRole('region', { name: /^To apply/ })).toBeNull();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    expect(tintedBoxesIn(panel)).toHaveLength(0);
    // No sync banner (and no avatar dot): the Account menu's sync line says it.
    expect(screen.queryByRole('region', { name: 'Sync your data' })).toBeNull();
  });

  it('the Pipeline panels stack 24 apart', async () => {
    loadSample();
    window.location.hash = '#/apply';
    renderApp();
    await openAllJobs();
    const jobsPanel = await screen.findByRole('region', { name: /^Jobs$/ });
    expect(jobsPanel.parentElement).toHaveAttribute('data-hds-metrics', 'gap:px24');
  });

  it('the Documents library is rows in its panel, not a card per document (#449)', async () => {
    viewport(1440);
    addStarterMessages(); // a clean first run has none (Adrian 2026-10-22)
    window.location.hash = '#/copy-deck';
    const { container } = renderApp();
    const outreach = await screen.findByRole('region', { name: 'Outreach messages' });
    await waitFor(() =>
      expect(within(outreach).getAllByRole('listitem').length).toBeGreaterThan(0),
    );
    const items = within(outreach).getAllByRole('listitem');
    for (const li of items) expect(isCard(li)).toBe(false);
    expect(items[0].parentElement).toHaveClass('rjb-items');
    expect(nestedCards(container)).toEqual([]);
  });

  it('the Apply list on a phone is one card per job in a flat panel, never cards in a card', async () => {
    viewport(390);
    loadSample();
    window.location.hash = '#/apply';
    renderApp();
    const sheet = await openAllJobs();
    const jobs = await screen.findByRole('region', { name: /^Jobs$/ });
    const rows = within(jobs).getAllByRole('article');
    expect(rows.length).toBeGreaterThan(1);
    // Each job its own card (Adrian 2026-11-08), its article inside that card.
    for (const r of rows) expect(r.parentElement!.closest('[data-padding]')).not.toBeNull();
    expect(nestedCards(sheet)).toEqual([]);
  });

  it('the Pipeline on desktop has no card inside a card (#449)', async () => {
    viewport(1440);
    loadSample();
    window.location.hash = '#/apply';
    const { container } = renderApp();
    // From lg the Jobs tab is the list beside the first job (#471).
    await screen.findByRole('navigation', { name: 'Jobs' });
    await screen.findByRole('region', { name: 'Templates' });
    expect(nestedCards(container)).toEqual([]);
  });
});

describe('Today: no cards within cards (#449)', () => {
  it('Review new is a plain section (heading + count), not a card', async () => {
    viewport(390);
    window.location.hash = '#/find';
    const { container } = renderApp();
    const review = await screen.findByRole('region', { name: /^Review new/ });
    expect(isCard(review)).toBe(false);
    expect(review.closest('[data-padding][data-variant]')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Review new' })).toBeInTheDocument();
    expect(nestedCards(container)).toEqual([]);
  });
});
