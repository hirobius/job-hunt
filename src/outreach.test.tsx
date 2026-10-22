// Discover → Teams (slug `teams`; docs/specs/discovery-methods.md, method 3): design-system
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

const gh = { limited: false, retryAfter: '' };
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
      return gh.retryAfter
        ? json({}, 429, { 'retry-after': gh.retryAfter })
        : json({}, 403, {
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
  // A non-design track's suggestions (#215): the YC hiring list and one YC company's board.
  if (url === 'https://yc-oss.github.io/api/companies/hiring.json')
    return json([
      {
        name: 'Onboardly',
        slug: 'onboardly',
        website: 'https://onboardly.example',
        one_liner: 'Implementation consultants on demand',
        status: 'Active',
      },
      { name: 'Shoebox', slug: 'shoebox', one_liner: 'Sells shoes', status: 'Active' },
    ]);
  if (url === 'https://api.lever.co/v0/postings/onboardly?mode=json')
    return json([
      {
        ...leverJob('7', 'Implementation Consultant'),
        hostedUrl: 'https://jobs.lever.co/onboardly/7',
      },
    ]);
  return json({}, 404);
});

let cat: string;
beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  gh.limited = false;
  gh.retryAfter = '';
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

/** Hiring now | All: two toggle chips (rev-3 mock), not a switch. */
const showAll = () => userEvent.click(screen.getByRole('button', { name: /^All/ }));
/** A company row's Roles button opens its roles (and actions) in place. */
const openRoles = async (company: string) => {
  const b = await screen.findByRole('button', { name: `Roles at ${company}` });
  if (b.getAttribute('aria-expanded') !== 'true') await userEvent.click(b);
};

const find = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Find design-system teams' }));
  return screen.findByRole('list', { name: 'Companies' });
};

