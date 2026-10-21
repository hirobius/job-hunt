// Companies → Check a list of companies (once the Find boards tool; docs/specs/discovery-methods.md,
// method 2), pinned at the route seam:
// App at #/discover/boards with a stubbed `fetch` standing in for the ATS board APIs.
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
import {
  addCategory,
  addGroup,
  addTile,
  getCurationState,
  replaceCurationState,
} from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { PROBE_KEY } from './feed/probe';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

/** ATS answers by URL: figma and plaid have boards, "flaky" gets a 503, everything else 404s. */
const LIVE: Record<string, unknown> = {
  'https://boards-api.greenhouse.io/v1/boards/figma/jobs': { jobs: [{}, {}, {}] },
  'https://api.lever.co/v0/postings/plaid?mode=json': [{}],
};
const calls: string[] = [];
const yc = { down: false };
const BATCH = [
  { name: 'Figma', status: 'Active', isHiring: true },
  { name: 'Gone Co', status: 'Acquired', isHiring: true },
  { name: 'Nobody', status: 'Active', isHiring: false },
];
const WIKI = {
  search: [
    { id: 'Q1', label: 'Quillon Media', description: 'British media company' },
    { id: 'Q2', label: 'Quill', description: 'writing implement' },
  ],
};
const suggest = { down: false };
const fakeFetch = vi.fn(async (url: string) => {
  calls.push(url);
  if (url === 'https://yc-oss.github.io/api/companies/hiring.json')
    return suggest.down
      ? new Response('{}', { status: 503 })
      : new Response(
          JSON.stringify([
            { name: 'Quillstack', website: 'https://quillstack.example', batch: 'Winter 2023' },
          ]),
          { status: 200 },
        );
  if (url.startsWith('https://www.wikidata.org/'))
    return suggest.down
      ? new Response('{}', { status: 503 })
      : new Response(JSON.stringify(WIKI), { status: 200 });
  if (url.startsWith('https://yc-oss.github.io/api/batches/'))
    return yc.down
      ? new Response('{}', { status: 404 })
      : new Response(JSON.stringify(BATCH), { status: 200 });
  const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
  if (url in LIVE) return ok(LIVE[url]);
  return new Response('{}', { status: url.includes('flaky') ? 503 : 404 });
});

