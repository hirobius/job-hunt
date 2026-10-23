// Companies as one tool (#237, Calm list 3/7), pinned at the route seam: App at #/discover/*, with a
// stubbed `fetch` standing in for the ATS board APIs. Watched companies and GitHub teams are one list
// of company rows with their open roles inline; one "Add a company" action replaces the Boards and
// Teams entry points; Live postings and the list checker stay reachable as secondary views; every old
// #/discover/* slug still lands somewhere.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

import { createFakeSupabase } from './test/fakeSupabase';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import {
  addCategory,
  addGroup,
  addTile,
  getCurationState,
  replaceCurationState,
} from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { readDreams, starDream } from './feed/dreams';
import { readTargets, saveTarget } from './feed/targets';
import { dismissNotice } from './saveNotice';
import { setMustInclude } from './feed/mustInclude';
import { getAllJobs, removeJob } from './store';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

const leverJob = (slug: string, id: string, text: string) => ({
  id,
  text,
  hostedUrl: `https://jobs.lever.co/${slug}/${id}`,
  categories: { location: 'Remote' },
});
/** Board APIs by URL: northwind (Lever) has a welding role, figma (Greenhouse) a board; the rest 404. */
const LIVE: Record<string, unknown> = {
  'https://api.lever.co/v0/postings/northwind?mode=json': [
    leverJob('northwind', 'n1', 'Senior Welder'),
    leverJob('northwind', 'n2', 'Accountant'),
  ],
  'https://boards-api.greenhouse.io/v1/boards/figma/jobs': { jobs: [] },
  'https://api.lever.co/v0/postings/systemsco?mode=json': [
    { ...leverJob('systemsco', 's1', 'Welder'), descriptionPlain: 'Weld our cooling systems.' },
    { ...leverJob('systemsco', 's2', 'Welder II'), descriptionPlain: 'A great ecosystem.' },
    leverJob('systemsco', 's3', 'Welder, Systems Lead'),
  ],
  // Chime's roles say "design system" only in their description (Adrian 2026-10-23).
  'https://api.lever.co/v0/postings/chime?mode=json': [
    'Product Manager, App Experience and Platform',
    'Director Engineering',
    'Principal Product Designer, Lending',
    'Tech Lead Manager, Data Integration Platform',
  ].map((t, i) => ({
    ...leverJob('chime', `c${i}`, t),
    descriptionPlain: 'Welder friendly. Work with our design system team.',
  })),
  'https://api.lever.co/v0/postings/dsco?mode=json': [
    { ...leverJob('dsco', 'd1', 'Senior Design Systems Engineer'), descriptionPlain: 'Welder.' },
  ],
  'https://api.lever.co/v0/postings/eastgate?mode=json': [1, 2, 3, 4].map((n) =>
    leverJob('eastgate', `e${n}`, `Welder ${n}`),
  ),
};
const fakeFetch = vi.fn(async (url: string) => {
  const hit = Object.keys(LIVE).find((k) => url.startsWith(k));
  if (hit) return new Response(JSON.stringify(LIVE[hit]), { status: 200 });
  return new Response('{}', { status: 404 });
});

let cat: string;
const watch = (url: string) => {
  const g =
    getCurationState().groups.find((x) => x.label === 'Watched companies')?.id ??
    addGroup(cat, { label: 'Watched companies' });
  addTile(g, { name: 'Board', url, meta: '' });
};
const watchedUrls = () => getCurationState().tiles.map((t) => t.url);
const tools = () => screen.findByRole('radiogroup', { name: 'Search tool' });

beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  fakeFetch.mockClear();
  vi.stubGlobal('fetch', fakeFetch);
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Welding', titles: ['Welder'], atsRoles: ['welder'] });
  addGroup(cat, { label: 'First picks' });
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/discover';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  dismissNotice();
});

