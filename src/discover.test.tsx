// Discover redesign (#131), pinned at the route seam: App at #/discover, driven by role and text.
import './test/legacyScreens';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { ToastProvider } from '@hirobius/design-system';

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
const feed = vi.hoisted(() => ({
  fetchFeed: vi.fn(),
  liveFetchJson: vi.fn(),
  createFetchJson: () => vi.fn(),
}));
vi.mock('./feed/fetchFeed', async (orig) => ({
  ...(await orig<typeof import('./feed/fetchFeed')>()),
  ...feed,
}));

import { createFakeSupabase } from './test/fakeSupabase';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import {
  addCategory,
  addGroup,
  addTile,
  replaceCurationState,
  updateCategory,
} from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { modeKey } from './discoverContext';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

let cat: string;
beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  feed.fetchFeed.mockReset().mockResolvedValue({ postings: [], sources: [] });
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({
    label: 'Welding',
    titles: ['Welder'],
    atsRoles: ['welder'],
    location: 'Spokane',
  });
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/discover/apply';
});
afterEach(cleanup);

// The location and mode controls live in the header's context popover.
const openContext = async (label: RegExp | string = /^Change where: /) =>
  userEvent.click(await screen.findByRole('button', { name: label }));

const hrefs = () =>
  screen.getAllByRole('link', { name: /search/i }).map((a) => a.getAttribute('href') ?? '');

/** ATS search's board lists start closed and its hiring systems show three (rev-3 mock): open
 *  them all, so every generated link is on the page. */
const openAllBoards = async () => {
  for (const name of [
    /^Big job boards/,
    /^Freelance, startup and remote boards/,
    /^Show \d+ more$/,
  ])
    await userEvent.click(await screen.findByRole('button', { name }));
};

describe('Discover track context (slice 1)', () => {
  it('reads location from the track and shows one location control for every tool', async () => {
    window.location.hash = '#/discover/ats';
    renderApp();
    await openContext();
    expect(await screen.findByLabelText('Location')).toHaveValue('Spokane');
    expect(screen.getAllByLabelText('Location')).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    await openAllBoards();
    expect(hrefs().some((u) => u.includes('l=Spokane'))).toBe(true);
  });

  it('changing the mode changes the big-board search links', async () => {
    window.location.hash = '#/discover/ats';
    renderApp();
    await openContext();
    await userEvent.click(await screen.findByRole('radio', { name: 'Remote' }));
    await userEvent.keyboard('{Escape}');
    await openAllBoards();
    expect(hrefs().some((u) => u.includes('l=Remote'))).toBe(true);
    expect(localStorage.getItem(modeKey(cat))).toBe('remote');
  });

  it('keeps one location control on ATS search and Live postings', async () => {
    window.location.hash = '#/discover/ats';
    const { unmount } = renderApp();
    await openContext();
    expect(await screen.findByLabelText('Location')).toHaveValue('Spokane');
    expect(screen.getAllByLabelText('Location')).toHaveLength(1);
    unmount();
    window.location.hash = '#/discover/live';
    renderApp();
    await openContext();
    expect(await screen.findByLabelText('Location')).toHaveValue('Spokane');
    expect(screen.getAllByLabelText('Location')).toHaveLength(1);
  });

  it('typing a location writes it to the track, and the mode survives a remount', async () => {
    window.location.hash = '#/discover/ats';
    const first = renderApp();
    await openContext();
    const box = await screen.findByLabelText('Location');
    await userEvent.clear(box);
    await userEvent.type(box, 'Boise');
    await userEvent.click(screen.getByRole('radio', { name: 'Hybrid' }));
    first.unmount();
    renderApp();
    await openContext('Change where: Boise, Hybrid');
    expect(await screen.findByLabelText('Location')).toHaveValue('Boise');
    expect(screen.getByRole('radio', { name: 'Hybrid' })).toBeChecked();
  });

  it('old #/discover/<groupId> routes still resolve', async () => {
    addGroup(cat, { label: 'First picks' });
    const g = addGroup(cat, { label: 'Union halls' });
    window.location.hash = `#/discover/${g}`;
    renderApp();
    expect(await screen.findByRole('heading', { level: 3, name: 'Union halls' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Big job boards/ })).not.toBeInTheDocument();
  });
});