let cat: string;
beforeEach(() => {
  h.fake?.reset();
  localStorage.clear();
  calls.length = 0;
  yc.down = false;
  suggest.down = false;
  fakeFetch.mockClear();
  vi.stubGlobal('fetch', fakeFetch);
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Design systems', titles: ['Design engineer'], atsRoles: ['design'] });
  window.history.replaceState(null, '', '/');
  window.location.hash = '#/discover/boards';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** "Paste a list" opens the paste box (rev-3 L keeps it as the secondary way in). */
const pasteBox = async () => {
  if (!screen.queryByRole('textbox', { name: 'Paste a list' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Paste a list' }));
  return screen.getByRole('textbox', { name: 'Paste a list' });
};
const paste = async (text: string) => {
  const box = await pasteBox();
  await userEvent.click(box);
  await userEvent.paste(text);
  await userEvent.click(screen.getByRole('button', { name: 'Find boards' }));
};
const watchedUrls = () => getCurationState().tiles.map((t) => t.url);

describe('Find boards', () => {
  it('is a secondary view of the companies list, not a tool of its own (#237)', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Check a list of companies' })).toBeVisible();
    // Two nav levels at most (rev-3 G): Back to companies, not the tool switch.
    expect(screen.queryByRole('radiogroup', { name: 'Search tool' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to companies' })).toHaveAttribute(
      'href',
      '#/discover',
    );
  });

  it('sorts a pasted list into found, not found and could not check, with a progress line', async () => {
    renderApp();
    await paste('Figma\nPlaid\nNobody\nflaky');
    expect(await screen.findByText('4 of 4 checked, 2 boards found')).toBeVisible();
    const list = screen.getByRole('list', { name: 'Boards found' });
    expect(within(list).getByText('Figma')).toBeVisible();
    expect(within(list).getByText('Greenhouse · 3 open roles')).toBeVisible();
    expect(within(list).getByText('Plaid')).toBeVisible();
    expect(within(list).getByText('Lever · 1 open role')).toBeVisible();
    // One row per company (rev-3 L): no board is a row too, not a hidden list.
    const none = screen.getByRole('list', { name: 'No board found' });
    expect(within(none).getByText('Nobody')).toBeVisible();
    expect(screen.getByText("Couldn't check (1)")).toBeVisible();
  });

  it('Watch files a tile on the track and flips the row to Watching', async () => {
    renderApp();
    await paste('Figma\nPlaid');
    await screen.findByText('2 of 2 checked, 2 boards found');
    await userEvent.click(await screen.findByRole('button', { name: 'Watch Figma' }));
    await waitFor(() => expect(watchedUrls()).toContain('https://boards.greenhouse.io/figma'));
    expect(screen.getByRole('button', { name: 'Watching Figma' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Watch Plaid' })).toBeEnabled();
  });

  it('Watch all watches every board found and leaves already-watched ones out of the results', async () => {
    const g = addGroup(cat, { label: 'Watched companies' });
    addTile(g, { name: 'Plaid jobs', url: 'https://jobs.lever.co/plaid', meta: '' });
    renderApp();
    await paste('Figma\nPlaid');
    expect(await screen.findByText('Already watching: Plaid.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Watch Plaid' })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Watch Figma' }));
    expect(watchedUrls().filter((u) => u.includes('figma'))).toHaveLength(1);
  });

  it('Retry unknown re-asks only the companies that could not be checked', async () => {
    renderApp();
    await paste('Figma\nflaky');
    await userEvent.click(await screen.findByText("Couldn't check (1)"));
    const before = calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Retry unknown' }));
    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
    expect(calls.slice(before).every((u) => u.includes('flaky'))).toBe(true);
    expect(await screen.findByText(/2 of 2 checked, 1 board found/)).toBeVisible();
  });

  it('Cancel stops asking and keeps what was found', async () => {
    renderApp();
    const many = Array.from({ length: 40 }, (_, i) => `company${i}`).join('\n');
    await paste(`Figma\n${many}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await screen.findByRole('button', { name: 'Find boards' });
    const after = calls.length;
    await new Promise((r) => setTimeout(r, 400));
    expect(calls.length).toBe(after);
    expect(calls.length).toBeLessThan(41 * 5);
  });

  it('skips the network for companies it has already checked', async () => {
    renderApp();
    await paste('Figma');
    await screen.findByText('1 of 1 checked, 1 board found');
    expect(JSON.parse(localStorage.getItem(PROBE_KEY) ?? '{}')['greenhouse:figma']).toBeTruthy();
    cleanup();
    calls.length = 0;
    renderApp();
    await paste('Figma');
    await screen.findByText('1 of 1 checked, 1 board found');
    expect(calls).toHaveLength(0);
  });

  it('notes lines it will skip and a list over 500', async () => {
    renderApp();
    const box = await pasteBox();
    await userEvent.click(box);
    await userEvent.paste('Acme\n!!!');
    expect(await screen.findByText(/1 line is not a company name/)).toBeVisible();
  });

  describe('YC batches', () => {
    const box = () => screen.findByRole('textbox', { name: 'Paste a list' });
    const openYc = async () =>
      userEvent.click(await screen.findByRole('button', { name: 'Load a YC batch' }));

    it('offers the last four batches and loads the active companies into the box', async () => {
      renderApp();
      await openYc();
      await userEvent.click(await screen.findByRole('combobox', { name: /^YC batch/ }));
      expect(await screen.findAllByRole('option')).toHaveLength(4);
      await userEvent.keyboard('{Escape}');
      await userEvent.click(screen.getByRole('button', { name: 'Load batch' }));
      await waitFor(async () => expect(await box()).toHaveValue('Figma\nNobody'));
      expect(screen.getByText(/Loaded 2 active companies/)).toBeVisible();
      expect(screen.getByText(/YC directory \(community mirror\)/)).toBeVisible();
      // Those lines feed the probe.
      await userEvent.click(screen.getByRole('button', { name: 'Find boards' }));
      expect(await screen.findByText('2 of 2 checked, 1 board found')).toBeVisible();
    });

    it('can keep only companies that are hiring', async () => {
      renderApp();
      await openYc();
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Only companies hiring' }));
      await userEvent.click(screen.getByRole('button', { name: 'Load batch' }));
      await waitFor(async () => expect(await box()).toHaveValue('Figma'));
    });

    it('says so plainly when the mirror is down, and the paste box still works', async () => {
      yc.down = true;
      renderApp();
      // The shared fetcher caches an hour; an earlier test loaded the newest batch, so use another.
      await openYc();
      await userEvent.click(await screen.findByRole('combobox', { name: /^YC batch/ }));
      await userEvent.click((await screen.findAllByRole('option'))[3]);
      await userEvent.click(screen.getByRole('button', { name: 'Load batch' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /YC directory \(community mirror\) didn't answer/,
      );
      await paste('Figma');
      expect(await screen.findByText('1 of 1 checked, 1 board found')).toBeVisible();
    });
  });

  describe('company type-ahead (rev-3 L)', () => {
    const field = () => screen.findByRole('combobox', { name: 'Companies' });

    it('suggests your own companies, YC and Wikidata as you type; a pick becomes a chip', async () => {
      const g = addGroup(cat, { label: 'Watched companies' });
      addTile(g, {
        name: 'Quillfeather Labs',
        url: 'https://jobs.ashbyhq.com/quillfeather',
        meta: '',
      });
      renderApp();
      await userEvent.type(await field(), 'quill');
      const mine = await screen.findByRole('option', {
        name: 'Quillfeather Labs · In your tracks, Ashby board',
      });
      expect(
        await screen.findByRole('option', {
          name: 'Quillstack · YC Winter 2023, quillstack.example',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('option', { name: 'Quillon Media · Wikidata, British media company' }),
      ).toBeInTheDocument();
      // Wikidata hits that are not companies stay out.
      expect(screen.queryByRole('option', { name: /writing implement/ })).toBeNull();
      // Your own companies come first.
      expect(screen.getAllByRole('option')[0]).toBe(mine);
      await userEvent.click(screen.getByRole('option', { name: /^Quillstack/ }));
      expect(screen.getByRole('button', { name: 'Remove Quillstack' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Find boards' }));
      expect(await screen.findByText('1 of 1 checked, 0 boards found')).toBeVisible();
    });

    it('waits for a pause in typing, and asks Wikidata once per query', async () => {
      renderApp();
      await userEvent.type(await field(), 'quillo');
      await screen.findByRole('option', { name: /^Quillon Media/ });
      const wiki = calls.filter((u) => u.startsWith('https://www.wikidata.org/'));
      expect(wiki).toHaveLength(1);
      expect(new URL(wiki[0]).searchParams.get('search')).toBe('quillo');
    });

    it('with the suggestion sources down, Enter still adds the typed name', async () => {
      suggest.down = true;
      renderApp();
      const box = await field();
      await userEvent.type(box, 'Figma{Enter}');
      expect(screen.getByRole('button', { name: 'Remove Figma' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Find boards' }));
      expect(await screen.findByText('1 of 1 checked, 1 board found')).toBeVisible();
    });

    it('checks picked names and a pasted list together', async () => {
      renderApp();
      await userEvent.type(await field(), 'Figma{Enter}');
      await paste('Plaid');
      expect(await screen.findByText('2 of 2 checked, 2 boards found')).toBeVisible();
    });

    it('a company with no board can be kept as a target', async () => {
      renderApp();
      await paste('Nobody');
      await userEvent.click(screen.getByRole('button', { name: 'Keep Nobody as a target' }));
      await waitFor(() =>
        expect(JSON.parse(localStorage.getItem('rjb_dreams') ?? '{}')[cat]?.[0]?.company).toBe(
          'Nobody',
        ),
      );
      expect(screen.getByRole('button', { name: 'Kept Nobody as a target' })).toBeDisabled();
    });
  });

  it('has no WCAG A/AA violations', async () => {
    const { container } = renderApp();
    await paste('Figma\nNobody');
    await screen.findByRole('list', { name: 'No board found' });
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
