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

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

beforeEach(() => {
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

    // Open/select the ATS search tool (DiscoverView is code-split / lazy-loaded).
    const atsControl =
      screen.queryByRole('radio', { name: /ATS/i }) ??
      (await screen.findByRole('radio', { name: /ATS/i }).catch(() => null)) ??
      (await screen.findByRole('tab', { name: /ATS/i }).catch(() => null));
    if (atsControl) {
      await user.click(atsControl);
    }

    // 1. Headings "Company hiring systems" and "Freelance, startup and remote boards" are present.
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Company hiring systems' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Freelance, startup and remote boards' }),
    ).toBeInTheDocument();

    // 2. Toggling Contract only adds the (contract OR freelance OR fractional) clause to a tile's href.
    const initialSearchLinks = screen.getAllByRole('link', { name: 'Search' });
    expect(initialSearchLinks.length).toBeGreaterThan(0);
    const initialQuery =
      new URL(initialSearchLinks[0].getAttribute('href')!).searchParams.get('q') ?? '';
    expect(initialQuery).not.toContain('(contract OR freelance OR fractional)');

    const contractOption = screen.getByRole('radio', { name: 'Contract only' });
    await user.click(contractOption);

    // Re-query tile search links after state change (key changes re-mount the tile cards).
    const updatedSearchLinks = screen.getAllByRole('link', { name: 'Search' });
    const updatedQuery =
      new URL(updatedSearchLinks[0].getAttribute('href')!).searchParams.get('q') ?? '';
    expect(updatedQuery).toContain('(contract OR freelance OR fractional)');

    // 3. Each "Search the top N" href has 32 words or fewer.
    const topNLinks = screen.getAllByRole('link', { name: /Search the top/i });
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
});
