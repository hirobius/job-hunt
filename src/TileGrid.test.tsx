import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import TileGrid from './TileGrid';
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
];

const renderGrid = (triage = true) =>
  render(
    <ToastProvider>
      <TileGrid tiles={TILES} triage={triage} />
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

  it('falls back to the raw meta when it has no pay, place or contact', () => {
    renderGrid();
    expect(within(card('Resume builder')).getByText('ATS-friendly resume builder')).toBeVisible();
  });

  it('marks search tiles with a kind badge', () => {
    renderGrid();
    expect(within(card('Indeed')).getByText('Search')).toBeVisible();
  });

  it('expands to the full detail with a tap-to-call link for every phone', async () => {
    renderGrid();
    const c = card('Travis Pattern & Foundry');
    await userEvent.click(within(c).getByRole('button', { name: /details/i }));
    expect(within(c).getByRole('link', { name: '509-466-9999' })).toHaveAttribute(
      'href',
      'tel:5094669999',
    );
    expect(within(c).getByText('www.travispattern.com')).toBeVisible();
  });

  it('has a labelled Set aside button that turns into Restore', async () => {
    renderGrid();
    const c = card('Resume builder');
    await userEvent.click(within(c).getByRole('button', { name: 'Set aside' }));
    expect(within(c).getByRole('button', { name: 'Restore' })).toBeVisible();
  });

  it('offers no Set aside without triage', () => {
    renderGrid(false);
    expect(screen.queryByRole('button', { name: 'Set aside' })).toBeNull();
  });
});