describe('Teams (design-system teams)', () => {
  it('is the Watched tool in the Discover row', async () => {
    renderApp();
    const tools = await screen.findByRole('radiogroup', { name: 'Search tool' });
    expect(within(tools).getByRole('radio', { name: 'Watched' })).toBeChecked();
  });

  it('open roles first: Hiring now puts boards not found below, collapsed; keeps the unchecked', async () => {
    renderApp();
    const list = await find();
    await screen.findByText(/3 companies, 1 hiring now\./);
    await within(list).findByText('Lever · 1 matching role');
    const names = () =>
      within(screen.getByRole('list', { name: 'Companies' }))
        .getAllByText(/^(Acme Design|Flaky|Quiet Co)( \(opens in new tab\))?$/)
        .map((n) => n.textContent?.replace(' (opens in new tab)', ''));
    expect(names()).toEqual(['Acme Design', 'Flaky']);
    expect(list).toHaveTextContent("Couldn't check");
    // Not employers: the community group and the awesome-* list are left out.
    expect(screen.queryByText(/Design Tokens Community Group|voltagent/)).toBeNull();
    // Board not found is unknown, not "none": below, collapsed.
    await userEvent.click(screen.getByRole('button', { name: 'Board not found (1)' }));
    expect(screen.getByRole('list', { name: 'Board not found' })).toHaveTextContent('Quiet Co');

    expect(screen.getByRole('button', { name: 'All' })).toBeVisible();
    await showAll();
    expect(names()).toEqual(['Acme Design', 'Flaky', 'Quiet Co']);
    await openRoles('Quiet Co');
    const rows = within(screen.getByRole('list', { name: 'Companies' })).getAllByRole('listitem');
    const quiet = rows.find((r) => r.textContent?.includes('Quiet Co'))!;
    expect(quiet).toHaveTextContent('Board not found');
    // An organisation without a board still gets a careers search, not a dead end.
    expect(within(quiet).getByRole('link', { name: 'Search careers for Quiet Co' })).toBeVisible();
    expect(within(rows[0]).getByRole('link', { name: /^Acme Design/ })).toHaveAttribute(
      'href',
      'https://acme.example.com',
    );
  });

  it('each row is one line with a Roles button; one row opens at a time', async () => {
    renderApp();
    await find();
    await screen.findByText('Lever · 1 matching role');
    expect(screen.queryByRole('list', { name: 'Open roles at Acme Design' })).toBeNull();
    await openRoles('Acme Design');
    expect(screen.getByRole('button', { name: 'Roles at Acme Design' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('list', { name: 'Open roles at Acme Design' })).toBeVisible();
    await openRoles('Flaky');
    expect(screen.queryByRole('list', { name: 'Open roles at Acme Design' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Roles at Acme Design' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('saves a matching role to the Pipeline in one tap; the shared save notice offers Undo', async () => {
    renderApp();
    await find();
    await openRoles('Acme Design');
    const roles = await screen.findByRole('list', { name: 'Open roles at Acme Design' });
    expect(within(roles).queryByText('Sales Lead')).toBeNull();
    await userEvent.click(within(roles).getByRole('button', { name: 'Save Design Engineer' }));
    expect(getAllJobs().map((j) => j.label)).toEqual(['Design Engineer']);
    expect(getAllJobs()[0].note).toMatch(/Found in Teams/);
    expect(within(roles).getByRole('button', { name: 'Saved Design Engineer' })).toBeDisabled();
    // The notice is an HDS Toast: one list item in the Notifications region.
    const notice = (await screen.findByText('Saved to Pipeline · To apply')).closest(
      'li',
    ) as HTMLElement;
    await userEvent.click(within(notice).getByRole('button', { name: 'Undo' }));
    expect(getAllJobs()).toEqual([]);
    expect(within(roles).getByRole('button', { name: 'Save Design Engineer' })).toBeEnabled();
  });

  it('a starred dream company stays on top and Check lists what is new since last time', async () => {
    renderApp();
    await find();
    const star = await screen.findByRole('button', {
      name: 'Star Acme Design as a dream company',
      pressed: false,
    });
    await screen.findByText('Lever · 1 matching role');
    await userEvent.click(star);
    expect(readDreams(cat).map((d) => d.company)).toEqual(['Acme Design']);
    // The star fills in place and says it is on; it never turns into a bordered button.
    const on = screen.getAllByRole('button', {
      name: 'Star Acme Design as a dream company',
      pressed: true,
    });
    expect(on.length).toBeGreaterThan(0);
    expect(on[0].querySelector('svg')).toHaveClass('rjb-icon-filled');
    const dreams = screen.getByRole('list', { name: 'Dream companies' });
    expect(screen.getByRole('region', { name: 'Dream companies' })).toHaveTextContent(
      /^Dream companies1/,
    );
    // Its board was already read by the list below: the count, not "Not checked yet".
    expect(dreams).toHaveTextContent('Lever · 1 matching role');

    await userEvent.click(screen.getByRole('button', { name: 'Check dream companies' }));
    expect(await screen.findByText('1 new opening since the last check.')).toBeVisible();
    expect(within(dreams).getByText('New')).toBeVisible();

    acmeJobs.push(leverJob('3', 'Design Systems Lead'));
    try {
      await userEvent.click(screen.getByRole('button', { name: 'Check dream companies' }));
      expect(await screen.findByText('1 new opening since the last check.')).toBeVisible();
      await within(dreams).findByText('Lever · 2 matching roles · 1 new');
    } finally {
      acmeJobs.pop();
    }
    expect(readDreams(cat)[0].seen).toEqual(['lever:acme:1', 'lever:acme:3']);

    // It survives a reload with no search run, and unstarring removes it.
    cleanup();
    renderApp();
    const again = await screen.findByRole('list', { name: 'Dream companies' });
    expect(again).toHaveTextContent('Acme Design');
    await userEvent.click(
      within(again).getByRole('button', {
        name: 'Star Acme Design as a dream company',
        pressed: true,
      }),
    );
    expect(readDreams(cat)).toEqual([]);
  });

  it('Save as target persists across a reload and shows under Saved', async () => {
    renderApp();
    await find();
    await screen.findByText(/3 companies/);
    await showAll();
    await openRoles('Quiet Co');
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
    await openRoles('Acme Design');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Watch board for Acme Design' }),
    );
    await waitFor(() =>
      expect(getCurationState().tiles.map((t) => t.url)).toContain('https://jobs.lever.co/acme'),
    );
    expect(screen.getByRole('button', { name: 'Watching Acme Design' })).toBeDisabled();
  });

  it('a GitHub rate limit is a quiet note, not a warning; an early click repeats the time', async () => {
    gh.limited = true;
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Find design-system teams' }));
    expect(
      await screen.findByText(
        /^GitHub's free search is busy\. Showing what we found; more after .+\.$/,
      ),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    // Our own budget now holds back the next try without calling GitHub again.
    const before = fakeFetch.mock.calls.length;
    gh.limited = false;
    await userEvent.click(
      await screen.findByRole('button', { name: /Find .*design-system teams/ }),
    );
    expect(
      await screen.findByText(/^Still busy\. We'll carry on by ourselves after .+\.$/),
    ).toBeVisible();
    expect(fakeFetch.mock.calls.length).toBe(before);
    expect(localStorage.getItem(GH_BUDGET_KEY)).toContain('blockedUntil');
  });

  it('picks up again on its own once the wait is over, keeping what it found', async () => {
    gh.limited = true;
    gh.retryAfter = '1';
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Find design-system teams' }));
    await screen.findByText(/GitHub's free search is busy/);
    gh.limited = false;
    // No click: the page resumes once the wait has passed.
    expect(
      await screen.findByRole('list', { name: 'Companies' }, { timeout: 5000 }),
    ).toHaveTextContent('Acme Design');
    expect(screen.queryByText(/GitHub's free search is busy/)).toBeNull();
  }, 10_000);

  it('Refine offers "Skip small teams" in plain words, on by default', async () => {
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Refine' }));
    expect(screen.queryByLabelText(/Minimum stars/)).toBeNull();
    expect(
      screen.getByRole('checkbox', { name: 'Skip small teams (fewer than 20 GitHub stars)' }),
    ).toBeChecked();
  });

  it('has no WCAG A/AA violations', async () => {
    const { container } = renderApp();
    await find();
    await screen.findByText(/3 companies, 1 hiring now/);
    await openRoles('Acme Design');
    await screen.findByRole('list', { name: 'Open roles at Acme Design' });
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});

describe('a non-design track (#215)', () => {
  beforeEach(() => {
    replaceCurationState(EMPTY_CURATION);
    cat = addCategory({
      label: 'Implementation Consulting',
      titles: ['Implementation consultant'],
      atsRoles: [],
    });
    window.location.hash = '#/discover/teams';
  });

  it('shows no GitHub search, says its source in one line and suggests matching companies', async () => {
    renderApp();
    await screen.findByText(
      'Suggestions come from the Implementation Consulting starter list and YC companies hiring now. GitHub search only finds design-system and ServiceNow teams.',
    );
    expect(screen.queryByRole('button', { name: /design-system teams/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Suggest companies' }));
    const list = await screen.findByRole('list', { name: 'Companies' });
    // The YC companies are probed for a board (the probe's polite pace), then read.
    await within(list).findByText('Lever · 1 matching role', undefined, { timeout: 10_000 });
    expect(within(list).getByRole('link', { name: /^Onboardly/ })).toHaveAttribute(
      'href',
      'https://onboardly.example',
    );
    // The YC company that doesn't match the track's titles is never suggested.
    expect(screen.queryByText(/Shoebox/)).toBeNull();
    await openRoles('Onboardly');
    expect(
      within(await screen.findByRole('list', { name: 'Open roles at Onboardly' })).getByText(
        'Implementation Consultant',
      ),
    ).toBeVisible();
    // Never a design-system organisation, never a GitHub call.
    expect(screen.queryByText(/Acme Design/)).toBeNull();
    expect(fakeFetch.mock.calls.some(([u]) => String(u).includes('api.github.com'))).toBe(false);
  });

  it('a design-systems track still searches GitHub', async () => {
    addCategory({ label: 'Design systems', titles: ['Design engineer'], atsRoles: ['design'] });
    localStorage.setItem('rjb_active_category', getCurationState().categories[1].id);
    renderApp();
    expect(await screen.findByRole('button', { name: 'Find design-system teams' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Suggest companies' })).toBeNull();
  });
});
