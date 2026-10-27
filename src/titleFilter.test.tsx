// The title filter (#223), pinned at the route seam: the Titles tool is gone; each track keeps one
// ticked list of titles (src/feed/sweepTitles.ts, synced) that Live postings, the ATS tool and the
// big-board links all read. It is edited in Live postings' Calibrate control.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});
const feed = vi.hoisted(() => ({ fetchFeed: vi.fn() }));
vi.mock('./feed/fetchFeed', () => feed);

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { writeShowEngineering } from './feed/roleTypePref';
import { addCategory, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { getAllSweeps, setTitleOn } from './feed/sweepTitles';
import type { Posting } from './feed/types';

const post = (id: string, title: string): Posting => ({
  id,
  source: 'ashby',
  title,
  company: `Co ${id}`,
  url: `https://jobs.ashbyhq.com/co/${id}`,
  location: '',
  text: 'Work on the design system.',
});
const POSTINGS = [post('1', 'Design Engineer'), post('2', 'Product Designer')];
const TITLES = ['product designer', 'design system', 'design engineer'];

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
  localStorage.clear();
  feed.fetchFeed.mockReset().mockResolvedValue({ postings: POSTINGS, sources: [] });
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Design work', titles: TITLES, atsRoles: ['design system'] });
  // These pin the title filter, not role types: keep the engineering-heavy roles in the list.
  writeShowEngineering(cat, true);
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

const hrefs = () =>
  screen
    .getAllByRole('link', { name: /search/i })
    .map((a) => decodeURIComponent((a.getAttribute('href') ?? '').replace(/\+/g, ' ')));

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

describe('the Titles tool is gone', () => {
  it('is not in the tools row', async () => {
    window.location.hash = '#/discover/ats';
    renderApp();
    const tools = await screen.findByRole('radiogroup', { name: 'Search tool' });
    expect(within(tools).queryByRole('radio', { name: /Titles|Title search/ })).toBeNull();
  });

  it('#/discover/titles lands on Live postings with Calibrate open on the titles', async () => {
    window.location.hash = '#/discover/titles';
    renderApp();
    expect(await screen.findByRole('list', { name: 'Titles' })).toBeVisible();
    expect(window.location.hash).toBe('#/discover/live');
    expect(screen.getByRole('checkbox', { name: 'design engineer' })).toBeChecked();
  });
});

describe('Calibrate: the ticked titles', () => {
  it('unticking a title is saved for the track and hides postings titled only by it', async () => {
    window.location.hash = '#/discover/live';
    const user = userEvent.setup();
    renderApp();
    expect(await screen.findByRole('heading', { name: /^Design Engineer/ })).toBeVisible();
    const list = screen.getByRole('list', { name: 'Live postings' });
    await user.click(screen.getByRole('button', { name: /^Calibrate/ }));
    await user.click(screen.getByRole('checkbox', { name: 'design engineer' }));
    expect(getAllSweeps()[cat].off).toEqual(['design engineer']);
    expect(within(list).queryByRole('heading', { name: /^Design Engineer/ })).toBeNull();
    expect(within(list).getByRole('heading', { name: /^Product Designer/ })).toBeVisible();
    expect(screen.getByText(/1 hidden by titles/)).toBeInTheDocument();
  });

  it('the ATS tool and the big-board links search only the ticked titles', async () => {
    setTitleOn(cat, TITLES, 'design engineer', false);
    window.location.hash = '#/discover/ats';
    renderApp();
    await openAllBoards();
    const all = hrefs();
    expect(all.length).toBeGreaterThan(0);
    const isRR = (u: string) => u.startsWith('https://www.remoterocketship.com/');
    for (const u of all.filter((x) => x.includes('designer') && !isRR(x))) {
      expect(u).toContain('"product designer" OR "design system"');
      expect(u).not.toContain('design engineer');
    }
    // Every generated board and ATS link carries the ticked titles; Remote Rocketship's title
    // filter takes one title, so it carries the first ticked one.
    const rr = all.filter(isRR);
    expect(rr).toEqual([
      'https://www.remoterocketship.com/?sort=DateAdded&jobTitle=product designer',
    ]);
    const rest = all.filter((u) => !rr.includes(u));
    expect(rest.filter((u) => u.includes('"product designer" OR "design system"')).length).toBe(
      rest.filter((u) => u.includes('designer')).length,
    );
  });

  it('with every title ticked, the links search all of them', async () => {
    window.location.hash = '#/discover/ats';
    renderApp();
    await openAllBoards();
    expect(
      hrefs().some((u) =>
        u.includes('("product designer" OR "design system" OR "design engineer")'),
      ),
    ).toBe(true);
  });

  it('a picked title that is then unticked is not searched: the first ticked one is (audit)', async () => {
    window.location.hash = '#/discover/ats';
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'design engineer' }));
    act(() => {
      setTitleOn(cat, TITLES, 'design engineer', false);
    });
    await openAllBoards();
    const all = hrefs();
    expect(all.some((u) => u.includes('design engineer'))).toBe(false);
    expect(all.some((u) => u.includes('"product designer"'))).toBe(true);
    expect(screen.getByRole('button', { name: 'product designer', pressed: true })).toBeVisible();
  });
});
