// Discover redesign (#131), pinned at the route seam: App at #/discover, driven by role and text.
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
const feed = vi.hoisted(() => ({ fetchFeed: vi.fn() }));
vi.mock('./feed/fetchFeed', () => feed);

import { createFakeSupabase } from './test/fakeSupabase';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import {
  addCategory,
  addGroup,
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
  window.location.hash = '#/discover';
});
afterEach(cleanup);

// The location and mode controls live in the header's context popover.
const openContext = async (label: RegExp | string = /, (Any mode|Hybrid|On-site)$|^Remote$/) =>
  userEvent.click(await screen.findByRole('button', { name: label }));

const hrefs = () =>
  screen.getAllByRole('link', { name: /search/i }).map((a) => a.getAttribute('href') ?? '');

describe('Discover track context (slice 1)', () => {
  it('reads location from the track and shows one location control for every tool', async () => {
    window.location.hash = '#/discover/titles';
    renderApp();
    await openContext();
    expect(await screen.findByLabelText('Location')).toHaveValue('Spokane');
    expect(screen.getAllByLabelText('Location')).toHaveLength(1);
    expect(hrefs().some((u) => u.includes('l=Spokane'))).toBe(true);
  });

  it('changing the mode changes the Title search links', async () => {
    window.location.hash = '#/discover/titles';
    renderApp();
    await openContext();
    await userEvent.click(await screen.findByRole('radio', { name: 'Remote' }));
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
    window.location.hash = '#/discover/titles';
    const first = renderApp();
    await openContext();
    const box = await screen.findByLabelText('Location');
    await userEvent.clear(box);
    await userEvent.type(box, 'Boise');
    await userEvent.click(screen.getByRole('radio', { name: 'Hybrid' }));
    first.unmount();
    renderApp();
    await openContext('Boise, Hybrid');
    expect(await screen.findByLabelText('Location')).toHaveValue('Boise');
    expect(screen.getByRole('radio', { name: 'Hybrid' })).toBeChecked();
  });

  it('old #/discover/<groupId> routes still resolve', async () => {
    addGroup(cat, { label: 'First picks' });
    const g = addGroup(cat, { label: 'Union halls' });
    window.location.hash = `#/discover/${g}`;
    renderApp();
    expect(await screen.findByRole('tab', { name: 'Union halls', selected: true })).toBeVisible();
    expect(within(document.body).queryByText(/Pick a title/)).not.toBeInTheDocument();
  });
});

describe('Discover header and tools (slice 2)', () => {
  it('names the track in a page header and shows where and how you search in one button', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 2, name: 'Welding' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Spokane, Any mode' })).toBeVisible();
  });

  it('the context line follows the Manage track location', async () => {
    renderApp();
    await screen.findByRole('button', { name: 'Spokane, Any mode' });
    act(() => updateCategory(cat, { location: 'Tacoma' }));
    expect(await screen.findByRole('button', { name: 'Tacoma, Any mode' })).toBeVisible();
  });

  it('the Live search uses the mode picked in the header', async () => {
    window.location.hash = '#/discover/live';
    renderApp();
    await openContext();
    await userEvent.click(await screen.findByRole('radio', { name: 'Hybrid' }));
    expect(await screen.findByText('Searching in Spokane, Hybrid')).toBeVisible();
  });

  it('offers the tools as one segmented row and routes between them', async () => {
    addGroup(cat, { label: 'First picks' });
    renderApp();
    const tools = await screen.findByRole('radiogroup', { name: 'Search tool' });
    expect(
      within(tools)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Apply', 'Titles', 'ATS', 'Live', 'Boards', 'Teams']);
    expect(within(tools).getByRole('radio', { name: 'Apply' })).toBeChecked();
    await userEvent.click(within(tools).getByRole('radio', { name: 'ATS' }));
    expect(window.location.hash).toBe('#/discover/ats');
    await userEvent.click(within(tools).getByRole('radio', { name: 'Apply' }));
    expect(window.location.hash).toBe('#/discover');
  });

  it('lists the community boards and big-company systems on ATS search; the Slack row is a plain link', async () => {
    window.location.hash = '#/discover/ats';
    renderApp();
    for (const name of ['Smashing Jobs', 'SuccessFactors', 'Taleo', 'Oracle Recruiting'])
      expect(await screen.findByText(name)).toBeVisible();
    const card = await screen.findByRole('article', { name: 'Join Design Systems Slack' });
    const href = within(card).getByRole('link', { name: 'Search' }).getAttribute('href');
    expect(href).toMatch(/^https:\/\/.*slack/);
    expect(href).not.toContain('site%3A');
  });

  it('shows the track sections as tabs only under Apply now', async () => {
    addGroup(cat, { label: 'First picks' });
    addGroup(cat, { label: 'Union halls' });
    renderApp();
    const sections = await screen.findByRole('tablist', { name: 'Your sections' });
    expect(
      within(sections)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Apply now', 'Union halls']);
    await userEvent.click(screen.getByRole('radio', { name: 'Titles' }));
    expect(screen.queryByRole('tablist', { name: 'Your sections' })).toBeNull();
  });

  it('a track with no sections opens on Title search', async () => {
    renderApp();
    expect(await screen.findByRole('radio', { name: 'Titles' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Apply' })).toBeNull();
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
    expect(within(dialog).getByText(/outreach targets and saved searches/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /delete track/i }));
    expect(
      await screen.findByText(/its outreach targets and saved searches will be gone for good/),
    ).toBeInTheDocument();
  });
});

describe('Discover accessibility', () => {
  it.each([
    ['apply', '#/discover'],
    ['titles', '#/discover/titles'],
    ['ats', '#/discover/ats'],
    ['live', '#/discover/live'],
  ])('has no WCAG A/AA violations on the %s tool', async (_name, hash) => {
    const g1 = addGroup(cat, { label: 'First picks' });
    void g1;
    window.location.hash = hash;
    const { container } = renderApp();
    await screen.findByRole('radiogroup', { name: 'Search tool' });
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
