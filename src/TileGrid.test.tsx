import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import TileGrid from './TileGrid';
import { itemsInLine, MAX_META_ITEMS } from './metaLines';
import { getAllJobs, removeJob } from './store';
import type { Tile } from './jobsData';

const TILES: Tile[] = [
  {
    name: 'Travis Pattern & Foundry',
    meta: 'Casting shop · entry molder, will train · ~$20–26/hr · Spokane Valley · 509-466-3545 · 509-466-9999',
    url: 'https://www.travispattern.com/',
  },
  {
    name: 'Resume builder',
    meta: 'ATS-friendly resume builder',
    url: 'https://example.com/resume',
  },
  { name: 'Indeed', meta: 'Aggregator', url: 'https://www.indeed.com/jobs?q=welder' },
  {
    name: 'LinkedIn · Implementation Consultant (Remote)',
    meta: 'Live remote implementation / onboarding roles',
    url: 'https://www.linkedin.com/jobs/search/?keywords=implementation&f_TPR=r604800',
  },
];

const renderGrid = (triage = true) =>
  render(
    <ToastProvider>
      <TileGrid tiles={TILES} triage={triage} place="Spokane" />
    </ToastProvider>,
  );
const card = (name: string) => screen.getByRole('article', { name });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('TileGrid cards (#12, #131)', () => {
  it('shows pay, place and the first phone as chips, with the rest of the meta as a note', () => {
    renderGrid();
    const c = card('Travis Pattern & Foundry');
    expect(within(c).getByText('~$20–26/hr')).toBeVisible();
    expect(within(c).getByText('Spokane Valley')).toBeVisible();
    expect(within(c).getByRole('link', { name: '509-466-3545' })).toHaveAttribute(
      'href',
      'tel:5094663545',
    );
  });

  it("keeps an employer page's note behind Details, and the track's place in the facts", async () => {
    renderGrid();
    const c = card('Resume builder');
    expect(within(c).queryByText('ATS-friendly resume builder')).toBeNull();
    expect(within(c).getByText('Spokane')).toBeVisible();
    await userEvent.click(within(c).getByRole('button', { name: 'Details' }));
    expect(await screen.findByText('ATS-friendly resume builder')).toBeVisible();
  });

  it('a search tile shows where and how recent as facts, with the place out of its title (rev-3 H)', () => {
    renderGrid();
    const c = card('LinkedIn · Implementation Consultant (Remote)');
    // The title is a link out, so its name ends with HDS's "(opens in new tab)"; no "(Remote)".
    expect(
      within(c).getByRole('heading', {
        name: /^Implementation Consultant\s*\(opens in new tab\)$/,
      }),
    ).toBeVisible();
    expect(within(c).getByText('Remote')).toBeVisible();
    expect(within(c).getByText('Past week')).toBeVisible();
    expect(within(card('Indeed')).getByText('Any time')).toBeVisible();
    // Its note only restates the title: no Details.
    expect(within(c).queryByText(/onboarding roles/)).toBeNull();
    expect(within(c).queryByRole('button', { name: 'Details' })).toBeNull();
  });

  it('the title opens the page in a new tab, as Open does (Adrian 2026-10-22)', () => {
    renderGrid();
    const c = card('Travis Pattern & Foundry');
    const title = within(within(c).getByRole('heading')).getByRole('link');
    expect(title).toHaveAttribute('href', 'https://www.travispattern.com/');
    expect(title).toHaveAttribute('target', '_blank');
    expect(title.querySelector('svg')).not.toBeNull(); // the external-link icon
    expect(within(c).getByRole('link', { name: /^Open / })).toHaveAttribute(
      'href',
      'https://www.travispattern.com/',
    );
  });

  it('a tile whose link is not a web address keeps a plain title', () => {
    render(
      <ToastProvider>
        <TileGrid tiles={[{ name: 'Acme careers', meta: '', url: 'acme.example/careers' }]} />
      </ToastProvider>,
    );
    expect(within(card('Acme careers')).getByRole('heading').querySelector('a')).toBeNull();
  });

  it('marks search tiles with a kind badge', () => {
    renderGrid();
    expect(within(card('Indeed')).getByText('Search')).toBeVisible();
  });

  it('Details opens the full detail with a tap-to-call link for every phone', async () => {
    renderGrid();
    const c = card('Travis Pattern & Foundry');
    await userEvent.click(within(c).getByRole('button', { name: 'Details' }));
    const pop = await screen.findByRole('dialog', { name: /^Details/ });
    expect(within(pop).getByRole('link', { name: '509-466-9999' })).toHaveAttribute(
      'href',
      'tel:5094669999',
    );
    expect(within(pop).getByText('www.travispattern.com')).toBeVisible();
  });

  it('has a labelled Set aside button that turns into Restore', async () => {
    renderGrid();
    const c = card('Resume builder');
    await userEvent.click(within(c).getByRole('button', { name: 'Set aside' }));
    expect(within(c).getByRole('button', { name: 'Restore' })).toBeVisible();
  });

  it('Set aside is a quiet action (rev-3 G)', () => {
    renderGrid();
    // The tile set aside above stays set aside (the triage store outlives the test).
    expect(
      within(card('Indeed')).getByRole('button', { name: /^(Set aside|Restore)$/ }),
    ).toHaveClass('rjb-quiet');
  });

  it('a watched company board names its hiring system and carries a Board badge (rev-3 H)', () => {
    render(
      <ToastProvider>
        <TileGrid tiles={[{ name: 'Figma', meta: '', url: 'https://boards.greenhouse.io/figma' }]} />
      </ToastProvider>,
    );
    const c = card('Figma');
    expect(within(c).getByText('Greenhouse')).toBeVisible();
    expect(within(c).queryByText('boards.greenhouse.io')).toBeNull();
    expect(within(c).getByText('Board')).toBeVisible();
  });

  it('offers no Set aside without triage', () => {
    renderGrid(false);
    expect(screen.queryByRole('button', { name: 'Set aside' })).toBeNull();
  });
});

describe('Tile chips keep to two per row (#192)', () => {
  it('a tile with pay, place and a phone shows them on two rows, never three together', () => {
    renderGrid();
    const rows = card('Travis Pattern & Foundry').querySelectorAll('[data-meta-row]');
    expect(rows.length).toBe(2);
    rows.forEach((r) => expect(r.children.length).toBeLessThanOrEqual(2));
  });

  it('Details never puts more than two meta items on one line', async () => {
    renderGrid();
    const c = card('Travis Pattern & Foundry');
    await userEvent.click(within(c).getByRole('button', { name: 'Details' }));
    const pop = await screen.findByRole('dialog', { name: /^Details/ });
    const lines = Array.from(pop.querySelectorAll('[data-meta-detail]'));
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach((l) =>
      expect(itemsInLine(l.textContent ?? '')).toBeLessThanOrEqual(MAX_META_ITEMS),
    );
  });
});
