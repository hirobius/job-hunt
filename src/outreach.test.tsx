// Discover → Companies (slug `teams`; docs/specs/discovery-methods.md, method 3): design-system
// organisations from GitHub, open roles first, quick save, dream companies and outreach targets, pinned
// at the route seam with a stubbed `fetch` for GitHub and the ATSs.
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
import { readDreams } from './feed/dreams';
import { getAllJobs } from './store';

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
const leverJob = (id: string, text: string) => ({
  id,
  text,
  hostedUrl: `https://jobs.lever.co/acme/${id}`,
  categories: { location: 'Remote' },
});
// Acme's board: one design role (matches the track's "design") and one that doesn't.
const acmeJobs = [leverJob('1', 'Design Engineer'), leverJob('2', 'Sales Lead')];
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
        repo('flaky', 500),
        repo('dtcg', 450),
        repo('voltagent', 400, { full_name: 'voltagent/awesome-design-md' }),
        repo('quiet', 300),
        repo('forky', 800, { fork: true }),
        repo('tiny', 3),
      ],
    });
  }
  if (url === 'https://api.github.com/orgs/acme')
    return json({ name: 'Acme Design', blog: 'acme.example.com' });
  if (url === 'https://api.github.com/orgs/quiet')
    return json({ name: 'Quiet Co', blog: 'quiet.example' });
  if (url === 'https://api.github.com/orgs/dtcg')
    return json({ name: 'Design Tokens Community Group', blog: 'design-tokens.org' });
  if (url === 'https://api.github.com/orgs/flaky')
    return json({ name: 'Flaky', blog: 'flaky.example' });
  // Flaky's boards never answer: "Couldn't check", never "no board".
  if (url.includes('flaky')) return json({}, 503);
  if (url === 'https://api.lever.co/v0/postings/acme?mode=json') return json(acmeJobs);
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

describe('Companies (design-system teams)', () => {
  it('is the Companies tool in the Discover row', async () => {
    renderApp();
    const tools = await screen.findByRole('radiogroup', { name: 'Search tool' });
    expect(within(tools).getByRole('radio', { name: 'Companies' })).toBeChecked();
  });

  it('open roles first: Hiring now puts boards not found below, collapsed; keeps the unchecked', async () => {
    renderApp();
    const list = await find();
    await screen.findByText(/3 teams found · 1 hiring now/);
    await within(list).findByText(/1 matching role · 2 open in all/);
    const names = () =>
      within(screen.getByRole('list', { name: 'Design-system teams' }))
        .getAllByText(/^(Acme Design|Flaky|Quiet Co)( \(opens in new tab\))?$/)
        .map((n) => n.textContent?.replace(' (opens in new tab)', ''));
    expect(names()).toEqual(['Acme Design', 'Flaky']);
    expect(list).toHaveTextContent("Couldn't check");
    // Not employers: the community group and the awesome-* list are left out.
    expect(screen.queryByText(/Design Tokens Community Group|voltagent/)).toBeNull();
    // Board not found is unknown, not "none": below, collapsed.
    await userEvent.click(screen.getByRole('button', { name: 'Board not found (1)' }));
    expect(screen.getByRole('list', { name: 'Board not found' })).toHaveTextContent('Quiet Co');

    await userEvent.click(screen.getByRole('switch', { name: 'Hiring now' }));
    expect(names()).toEqual(['Acme Design', 'Flaky', 'Quiet Co']);
    const rows = within(screen.getByRole('list', { name: 'Design-system teams' })).getAllByRole(
      'listitem',
    );
    const quiet = rows.find((r) => r.textContent?.includes('Quiet Co'))!;
    expect(quiet).toHaveTextContent('Board not found');
    // An organisation without a board still gets a careers search, not a dead end.
    expect(within(quiet).getByRole('link', { name: 'Search careers for Quiet Co' })).toBeVisible();
    expect(within(rows[0]).getByRole('link', { name: /^Acme Design/ })).toHaveAttribute(
      'href',
      'https://acme.example.com',
    );
  });

  it('saves a matching role to the Pipeline in one tap; the shared save notice offers Undo', async () => {
    renderApp();
    await find();
    await userEvent.click(await screen.findByRole('button', { name: /Show 1 matching role/ }));
    const roles = await screen.findByRole('list', { name: 'Open roles at Acme Design' });
    expect(within(roles).queryByText('Sales Lead')).toBeNull();
    await userEvent.click(within(roles).getByRole('button', { name: 'Save Design Engineer' }));
    expect(getAllJobs().map((j) => j.label)).toEqual(['Design Engineer']);
    expect(getAllJobs()[0].note).toMatch(/Found in Companies/);
    expect(within(roles).getByRole('button', { name: 'Saved Design Engineer' })).toBeDisabled();
    const notice = (await screen.findByText('Saved to Pipeline · To apply')).closest(
      '[role="status"]',
    ) as HTMLElement;
    await userEvent.click(within(notice).getByRole('button', { name: 'Undo' }));
    expect(getAllJobs()).toEqual([]);
    expect(within(roles).getByRole('button', { name: 'Save Design Engineer' })).toBeEnabled();
  });

  it('a starred dream company stays on top and Check lists what is new since last time', async () => {
    renderApp();
    await find();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Star Acme Design as a dream company' }),
    );
    expect(readDreams(cat).map((d) => d.company)).toEqual(['Acme Design']);
    const dreams = screen.getByRole('list', { name: 'Dream companies' });
    expect(dreams).toHaveTextContent('Not checked yet');

    await userEvent.click(screen.getByRole('button', { name: 'Check dream companies' }));
    expect(await screen.findByText('1 new opening since the last check.')).toBeVisible();
    expect(within(dreams).getByText('New')).toBeVisible();

    acmeJobs.push(leverJob('3', 'Design Systems Lead'));
    try {
      await userEvent.click(screen.getByRole('button', { name: 'Check dream companies' }));
      expect(await screen.findByText('1 new opening since the last check.')).toBeVisible();
      await within(dreams).findByText('2 matching roles · 1 new');
    } finally {
      acmeJobs.pop();
    }
    expect(readDreams(cat)[0].seen).toEqual(['lever:acme:1', 'lever:acme:3']);

    // It survives a reload with no search run, and unstarring removes it.
    cleanup();
    renderApp();
    const again = await screen.findByRole('list', { name: 'Dream companies' });
    expect(again).toHaveTextContent('Acme Design');
    await userEvent.click(within(again).getByRole('button', { name: 'Unstar Acme Design' }));
    expect(readDreams(cat)).toEqual([]);
  });

  it('Save as target persists across a reload and shows under Saved', async () => {
    renderApp();
    await find();
    await screen.findByText(/3 teams found/);
    await userEvent.click(screen.getByRole('switch', { name: 'Hiring now' }));
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
    await screen.findByText(/3 teams found · 1 hiring now/);
    await userEvent.click(await screen.findByRole('button', { name: /Show \d+ matching roles?/ }));
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
