// Discover → Teams (docs/specs/discovery-methods.md, method 3): design-system organisations from
// GitHub as outreach targets, pinned at the route seam with a stubbed `fetch` for GitHub and the ATSs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
import { addCategory, getCurationState, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { GH_BUDGET_KEY } from './feed/githubBudget';
import { TARGETS_KEY, readTargets } from './feed/targets';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

const repo = (login: string, stars: number, extra: Record<string, unknown> = {}) => ({
  full_name: `${login}/ds`,
  html_url: `https://github.com/${login}/ds`,
  stargazers_count: stars,
  topics: ['design-system'],
  archived: false,
  fork: false,
  owner: { login, type: 'Organization' },
  ...extra,
});

const gh = { limited: false };
const json = (b: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers });
const fakeFetch = vi.fn(async (url: string) => {
  if (url.startsWith('https://api.github.com/search/repositories')) {
    if (gh.limited)
      return json({}, 403, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 900),
      });
    return json({
      items: [
        repo('acme', 900),
        repo('quiet', 300),
        repo('forky', 800, { fork: true }),
        repo('tiny', 3),
      ],
    });
  }
  if (url === 'https://api.github.com/orgs/acme')
    return json({ name: 'Acme Design', blog: 'acme.example.com' });
  if (url === 'https://api.github.com/orgs/quiet') return json({ name: 'Quiet Co' });
  if (url === 'https://api.lever.co/v0/postings/acme?mode=json') return json([{}, {}]);
  return json({}, 404);
});

let cat: string;
beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  gh.limited = false;
  fakeFetch.mockClear();
  vi.stubGlobal('fetch', fakeFetch);
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Design systems', titles: ['Design engineer'], atsRoles: ['design'] });
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/discover/teams';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const find = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Find design-system teams' }));
  return screen.findByRole('list', { name: 'Design-system teams' });
};

describe('Design-system teams', () => {
  it('is a tool in the Discover row', async () => {
    renderApp();
    const tools = await screen.findByRole('radiogroup', { name: 'Search tool' });
    expect(within(tools).getByRole('radio', { name: 'Teams' })).toBeChecked();
  });

  it('lists organisations by stars, with open roles where a board exists and not otherwise', async () => {
    renderApp();
    const list = await find();
    await screen.findByText('2 teams found');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2); // the fork and the 3-star repo are left out
    expect(rows[0]).toHaveTextContent('Acme Design');
    expect(rows[0]).toHaveTextContent('900 stars');
    expect(rows[0]).toHaveTextContent('Open roles: 2');
    expect(rows[0]).toHaveTextContent('Lever');
    expect(rows[1]).toHaveTextContent('Quiet Co');
    expect(rows[1]).toHaveTextContent('Open roles: none found');
    // An organisation without a board still gets a careers search, not a dead end.
    expect(
      within(rows[1]).getByRole('link', { name: 'Search careers for Quiet Co' }),
    ).toBeVisible();
    expect(within(rows[0]).getByRole('link', { name: /^Acme Design/ })).toHaveAttribute(
      'href',
      'https://acme.example.com',
    );
  });

  it('Save as target persists across a reload and shows under Saved', async () => {
    renderApp();
    await find();
    await screen.findByText('2 teams found');
    await userEvent.click(screen.getByRole('button', { name: 'Save as target: Quiet Co' }));
    expect(readTargets(cat).map((t) => t.login)).toEqual(['quiet']);
    expect(screen.getByRole('button', { name: 'Saved Quiet Co' })).toBeDisabled();
    cleanup();
    expect(localStorage.getItem(TARGETS_KEY)).toContain('quiet');
    renderApp();
    const saved = await screen.findByRole('list', { name: 'Saved targets' });
    expect(saved).toHaveTextContent('Quiet Co');
    await userEvent.click(within(saved).getByRole('button', { name: 'Remove Quiet Co' }));
    expect(readTargets(cat)).toEqual([]);
  });

  it('Watch board adds a tile to the track', async () => {
    renderApp();
    await find();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Watch board for Acme Design' }),
    );
    await waitFor(() =>
      expect(getCurationState().tiles.map((t) => t.url)).toContain('https://jobs.lever.co/acme'),
    );
    expect(screen.getByRole('button', { name: 'Watching Acme Design' })).toBeDisabled();
  });

  it('stops on a GitHub rate limit and says when to come back', async () => {
    gh.limited = true;
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Find design-system teams' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/GitHub asks us to wait until /);
    // Our own budget now holds back the next try without calling GitHub again.
    const before = fakeFetch.mock.calls.length;
    gh.limited = false;
    await userEvent.click(
      await screen.findByRole('button', { name: /Find .*design-system teams/ }),
    );
    await screen.findByRole('alert');
    expect(fakeFetch.mock.calls.length).toBe(before);
    expect(localStorage.getItem(GH_BUDGET_KEY)).toContain('blockedUntil');
  });

  it('has no WCAG A/AA violations', async () => {
    const { container } = renderApp();
    await find();
    await screen.findByText('2 teams found');
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