describe('Discover header and tools (slice 2)', () => {
  it('names the track in a page header and shows where and how you search in one button', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 2, name: 'Welding' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Change where: Spokane, any mode' })).toBeVisible();
  });

  it('the context line follows the Manage track location', async () => {
    renderApp();
    await screen.findByRole('button', { name: 'Change where: Spokane, any mode' });
    act(() => updateCategory(cat, { location: 'Tacoma' }));
    expect(
      await screen.findByRole('button', { name: 'Change where: Tacoma, any mode' }),
    ).toBeVisible();
  });

  it('the Live search uses the mode picked in the header', async () => {
    window.location.hash = '#/discover/live';
    renderApp();
    await openContext();
    await userEvent.click(await screen.findByRole('radio', { name: 'Hybrid' }));
    // The header's one context button says it; Live postings repeats no context line (rev-3).
    expect(
      await screen.findByRole('button', { name: 'Change where: Spokane, Hybrid' }),
    ).toBeVisible();
    expect(screen.queryByText('Searching in Spokane, Hybrid')).toBeNull();
  });

  it('offers the tools as one segmented row and routes between them', async () => {
    addGroup(cat, { label: 'First picks' });
    renderApp();
    const tools = await screen.findByRole('radiogroup', { name: 'Search tool' });
    expect(
      within(tools)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Apply now', 'Watched', 'ATS search']);
    expect(within(tools).getByRole('radio', { name: 'Apply now' })).toBeChecked();
    await userEvent.click(within(tools).getByRole('radio', { name: 'ATS search' }));
    expect(window.location.hash).toBe('#/discover/ats');
    await userEvent.click(within(tools).getByRole('radio', { name: 'Watched' }));
    expect(window.location.hash).toBe('#/discover/teams');
    await userEvent.click(within(tools).getByRole('radio', { name: 'Apply now' }));
    expect(window.location.hash).toBe('#/discover');
  });

  it('follows the track: a welding track opens on Apply now and its Teams tool names its source instead of GitHub', async () => {
    addGroup(cat, { label: 'First picks' });
    window.location.hash = '#/discover';
    renderApp();
    const tools = await screen.findByRole('radiogroup', { name: 'Search tool' });
    expect(within(tools).getByRole('radio', { name: 'Apply now' })).toBeChecked();
    await userEvent.click(within(tools).getByRole('radio', { name: 'Watched' }));
    // No GitHub search (#215): its source is the YC hiring list, said in one line.
    expect(
      await screen.findByText(
        /^Suggestions come from YC companies hiring now\. GitHub search only/,
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add a company' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Suggest companies' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Find .* teams$/ })).toBeNull();
  });

  it('a design-systems track opens on Teams and searches its own field; the old teams slug still works', async () => {
    const ds = addCategory({ label: 'Design systems', titles: ['Design Systems Engineer'] });
    addGroup(ds, { label: 'First picks' });
    localStorage.setItem('rjb_active_category', ds);
    window.location.hash = '#/discover';
    renderApp();
    const tools = await screen.findByRole('radiogroup', { name: 'Search tool' });
    expect(
      within(tools)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Watched', 'Apply now', 'ATS search']);
    expect(within(tools).getByRole('radio', { name: 'Watched' })).toBeChecked();
    expect(await screen.findByRole('button', { name: 'Find design-system teams' })).toBeVisible();
    cleanup();
    window.location.hash = '#/discover/teams';
    renderApp();
    expect(
      within(await screen.findByRole('radiogroup', { name: 'Search tool' })).getByRole('radio', {
        name: 'Watched',
      }),
    ).toBeChecked();
  });

  it('lists the community boards and big-company systems on ATS search; the Slack row is a plain link', async () => {
    window.location.hash = '#/discover/ats';
    renderApp();
    await openAllBoards();
    for (const name of ['Smashing Jobs', 'SuccessFactors', 'Taleo', 'Oracle Recruiting'])
      expect(await screen.findByText(name)).toBeVisible();
    const card = await screen.findByRole('article', { name: 'Join Design Systems Slack' });
    const href = within(card).getByRole('link', { name: 'Search' }).getAttribute('href');
    expect(href).toMatch(/^https:\/\/.*slack/);
    expect(href).not.toContain('site%3A');
  });

  it('stacks the track sections under Apply now: the first open, the rest closed rows (rev-3 G)', async () => {
    addGroup(cat, { label: 'First picks' });
    addGroup(cat, { label: 'Union halls' });
    renderApp();
    const sections = await screen.findByRole('region', { name: 'Your sections' });
    expect(within(sections).getByRole('heading', { level: 3, name: 'First picks' })).toBeVisible();
    expect(screen.queryByRole('tablist', { name: 'Your sections' })).toBeNull();
    await userEvent.click(within(sections).getByRole('button', { name: /^Union halls/ }));
    expect(
      await within(sections).findByRole('heading', { level: 3, name: 'Union halls' }),
    ).toBeVisible();
    expect(within(sections).getByRole('button', { name: /^First picks/ })).toBeVisible();
    await userEvent.click(screen.getByRole('radio', { name: 'ATS search' }));
    expect(screen.queryByRole('region', { name: 'Your sections' })).toBeNull();
  });

  it('two tracks: the page title is the switcher, with no separate combobox (rev-3 G)', async () => {
    addCategory({ label: 'ServiceNow', titles: ['Admin'], atsRoles: [] });
    renderApp();
    const trigger = await screen.findByRole('button', { name: 'Switch track: Welding' });
    expect(screen.queryByRole('combobox', { name: 'Track to search' })).toBeNull();
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'ServiceNow' }));
    expect(await screen.findByRole('button', { name: 'Switch track: ServiceNow' })).toBeVisible();
  });

  it('a closed section row counts its links in a badge, not an "N links" line', async () => {
    addGroup(cat, { label: 'First picks' });
    const g = addGroup(cat, { label: 'Union halls' });
    addTile(g, { name: 'Local 55', url: 'https://local55.example.org/', meta: '' });
    addTile(g, { name: 'Local 44', url: 'https://local44.example.org/', meta: '' });
    renderApp();
    const sections = await screen.findByRole('region', { name: 'Your sections' });
    const row = within(sections).getByRole('button', { name: /^Union halls/ });
    expect(within(row).getByRole('img', { name: '2 links' })).toBeInTheDocument();
    expect(within(sections).queryByText('2 links')).toBeNull();
    expect(within(sections).getByText('Local 55, Local 44')).toBeInTheDocument();
  });

  it('names the featured Apply now section Job boards, not the tool again (rev-3 G)', async () => {
    addGroup(cat, { label: 'Apply Now' });
    addGroup(cat, { label: 'Union halls' });
    renderApp();
    const sections = await screen.findByRole('region', { name: 'Your sections' });
    expect(within(sections).getByRole('heading', { level: 3, name: 'Job boards' })).toBeVisible();
    expect(within(sections).queryByRole('heading', { name: 'Apply now' })).toBeNull();
  });

  it('a track with no sections opens on ATS search', async () => {
    renderApp();
    expect(await screen.findByRole('radio', { name: 'ATS search' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Apply now' })).toBeNull();
  });

  it('Manage track keeps Delete out of the footer so it cannot sit on Done', async () => {
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage track' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Done' })).toBeVisible();
    const del = within(dialog).getByRole('button', { name: /delete track/i });
    expect(within(dialog).getByRole('button', { name: 'Done' }).parentElement).not.toContainElement(
      del,
    );
  });

  // #189 follow-up: deleting a track also drops its outreach targets and saved searches; say so.
  it('Delete track names the targets and saved searches that go with it', async () => {
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage track' }));
    const dialog = await screen.findByRole('dialog');
    // A quiet button, no loud card: the copy lives in the confirm.
    expect(within(dialog).queryByText(/outreach targets and saved searches/)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete track' }));
    expect(
      await screen.findByText(/its outreach targets and saved searches will be gone for good/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Jobs you saved stay in your Pipeline/)).toBeInTheDocument();
  });

  it('Manage track: one label style, plain words, a full Seniority row', async () => {
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Manage track' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: 'Experienced' })).toBeInTheDocument();
    expect(within(dialog).queryByText('Exp.')).toBeNull();
    for (const name of ['Seniority', 'Title search terms', 'ATS role terms'])
      expect(within(dialog).getByText(name).tagName).toBe('LABEL');
    expect(within(dialog).getByPlaceholderText('Add a title')).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText('Add an ATS role term')).toBeInTheDocument();
    const add = within(dialog).getByRole('button', { name: 'Add section' });
    expect(add.textContent).not.toContain('＋');
    expect(add.querySelector('svg')).not.toBeNull();
  });
});

describe('Discover accessibility', () => {
  it.each([
    ['apply', '#/discover/apply'],
    ['companies', '#/discover/teams'],
    ['ats', '#/discover/ats'],
    ['live', '#/discover/live'],
  ])('has no WCAG A/AA violations on the %s tool', async (_name, hash) => {
    const g1 = addGroup(cat, { label: 'First picks' });
    void g1;
    window.location.hash = hash;
    const { container } = renderApp();
    // Live postings is a secondary view: Back to companies stands in for the tool switch.
    await screen.findByRole(hash.endsWith('/live') ? 'link' : 'radiogroup', {
      name: hash.endsWith('/live') ? 'Back to companies' : 'Search tool',
    });
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