describe('Companies as one tool (#237)', () => {
  it('the tool row is Companies, Apply now and ATS: Live postings and Boards are not tools', async () => {
    watch('https://jobs.lever.co/northwind');
    renderApp();
    const row = await tools();
    expect(
      within(row)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Watched', 'Apply now', 'ATS search']);
  });

  it('a track that watches a company opens on its company rows, open roles inline, saved in one tap', async () => {
    watch('https://jobs.lever.co/northwind');
    renderApp();
    expect(within(await tools()).getByRole('radio', { name: 'Watched' })).toBeChecked();
    const list = await screen.findByRole('list', { name: 'Companies' });
    expect(within(list).getByText('Northwind')).toBeVisible();
    expect(await within(list).findByText('Lever · 1 matching role')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Roles at Northwind' }));
    const roles = await screen.findByRole('list', { name: 'Open roles at Northwind' });
    expect(within(roles).getByText('Senior Welder')).toBeVisible();
    // The role's title is its posting link, in a new tab (Adrian 2026-10-22).
    const posting = within(roles).getByRole('link', { name: /^Senior Welder/ });
    expect(posting).toHaveAttribute('href', 'https://jobs.lever.co/northwind/n1');
    expect(posting).toHaveAttribute('target', '_blank');
    expect(within(roles).queryByText('Accountant')).toBeNull();
    // A watched row is already watched: no disabled Watching button as noise (PR #257 review).
    expect(within(list).queryByRole('button', { name: /Watch/ })).toBeNull();
    await userEvent.click(within(roles).getByRole('button', { name: 'Save Senior Welder' }));
    await waitFor(() =>
      expect(getAllJobs().map((j) => j.url)).toContain('https://jobs.lever.co/northwind/n1'),
    );
  });

  it('one Watched panel: count badge, caption, Hiring now | All; All counts what Hiring now hides', async () => {
    watch('https://jobs.lever.co/northwind');
    watch('https://boards.greenhouse.io/figma');
    renderApp();
    const panel = await screen.findByRole('region', { name: 'Watched' });
    expect(within(panel).getByRole('heading', { name: 'Watched' })).toBeVisible();
    expect(
      await within(panel).findByText(
        '2 companies, 1 hiring now. Open roles that match this track show first.',
      ),
    ).toBeVisible();
    expect(within(panel).getByRole('button', { name: 'Add a company' })).toBeVisible();
    const list = within(panel).getByRole('list', { name: 'Companies' });
    expect(within(list).queryByText('Figma')).toBeNull();
    // Two chips (rev-3 mock s-companies-teams): Hiring now pressed, All not.
    const show = within(panel).getByRole('group', { name: 'Show companies' });
    expect(within(show).getByRole('button', { name: 'Hiring now' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const all = within(show).getByRole('button', { name: 'All (1 more)' });
    expect(all).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(all);
    expect(within(show).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(list).getByText('Greenhouse · no matching roles')).toBeVisible();
    await userEvent.click(within(panel).getByRole('button', { name: 'Roles at Figma' }));
    expect(within(list).getByText('No open role matches this track right now.')).toBeVisible();
  });

  it('must include (systems only): roles that never say systems are not counted, listed or hiring', async () => {
    setMustInclude(cat, { terms: ['systems'] });
    watch('https://jobs.lever.co/systemsco');
    watch('https://jobs.lever.co/eastgate');
    renderApp();
    const panel = await screen.findByRole('region', { name: 'Watched' });
    const list = within(panel).getByRole('list', { name: 'Companies' });
    expect(await within(list).findByText('Lever · 2 matching roles')).toBeVisible();
    // Eastgate's four welders never say systems: it is not hiring for this track.
    await waitFor(() => expect(within(list).queryByText('Eastgate')).toBeNull());
    expect(within(panel).getByText(/1 hiring now/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Roles at Systemsco' }));
    const roles = await screen.findByRole('list', { name: 'Open roles at Systemsco' });
    expect(within(roles).getByText('Welder')).toBeVisible();
    expect(within(roles).getByText('Welder, Systems Lead')).toBeVisible();
    expect(within(roles).queryByText('Welder II')).toBeNull(); // "ecosystem" is not "systems"
  });

  it('design system in the title only: Chime (only its descriptions say it) is not hiring', async () => {
    setMustInclude(cat, { terms: ['design system'], inText: false });
    watch('https://jobs.lever.co/chime');
    watch('https://jobs.lever.co/dsco');
    renderApp();
    const panel = await screen.findByRole('region', { name: 'Watched' });
    const list = within(panel).getByRole('list', { name: 'Companies' });
    expect(await within(list).findByText('Lever · 1 matching role')).toBeVisible();
    await waitFor(() => expect(within(list).queryByText('Chime')).toBeNull());
    expect(within(panel).getByText(/1 hiring now/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Roles at Dsco' }));
    const roles = await screen.findByRole('list', { name: 'Open roles at Dsco' });
    expect(within(roles).getByText('Senior Design Systems Engineer')).toBeVisible(); // Descriptions on: the loaded roles re-filter at once, with no new read.
    const reads = fakeFetch.mock.calls.length;
    act(() => setMustInclude(cat, { inText: true }));
    expect(within(list).getByText('Chime')).toBeVisible();
    expect(within(list).getByText('Lever · 4 matching roles')).toBeVisible();
    expect(fakeFetch.mock.calls.length).toBe(reads);
  });

  it('starred companies and the one-button check sit on the Companies home', async () => {
    starDream(cat, {
      company: 'Northwind',
      board: { kind: 'lever', slug: 'northwind' },
    });
    renderApp();
    expect(within(await tools()).getByRole('radio', { name: 'Watched' })).toBeChecked();
    expect(await screen.findByRole('list', { name: 'Dream companies' })).toHaveTextContent(
      'Northwind',
    );
    expect(screen.getByRole('button', { name: 'Check dream companies' })).toBeVisible();
  });

  it('no saved outreach target: no Outreach targets section between the panels', async () => {
    watch('https://jobs.lever.co/northwind');
    renderApp();
    await screen.findByRole('region', { name: 'Watched' });
    expect(screen.queryByRole('region', { name: 'Outreach targets' })).toBeNull();
    expect(screen.queryByText('Outreach targets')).toBeNull();
  });

  it('a saved outreach target shows in a panel like Watched', async () => {
    saveTarget(cat, { login: 'quiet', company: 'Quiet Co', repo: 'quiet/tokens' });
    window.location.hash = '#/discover/teams';
    renderApp();
    const panel = await screen.findByRole('region', { name: 'Outreach targets' });
    expect(within(panel).getByRole('heading', { name: 'Outreach targets' })).toBeVisible();
    expect(within(panel).getByRole('list', { name: 'Saved targets' })).toHaveTextContent(
      'Quiet Co',
    );
  });

  it('Remove on an outreach target says so, and Undo puts it back in its place (#212)', async () => {
    saveTarget(cat, { login: 'quiet', company: 'Quiet Co', repo: 'quiet/tokens' });
    saveTarget(cat, { login: 'loud', company: 'Loud Co', repo: 'loud/tokens' });
    const before = readTargets(cat);
    window.location.hash = '#/discover/teams';
    renderApp();
    const list = await screen.findByRole('list', { name: 'Saved targets' });
    await userEvent.click(within(list).getByRole('button', { name: 'Remove Quiet Co' }));
    expect(readTargets(cat).map((t) => t.login)).toEqual(['loud']);
    expect(screen.getByText('Removed “Quiet Co”')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(readTargets(cat)).toEqual(before);
  });

  it('a track with nothing to show on Companies still opens on Apply now', async () => {
    renderApp();
    expect(within(await tools()).getByRole('radio', { name: 'Apply now' })).toBeChecked();
  });

  describe('Add a company', () => {
    const open = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Add a company' }));
      return screen.findByRole('dialog', { name: 'Add a company' });
    };

    it('a pasted board link is watched at once and shows as a company row', async () => {
      window.location.hash = '#/discover/teams';
      renderApp();
      const dialog = await open();
      await userEvent.type(
        within(dialog).getByLabelText('Company name or job-board link'),
        'https://jobs.lever.co/northwind',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
      await waitFor(() => expect(watchedUrls()).toContain('https://jobs.lever.co/northwind'));
      expect(await screen.findByRole('list', { name: 'Companies' })).toHaveTextContent('Northwind');
    });

    it('one field with a short helper line, no description; Add is the one primary', async () => {
      window.location.hash = '#/discover/teams';
      renderApp();
      const dialog = await open();
      const field = within(dialog).getByLabelText('Company name or job-board link');
      expect(field).toHaveAttribute('placeholder', 'Company or board link');
      expect(dialog).toHaveTextContent(
        'We look for its board on Greenhouse, Lever, Ashby and 5 more, or paste the board link.',
      );
      expect(dialog).not.toHaveTextContent(/Recruitee|Watched companies show/);
      expect(dialog).not.toHaveAttribute('aria-describedby', expect.stringMatching(/./));
    });

    it('a name is looked up on the systems we check, and a board found is one Watch away', async () => {
      window.location.hash = '#/discover/teams';
      renderApp();
      const dialog = await open();
      await userEvent.type(
        within(dialog).getByLabelText('Company name or job-board link'),
        'Figma',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Watch Figma' }));
      await waitFor(() => expect(watchedUrls()).toContain('https://boards.greenhouse.io/figma'));
    });

    it('a company with no public board can be starred instead', async () => {
      window.location.hash = '#/discover/teams';
      renderApp();
      const dialog = await open();
      await userEvent.type(
        within(dialog).getByLabelText('Company name or job-board link'),
        'Nobody Inc',
      );
      await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
      expect(
        await within(dialog).findByText(
          'No public board found for Nobody Inc on the systems we check. It may hire elsewhere; keep it as a target to stay on your list.',
        ),
      ).toBeVisible();
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Keep Nobody Inc as a target' }),
      );
      expect(readDreams(cat).map((d) => d.company)).toEqual(['Nobody Inc']);
      // The toast says where it went (the Dream companies panel), the same words as Find boards.
      expect(await screen.findByText('Added Nobody Inc to Dream companies')).toBeVisible();
    });
  });

  describe('old #/discover/* links still land', () => {
    it.each([
      ['live', null, 'Live postings'],
      ['boards', null, 'Check a list of companies'],
      ['teams', 'Watched', null],
      ['apply', 'Apply now', null],
      ['titles', null, 'Live postings'],
      ['ats', 'ATS search', null],
      ['nonsense', 'Apply now', null],
    ])('#/discover/%s', async (slug, radio, heading) => {
      window.location.hash = `#/discover/${slug}`;
      renderApp();
      if (radio) expect(within(await tools()).getByRole('radio', { name: radio })).toBeChecked();
      if (heading) {
        // A secondary view is the second and last nav level (rev-3 G): "Back to companies"
        // replaces the tool switch, so no segment claims a page the user isn't on.
        expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
        expect(screen.getByRole('link', { name: 'Back to companies' })).toBeVisible();
        expect(screen.queryByRole('radiogroup', { name: 'Search tool' })).toBeNull();
      }
    });

    it('a section id opens Apply now on that section', async () => {
      const g = addGroup(cat, { label: 'Union halls' });
      window.location.hash = `#/discover/${g}`;
      renderApp();
      expect(await screen.findByRole('heading', { level: 3, name: 'Union halls' })).toBeVisible();
    });

    it('shows an older synced "Apply Now" section in sentence case', async () => {
      const g = addGroup(cat, { label: 'Apply Now' });
      window.location.hash = `#/discover/${g}`;
      renderApp();
      expect(await screen.findByRole('heading', { level: 3, name: 'Apply now' })).toBeVisible();
      expect(screen.queryByText('Apply Now')).toBeNull();
    });

    it('Companies links to Live postings and the list checker as more ways to find companies', async () => {
      window.location.hash = '#/discover/teams';
      renderApp();
      // Rows in a panel (rev-3 mock): a title, a caption and an Open button each, not bare links.
      const more = await screen.findByRole('region', { name: 'More ways to find companies' });
      const rows = within(more).getAllByRole('listitem');
      expect(rows).toHaveLength(2);
      expect(within(rows[0]).getByText('Live postings from job boards')).toBeVisible();
      expect(
        within(rows[0]).getByText(/HN, Remotive, Jobicy and your watched boards/),
      ).toBeVisible();
      expect(within(rows[1]).getByText('Check a list of companies')).toBeVisible();
      expect(within(rows[1]).getByText(/Paste names or a YC batch/)).toBeVisible();
      expect(
        within(rows[1]).getByRole('link', { name: 'Open Check a list of companies' }),
      ).toHaveAttribute('href', '#/discover/boards');
      await userEvent.click(
        within(rows[0]).getByRole('link', { name: 'Open Live postings from job boards' }),
      );
      expect(window.location.hash).toBe('#/discover/live');
      expect(await screen.findByRole('heading', { name: 'Live postings' })).toBeVisible();
    });

    it('a design systems track also offers the companies with public design systems (Adele)', async () => {
      setMustInclude(cat, { terms: ['design system'] });
      window.location.hash = '#/discover/teams';
      renderApp();
      const more = await screen.findByRole('region', { name: 'More ways to find companies' });
      const rows = within(more).getAllByRole('listitem');
      expect(rows).toHaveLength(3);
      expect(
        within(rows[2]).getByRole('button', {
          name: /^Add companies with public design systems \(\d+\)$/,
        }),
      ).toBeEnabled();
      expect(within(rows[2]).getByRole('link', { name: /Adele on GitHub/ })).toBeVisible();
    });
  });
});

// Return paths (Adrian 2026-10-22): Companies comes back as it was left: All, the open row, and the
// roles already read (no second read of the same board).
describe('Companies comes back as it was left', () => {
  it('keeps All, the open row and its roles after a trip to the Pipeline and the browser Back', async () => {
    // No saved jobs, so the Pipeline's liveness check reads no board of its own.
    getAllJobs()
      .slice()
      .forEach((j) => removeJob(j.url));
    watch('https://jobs.lever.co/northwind');
    watch('https://boards.greenhouse.io/figma');
    renderApp();
    const panel = await screen.findByRole('region', { name: 'Watched' });
    const show = within(panel).getByRole('group', { name: 'Show companies' });
    await userEvent.click(await within(show).findByRole('button', { name: 'All (1 more)' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Roles at Northwind' }));
    await screen.findByRole('list', { name: 'Open roles at Northwind' });
    const reads = fakeFetch.mock.calls.length;

    window.location.hash = '#/queue';
    await screen.findByRole('heading', { level: 2, name: 'Pipeline' });
    window.history.back();
    const back = await screen.findByRole('region', { name: 'Watched' });
    expect(
      within(within(back).getByRole('group', { name: 'Show companies' })).getByRole('button', {
        name: 'All',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    const roles = within(back).getByRole('list', { name: 'Open roles at Northwind' });
    expect(within(roles).getByText('Senior Welder')).toBeVisible();
    expect(within(back).getByText('Greenhouse · no matching roles')).toBeVisible();
    expect(fakeFetch.mock.calls.slice(reads).map((c) => String(c[0]))).toEqual([]);
  });
});
