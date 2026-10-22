import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { axe } from 'vitest-axe';

const h = vi.hoisted(() => ({ fake: null as null | ReturnType<typeof createFakeSupabase> }));
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return {
    createClient: () => {
      h.fake = createFakeSupabase();
      return h.fake.client;
    },
  };
});

import { createFakeSupabase } from './test/fakeSupabase';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import { getAllJobs, removeJob } from './store';
import { addCategory, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';

vi.setConfig({ testTimeout: 20_000 });

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

beforeEach(() => {
  // Radix Select measures and scrolls; jsdom has neither.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  h.fake?.reset();
  localStorage.clear();
  replaceCurationState(EMPTY_CURATION);
  addCategory({ label: 'Design Systems', atsRoles: ['design systems'] });
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/discover/ats';
});

afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
  replaceCurationState(EMPTY_CURATION);
});

describe('ATS search panel (Discover → AtsPanel)', () => {
  it('renders both tile set headings, toggles contract clause, checks "Search top N" word limits, and passes axe', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    // `#/discover/ats` opens the ATS search tool on Companies.
    expect(await screen.findByRole('radio', { name: /ATS search/i })).toBeChecked();

    // 1. "Company hiring systems" is a heading over three rows and a Show more; the big boards and
    // the freelance boards are closed rows with counts (rev-3 mock).
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Company hiring systems' }),
    ).toBeInTheDocument();
    const atsRows = () =>
      screen
        .getAllByRole('link', { name: 'Search' })
        .filter((a) => (a.getAttribute('href') ?? '').includes('site%3A'));
    expect(atsRows()).toHaveLength(3);
    for (const name of [/^Freelance, startup and remote boards/, /^Big job boards/]) {
      const row = screen.getByRole('button', { name });
      expect(row).toHaveAttribute('aria-expanded', 'false');
      await user.click(row);
    }
    await user.click(screen.getByRole('button', { name: /^Show \d+ more$/ }));
    expect(atsRows().length).toBeGreaterThan(3);

    // 2. Toggling Contract only adds the (contract OR freelance OR fractional) clause to a tile's href.
    // Hiring-system tiles are Google `site:` searches; the big boards (#223) sit above them.
    const atsLinks = () =>
      screen
        .getAllByRole('link', { name: 'Search' })
        .filter((a) => (a.getAttribute('href') ?? '').includes('site%3A'));
    const initialSearchLinks = atsLinks();
    expect(initialSearchLinks.length).toBeGreaterThan(0);
    const initialQuery =
      new URL(initialSearchLinks[0].getAttribute('href')!).searchParams.get('q') ?? '';
    expect(initialQuery).not.toContain('(contract OR freelance OR fractional)');

    await user.click(screen.getByRole('combobox', { name: /^Engagement/ }));
    await user.click(await screen.findByRole('option', { name: 'Contract only' }));

    // Every Google search re-reads it: each hiring-system and freelance-board row, and both
    // one-query links.
    const googleLinks = () =>
      screen.getAllByRole('link').filter((a) => (a.getAttribute('href') ?? '').includes('site%3A'));
    expect(atsLinks().length).toBeGreaterThan(3);
    for (const a of googleLinks())
      expect(new URL(a.getAttribute('href')!).searchParams.get('q')).toContain(
        '(contract OR freelance OR fractional)',
      );
    for (const name of [/^Search all boards/, /^Search the top \d+ boards/])
      expect(
        new URL(screen.getByRole('link', { name }).getAttribute('href')!).searchParams.get('q'),
      ).toContain('(contract OR freelance OR fractional)');

    // Back to Any role drops it again.
    await user.click(screen.getByRole('combobox', { name: /^Engagement/ }));
    await user.click(await screen.findByRole('option', { name: 'Any role' }));
    for (const a of googleLinks())
      expect(new URL(a.getAttribute('href')!).searchParams.get('q')).not.toContain(
        'contract OR freelance',
      );

    // 3. The one-query links (Search all boards, Search the top N) have 32 words or fewer.
    const topNLinks = screen.getAllByRole('link', { name: /Search the top|Search all boards/i });
    expect(topNLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of topNLinks) {
      const href = link.getAttribute('href')!;
      const q = new URL(href).searchParams.get('q') ?? '';
      const wordCount = q.split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBeGreaterThan(0);
      expect(wordCount).toBeLessThanOrEqual(32);
    }

    // 4. An axe accessibility check passes.
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });

  it('keeps both one-query searches within 32 words with many long titles and every filter on', async () => {
    const user = userEvent.setup();
    replaceCurationState(EMPTY_CURATION);
    addCategory({
      label: 'Design Systems',
      titles: [
        'senior design systems engineer',
        'staff design systems designer',
        'principal design engineer frontend',
        'design technologist component library',
        'ui platform engineer design tokens',
        'lead product designer design systems',
      ],
    });
    renderApp();

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Company hiring systems' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: /^Recency/ }));
    await user.click(await screen.findByRole('option', { name: 'Past week' }));
    await user.click(screen.getByRole('combobox', { name: /^Engagement/ }));
    await user.click(await screen.findByRole('option', { name: 'Contract only' }));
    await user.click(screen.getByRole('button', { name: /^Freelance, startup and remote boards/ }));

    // The cap trims titles first, so "Search all boards" still covers at least three systems.
    expect(screen.getByText(/with your first \d+ titles/)).toBeInTheDocument();
    for (const name of [/^Search all boards/, /^Search the top \d+ boards/]) {
      const q =
        new URL(screen.getByRole('link', { name }).getAttribute('href')!).searchParams.get('q') ??
        '';
      expect(q).toContain('(contract OR freelance OR fractional)');
      expect((q.match(/site:/g) ?? []).length).toBeGreaterThanOrEqual(3);
      expect(q.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(32);
    }
  });
});
