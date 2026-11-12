// Calm list 7/7 (#241): the header and spacing pass. Tested at the route seam through App.
// - The app name never competes with a page title: a body-size wordmark at every width (rev-3
//   mock), named by BRAND (an image, not a heading: #363).
// - The Pipeline is panels (rev-3 mock): Follow up (under the lg list column) is an HDS Card
//   with a count Badge; the All jobs sheet's rows sit on one surface (#543); no tinted banners.
// - No cards within cards, ever (Adrian 2026-11-01, #449; replaced "lists are cards", 2026-10-23):
//   one card level max. A list inside a panel is rows in the panel's flow, split by spacing and
//   hairlines (`ItemList` / `ItemRow`), never a Card per item. Review new on Today has no card at
//   all: its heading, count and metadata declare the group.
// - Rhythm: the All jobs sheet's parts stack on one HDS gap (#543).
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
  it('Follow up is an HDS Card with a count Badge; the All jobs sheet has no To apply panel (#471), no tinted banners', async () => {
    loadSample();
    window.location.hash = '#/apply';
    renderApp();
    // On a phone the list is the All jobs sheet (Proposal A, Adrian 2026-11-08): its rows sit on
    // one surface, no Card per job (#543).
    const panel = await openAllJobs();
    const jobs = await within(panel).findByRole('navigation', { name: 'Jobs' });
    expect(within(jobs).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(panel.querySelectorAll(CARD)).toHaveLength(0);
    expect(screen.queryByRole('region', { name: /^To apply/ })).toBeNull();
    expect(tintedBoxesIn(panel)).toHaveLength(0);
    // No sync banner (and no avatar dot): the Account menu's sync line says it.
    expect(screen.queryByRole('region', { name: 'Sync your data' })).toBeNull();
    // Follow up is a panel under the lg list column (JobRail, #543), an HDS Card.
    cleanup();
    viewport(1440);
    window.location.hash = '#/apply';
    renderApp();
    expect(await screen.findByRole('region', { name: /^Follow up/ })).toHaveAttribute(
      'data-padding',
    );
  });

  it('the All jobs sheet stacks its parts on one gap', async () => {
    loadSample();
    window.location.hash = '#/apply';
    renderApp();
    const sheet = await openAllJobs();
    const jobs = await within(sheet).findByRole('navigation', { name: 'Jobs' });
    expect(jobs.parentElement).toHaveAttribute('data-hds-metrics', 'gap:normal');
  });

  it('the Documents library is rows in its panel, not a card per document (#449)', async () => {
    viewport(1440);
    addStarterMessages(); // a clean first run has none (Adrian 2026-10-22)
    window.location.hash = '#/copy-deck';
    const { container } = renderApp();
    const outreach = await screen.findByRole('region', { name: 'Messages' });
    await waitFor(() =>
      expect(within(outreach).getAllByRole('listitem').length).toBeGreaterThan(0),
    );
    const items = within(outreach).getAllByRole('listitem');
    for (const li of items) expect(isCard(li)).toBe(false);
    expect(items[0].parentElement).toHaveClass('rjb-items');
    expect(nestedCards(container)).toEqual([]);
  });

  it('the Apply list on a phone is rows on one surface, never a card per job (#543)', async () => {
    viewport(390);
    loadSample();
    window.location.hash = '#/apply';
    renderApp();
    const sheet = await openAllJobs();
    const jobs = await within(sheet).findByRole('navigation', { name: 'Jobs' });
    const rows = within(jobs).getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) {
      expect(isCard(r)).toBe(false);
      expect(r.closest(CARD)).toBeNull();
      // A long title clamps at 2 lines.
      expect(r.querySelector('.rjb-clamp-2')).not.toBeNull();
    }
    expect(nestedCards(sheet)).toEqual([]);
  });

  it('the Pipeline on desktop has no card inside a card (#449)', async () => {
    viewport(1440);
    loadSample();
    window.location.hash = '#/apply';
    const { container } = renderApp();
    // From lg the Jobs tab is the list beside the first job (#471).
    await screen.findByRole('navigation', { name: 'Jobs' });
    await screen.findByRole('region', { name: 'Copy into the form' });
    expect(nestedCards(container)).toEqual([]);
  });
});

describe('Today: no cards within cards (#449)', () => {
  it('Review new is a plain section (heading + count), not a card', async () => {
    viewport(390);
    window.location.hash = '#/find';
    const { container } = renderApp();
    const review = await screen.findByRole('region', { name: /^New postings$/ });
    expect(isCard(review)).toBe(false);
    expect(review.closest('[data-padding][data-variant]')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'New postings' })).toBeInTheDocument();
    expect(nestedCards(container)).toEqual([]);
  });
});
