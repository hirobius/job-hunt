// Review new (simplify 5/9, #386): Browse by default, the Deck as a toggle, Skip hides only that
// posting, Not this company mutes the company, Save makes a Job and follows its company.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { axe } from 'vitest-axe';
import type { FeedResult } from './feed/fetchFeed';
import type { Posting } from './feed/types';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({
      upsert: async () => ({ error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));
const feed = vi.hoisted(() => ({ fetchFeed: vi.fn() }));
vi.mock('./feed/fetchFeed', async (orig) => ({
  ...(await orig<typeof import('./feed/fetchFeed')>()),
  fetchFeed: feed.fetchFeed,
}));

import { FindHeader } from './FindHeader';
import { CloudSyncContext, type CloudSyncApi } from './account/accountContext';
import ReviewView, { REVIEW_PAGE } from './ReviewView';
import { viewport } from './test/viewport';
import { resetAnswerGuard } from './answerGuard';
import NoticeHost from './NoticeHost';
import { dismissNotice } from './saveNotice';
import { getAllJobs, replaceAll } from './store';
import { saveProfile } from './profile';
import { addSources, getSources, replaceSources } from './sources';
import { SEEN_KEY, getAllDecided, postingFingerprint, unmuteCompany } from './feed/decided';
import { resetScan, runScan } from './feed/autoScan';
import { resetViewMemory } from './viewMemory';
import { getScanDetails } from './feed/scanDetails';
import { parseHnComment } from './feed/sources/hn';

const now = new Date().toISOString();
const post = (id: string, title: string, company: string, o: Partial<Posting> = {}): Posting => ({
  id,
  source: 'hn',
  title,
  company,
  url: `https://news.ycombinator.com/item?id=${id.replace(/\W/g, '')}`,
  location: 'Remote',
  mode: 'remote',
  postedAt: now,
  text: 'Own the design system.',
  ...o,
});
const result = (postings: Posting[]): FeedResult => ({
  postings,
  sources: [
    { key: 'hn', label: 'Hacker News', fetched: postings.length },
    { key: 'remotive', label: 'Remotive', fetched: 0 },
    { key: 'jobicy', label: 'Jobicy', fetched: 0, error: 'Jobicy: timed out.' },
  ],
});
const BASIC = [
  post('hn:1', 'Design Systems Designer', 'Acme'),
  post('hn:2', 'Design Systems Engineer, Web', 'Acme'),
  post('hn:3', 'Design Systems Designer', 'Beta'),
];

beforeEach(() => {
  localStorage.clear();
  resetScan();
  replaceAll([]);
  dismissNotice();
  saveProfile({ titles: ['Design Systems Designer'], mode: 'remote' });
  feed.fetchFeed.mockReset().mockResolvedValue(result(BASIC));
});
afterEach(() => {
  cleanup();
  // viewport() installs a matchMedia stub; drop it so the next test is narrow again.
  delete (window as { matchMedia?: unknown }).matchMedia;
  window.location.hash = '';
});

const renderReview = () =>
  render(
    <ToastProvider>
      <ReviewView />
      <NoticeHost />
    </ToastProvider>,
  );
/** Find as the tab renders it: the short header (#544) with its More menu over the list. */
const renderFindPage = () =>
  render(
    <CloudSyncContext.Provider value={{ user: null } as CloudSyncApi}>
      <ToastProvider>
        <ReviewView
          header={({ selected, deckPlace }) => (
            <FindHeader heading={!selected} deckPlace={deckPlace} />
          )}
        />
        <NoticeHost />
      </ToastProvider>
    </CloudSyncContext.Provider>,
  );
/** Find's two columns (#471 slice 3): the list and the selected posting, at lg. */
const renderFind = () => {
  viewport(1280);
  window.location.hash = '#/review';
  return render(
    <ToastProvider>
      <main>
        <ReviewView header={<h1>Review</h1>} />
      </main>
      <NoticeHost />
    </ToastProvider>,
  );
};
/** The selected posting's column, by its title (the page's h1). */
const detailOf = async (title: string) =>
  (await screen.findByRole('heading', { level: 1, name: title })).closest('section') as HTMLElement;
const list = () => screen.findByRole('list', { name: 'New postings' });
const titles = (ul: HTMLElement) =>
  within(ul)
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent?.replace(/\s*\(opens in new tab\)$/, '').replace(/\u2060/g, ''));

describe('Review new: no board progress on the page (Adrian 2026-11-08)', () => {
  it('never says "Read N of M boards", signed in or out', async () => {
    // A read in flight: no board has answered yet.
    feed.fetchFeed.mockReset().mockImplementation(
      (req: { onProgress?: (p: object) => void }) =>
        new Promise<FeedResult>(() => {
          req.onProgress?.({ ...result([]), boardsDone: 0, boardsTotal: 250 });
        }),
    );
    renderReview();
    await waitFor(() => expect(feed.fetchFeed).toHaveBeenCalled());
    // Past the 1 s repaint that would show progress.
    await new Promise((r) => setTimeout(r, 1500));
    expect(screen.queryByText(/^Read \d+ of \d+ boards$/)).toBeNull();
  });
});

describe('Review new: Browse', () => {
  it('shows the last read straight away after a reload, then refreshes behind it (#448)', async () => {
    const first = renderReview();
    await list();
    await waitFor(() => expect(localStorage.getItem('rjb_feed_last')).not.toBeNull());
    first.unmount();
    resetViewMemory();
    // The next read hangs: the rows on screen can only come from storage.
    let answer: (r: FeedResult) => void = () => {};
    feed.fetchFeed.mockReset().mockReturnValue(new Promise<FeedResult>((r) => (answer = r)));
    renderReview();
    expect(titles(await list())).toHaveLength(3);
    await waitFor(() => expect(feed.fetchFeed).toHaveBeenCalledTimes(1));
    await act(async () => answer(result([post('hn:9', 'Design Systems Lead', 'Delta')])));
    await waitFor(async () => expect(titles(await list())).toEqual(['Design Systems Lead']));
  });

  it('lists every undecided posting and says how many are new from how many sources', async () => {
    const { container } = renderReview();
    const ul = await list();
    expect(titles(ul)).toHaveLength(3);
    // Said to a screen reader only: no status text above Browse / Deck (Adrian 2026-11-08).
    expect(screen.getByRole('status')).toHaveTextContent('3 new today from 2 sources');
    // Sources that didn't answer are the Account menu's Scan details, not a line on the page.
    expect(screen.queryByText(/source unavailable/)).toBeNull();
    expect(getScanDetails()?.failed.map((f) => f.label)).toEqual([
      expect.stringMatching(/^Jobicy/),
    ]);
    // The posting is one tap away: below lg a compact card's title is the link out (#544).
    const beta = within(ul).getByRole('article', { name: /Designer at Beta/ });
    expect(within(beta).getByRole('link', { name: /^Design Systems Designer/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/news\.ycombinator\.com/),
    );
    expect(within(ul).queryByRole('link', { name: /^Open posting for/ })).toBeNull();
    // One read: every title (and the related one) and board in one sweep.
    expect(feed.fetchFeed).toHaveBeenCalledTimes(1);
    expect(feed.fetchFeed.mock.calls[0][0]).toMatchObject({
      terms: ['Design Systems Designer', 'Design Technologist', 'Design Engineer'],
    });
    const results = await axe(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });

  it('adds the auto-scan’s postings (#415): remote only, a posting with no place marked', async () => {
    const scanned = [
      post('hn:7', 'Design System Lead', 'Fjord', { location: 'Oslo', mode: 'onsite' }),
      post('hn:8', 'Design System Lead', 'Gamma', { location: '', mode: undefined }),
    ];
    await runScan(
      { terms: ['Design System Lead'], include: ['design system'], boardUrls: [] },
      {
        fetchJson: async () => [],
        reader: { read: async () => result(scanned) },
        now: Date.now,
        pause: () => Promise.resolve(),
        sources: { yc: false, github: false, adele: false },
      },
    );
    renderReview();
    const ul = await list();
    expect(titles(ul)).toHaveLength(4);
    expect(within(ul).getByText('Remote not stated')).toBeInTheDocument();
    expect(within(ul).queryByText('Fjord')).toBeNull();
  });

  it('Skip hides only that posting, never its company, with Undo', async () => {
    const user = userEvent.setup();
    renderReview();
    const ul = await list();
    await user.click(
      within(ul).getByRole('button', { name: 'Skip Design Systems Designer at Acme' }),
    );
    await waitFor(() => expect(titles(ul)).toHaveLength(2));
    expect(within(ul).getByText('Design Systems Engineer, Web')).toBeInTheDocument();
    expect(getAllDecided().decided).toHaveLength(1);
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(titles(ul)).toHaveLength(3));
  });

  it('Not this company hides every posting from it until unmuted', async () => {
    const user = userEvent.setup();
    renderReview();
    const ul = await list();
    // In the card's More menu (Adrian 2026-11-08).
    await user.click(
      within(ul).getByRole('button', { name: 'More actions: Design Systems Designer at Acme' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Not this company: Acme' }));
    await waitFor(() => expect(titles(ul)).toEqual(['Design Systems Designer']));
    // Unmuted from the Account menu's Companies list (companiesList.test.tsx).
    act(() => unmuteCompany('Acme'));
    await waitFor(() => expect(titles(ul)).toHaveLength(3));
  });

  it('Save makes a Job and follows the company', async () => {
    const user = userEvent.setup();
    renderReview();
    const ul = await list();
    await user.click(
      within(ul).getByRole('button', { name: 'Save Design Systems Designer at Beta' }),
    );
    await waitFor(() => expect(titles(ul)).toHaveLength(2));
    expect(getAllJobs().map((j) => j.company)).toEqual(['Beta']);
    expect(getAllDecided().followed).toEqual(['Beta']);
    // Undo takes the job and the follow back, and the posting returns.
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(titles(ul)).toHaveLength(3));
    expect(getAllJobs()).toEqual([]);
    expect(getAllDecided().followed).toEqual([]);
  });

  it('saving a posting from a followed board keeps the Sources and reads nothing again', async () => {
    replaceSources([{ kind: 'ashby', ref: 'delta', label: 'Delta', star: true }]);
    feed.fetchFeed.mockResolvedValue(
      result([
        post('ashby:delta:1', 'Design Systems Designer', 'Delta', {
          source: 'ashby',
          url: 'https://jobs.ashbyhq.com/delta/1',
        }),
      ]),
    );
    const user = userEvent.setup();
    renderReview();
    const ul = await list();
    // The starred (dream) board is read like any other board Source.
    expect(feed.fetchFeed.mock.calls[0][0].boardUrls).toEqual(['https://jobs.ashbyhq.com/delta']);
    await user.click(
      within(ul).getByRole('button', { name: 'Save Design Systems Designer at Delta' }),
    );
    await waitFor(() => expect(getAllJobs()).toHaveLength(1));
    expect(getSources()).toEqual([{ kind: 'ashby', ref: 'delta', label: 'Delta', star: true }]);
    expect(feed.fetchFeed).toHaveBeenCalledTimes(1);
  });

  it('saving a posting from a board not followed yet follows that board', async () => {
    feed.fetchFeed.mockResolvedValue(
      result([
        post('ashby:delta:1', 'Design Systems Designer', 'Delta', {
          source: 'ashby',
          url: 'https://jobs.ashbyhq.com/delta/1',
        }),
      ]),
    );
    const user = userEvent.setup();
    renderReview();
    const ul = await list();
    await user.click(
      within(ul).getByRole('button', { name: 'Save Design Systems Designer at Delta' }),
    );
    await waitFor(() =>
      expect(getSources().map((x) => [x.kind, x.ref, x.label])).toEqual([
        ['ashby', 'delta', 'Delta'],
      ]),
    );
  });

  it('sorts, filters with chips and loads more', async () => {
    const many = Array.from({ length: REVIEW_PAGE + 5 }, (_, i) =>
      post(
        `hn:${i + 10}`,
        `Design Systems Designer ${i}`,
        `Co ${String(29 - i).padStart(2, '0')}`,
        {
          postedAt: new Date(Date.now() - i * 864e5 * 3).toISOString(),
          text: i === 7 ? 'A contract role' : 'A full-time role',
        },
      ),
    );
    feed.fetchFeed.mockResolvedValue(result(many));
    const user = userEvent.setup();
    renderFindPage();
    const ul = await list();
    expect(titles(ul)).toHaveLength(REVIEW_PAGE);
    // Newest first by default.
    expect(titles(ul)[0]).toBe('Design Systems Designer 0');
    await user.click(screen.getByRole('button', { name: 'Load more (5)' }));
    expect(titles(ul)).toHaveLength(REVIEW_PAGE + 5);
    // No Sort on Find (Adrian 2026-11-13): newest first, always.
    expect(screen.queryByRole('button', { name: /^Sort/ })).toBeNull();
    // Two filters only (Adrian 2026-10-28): New (was "New today", #615) and Remote.
    expect(
      within(screen.getByRole('group', { name: 'Filter postings' }))
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['New 30', 'Remote']);
  });
});

describe('Review new: Deck', () => {
  it('List | Deck is one toggle: a press flips the view, both icons show (Adrian 2026-11-13)', async () => {
    const user = userEvent.setup();
    renderReview();
    await list();
    expect(screen.queryByRole('group', { name: 'Review view' })).toBeNull();
    const toggle = screen.getByRole('button', { name: 'View: List, switch to Deck' });
    // Drawn as the Find | Apply rail: .rjb-segs, both icons inside, the open one marked.
    expect(toggle).toHaveClass('rjb-segs', 'rjb-view-segs', 'rjb-hit-44');
    const icons = toggle.querySelectorAll('.rjb-seg-icon');
    expect(icons).toHaveLength(2);
    expect(icons[0]).toHaveAttribute('data-on');
    expect(icons[1]).not.toHaveAttribute('data-on');
    expect(toggle.textContent).toBe('');
    await user.click(toggle);
    expect(toggle).toHaveAccessibleName('View: Deck, switch to List');
    expect(icons[1]).toHaveAttribute('data-on');
    // Space and Enter flip it too.
    toggle.focus();
    await user.keyboard(' ');
    expect(toggle).toHaveAccessibleName('View: List, switch to Deck');
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAccessibleName('View: Deck, switch to List');
  });

  it('shows one card at a time; a decided card makes way for the next', async () => {
    const user = userEvent.setup();
    renderReview();
    await list();
    await user.click(screen.getByRole('button', { name: 'View: List, switch to Deck' }));
    const first = screen.getByRole('article');
    const name = first.getAttribute('aria-label');
    // Skip is in the action dock (#545), not on the card.
    await user.click(
      within(screen.getByRole('group', { name: `Actions for ${name}` })).getByRole('button', {
        name: /^Skip /,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('article')).not.toHaveAttribute('aria-label', name!),
    );
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  const deckTitle = () => screen.getByRole('article').getAttribute('aria-label');

  it('after Skip or Save in the dock, focus goes to the next card title, then Find’s h1 (#545)', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(result(BASIC.slice(0, 2)));
    render(
      <ToastProvider>
        <main>
          <ReviewView header={<h1>Review</h1>} />
        </main>
        <NoticeHost />
      </ToastProvider>,
    );
    await list();
    await user.click(screen.getByRole('button', { name: 'View: List, switch to Deck' }));
    const first = deckTitle();
    await user.click(screen.getByRole('button', { name: `Skip ${first}` }));
    // The next card's title takes focus, not the dock key or <body>.
    await waitFor(() => {
      const h = within(screen.getByRole('article')).getByRole('heading', { level: 3 });
      expect(h).toHaveFocus();
      expect(deckTitle()).not.toBe(first);
    });
    resetAnswerGuard();
    await user.click(screen.getByRole('button', { name: `Save ${deckTitle()}` }));
    // The deck is empty: Find's h1 takes focus.
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Review' })).toHaveFocus(),
    );
  });

  it('at lg, after the Deck’s last card Find’s h1 keeps focus as the list stands alone (#546)', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(result(BASIC.slice(0, 1)));
    renderFind();
    await list();
    await user.click(screen.getByRole('button', { name: 'View: List, switch to Deck' }));
    await user.click(screen.getByRole('button', { name: `Skip ${deckTitle()}` }));
    // The two columns go with the last posting: the new heading node takes the focus.
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Review' })).toHaveFocus(),
    );
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument();
    // The toggle went with the last card; focus never sat on it.
    expect(screen.queryByRole('button', { name: /^View: / })).toBeNull();
  });

  it("steps the Deck by the arrow keys; its place is Find's (#545)", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ReviewView
          header={({ deckPlace: place }) => (
            <p data-testid="caption">{place ? `${place.at + 1} of ${place.count}` : 'no place'}</p>
          )}
        />
        <NoticeHost />
      </ToastProvider>,
    );
    await list();
    expect(screen.getByTestId('caption')).toHaveTextContent('no place');
    await user.click(screen.getByRole('button', { name: 'View: List, switch to Deck' }));
    expect(screen.queryByRole('navigation', { name: 'Postings' })).toBeNull();
    expect(screen.getByTestId('caption')).toHaveTextContent('1 of 3');
    // The arrow keys on the card step it, like a swipe.
    await user.click(within(screen.getByRole('article')).getByRole('heading', { level: 3 }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('caption')).toHaveTextContent('2 of 3');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByTestId('caption')).toHaveTextContent('1 of 3');
  });

  it('a sideways swipe on the card steps the deck; a short or upright one does not (#545)', async () => {
    const user = userEvent.setup();
    renderReview();
    await list();
    await user.click(screen.getByRole('button', { name: 'View: List, switch to Deck' }));
    const first = deckTitle();
    const swipe = (dx: number, dy = 0) => {
      const el = within(screen.getByRole('article')).getByRole('heading', { level: 3 });
      const touch = (x: number, y: number) => ({ clientX: x, clientY: y }) as Touch;
      act(() => {
        el.dispatchEvent(
          Object.assign(new Event('touchstart', { bubbles: true }), {
            touches: [touch(200, 200)],
          }),
        );
        el.dispatchEvent(
          Object.assign(new Event('touchend', { bubbles: true }), {
            changedTouches: [touch(200 + dx, 200 + dy)],
          }),
        );
      });
    };
    swipe(-30);
    expect(deckTitle()).toBe(first);
    swipe(-100, 120);
    expect(deckTitle()).toBe(first);
    swipe(-100);
    expect(deckTitle()).not.toBe(first);
    swipe(100);
    expect(deckTitle()).toBe(first);
  });

  it('walks the deck newest first with no Sort; More ends the key row (2026-11-13)', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(
      result([
        post('hn:1', 'Design Systems Designer', 'Zeta', { postedAt: '2026-11-12T10:00:00Z' }),
        post('hn:2', 'Design Systems Engineer', 'Acme', { postedAt: '2026-11-11T10:00:00Z' }),
        post('hn:3', 'Design Systems Lead', 'Mono', { postedAt: '2026-11-10T10:00:00Z' }),
      ]),
    );
    render(
      <ToastProvider>
        <CloudSyncContext.Provider value={{ user: null } as CloudSyncApi}>
          <ReviewView
            header={({ deckPlace: place }) => (
              <>
                <p data-testid="caption">{place ? `${place.at + 1} of ${place.count}` : ''}</p>
                <FindHeader deckPlace={place} />
              </>
            )}
          />
        </CloudSyncContext.Provider>
        <NoticeHost />
      </ToastProvider>,
    );
    await list();
    await user.click(screen.getByRole('button', { name: 'View: List, switch to Deck' }));
    // Newest first: Zeta's posting, 1 of 3.
    expect(deckTitle()).toBe('Design Systems Designer at Zeta');
    expect(screen.getByTestId('caption')).toHaveTextContent('1 of 3');
    // The page bar's pager (2026-11-12): "‹ 1 of 3 ›", Previous off at the start.
    const pager = screen.getByRole('navigation', { name: 'Postings in the deck' });
    expect(within(pager).getByRole('button', { name: /previous/i })).toBeDisabled();
    await user.click(within(pager).getByRole('button', { name: /next/i }));
    expect(screen.getByTestId('caption')).toHaveTextContent('2 of 3');
    await user.click(within(pager).getByRole('button', { name: /previous/i }));
    expect(screen.getByTestId('caption')).toHaveTextContent('1 of 3');
    // More (Not this company) is not by the title (2026-11-13): it ends the key row, Skip | Save | More.
    expect(within(screen.getByRole('article')).queryByRole('button', { name: /^More/ })).toBeNull();
    const keys = screen.getByRole('group', { name: /^Actions for / });
    expect(
      within(keys)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Skip Design Systems Designer at Zeta',
      'Save Design Systems Designer at Zeta',
      'More actions: Design Systems Designer at Zeta',
    ]);
    await user.click(within(keys).getByRole('button', { name: /^More actions/ }));
    expect(await screen.findByRole('menuitem', { name: 'Not this company: Zeta' })).toBeTruthy();
    await user.keyboard('{Escape}');
    // No Sort on Find (2026-11-13): the deck is newest first.
    expect(screen.queryByRole('button', { name: /^Sort/ })).toBeNull();
    await user.click(within(screen.getByRole('article')).getByRole('heading', { level: 3 }));
    await user.keyboard('{ArrowRight}');
    expect(deckTitle()).toBe('Design Systems Engineer at Acme');
  });
});

describe('Review new: pay read from a Hacker News post (#547)', () => {
  // Real-shaped "Who is hiring?" comments (Algolia's HTML), synthetic companies.
  const hn = (id: string, html: string) =>
    parseHnComment({
      objectID: id,
      story_id: 1,
      parent_id: 1,
      created_at: now,
      comment_text: html,
    })!;
  const PAID = hn(
    '11',
    'Acme | Design Systems Lead | Remote (US) | $150k–$185k<p>Own the design system end to end.',
  );
  const EURO = hn(
    '12',
    'Beta | Senior Design Systems Designer | REMOTE (EU) | €95k–€120k + equity<p>Own the design system.',
  );
  const UNPAID = hn(
    '13',
    'Gamma | Design Systems Engineer | Remote<p>We raised $20M. Own the design system. 401(k).',
  );

  it("shows the pay a post states as the card's pay line, and none when it states none", async () => {
    feed.fetchFeed.mockResolvedValue(result([PAID, EURO, UNPAID]));
    renderReview();
    const ul = await list();
    // Found the way the #631 compact-card tests do: the card is an article named "<title> at <company>".
    const card = (title: string, company: string) =>
      within(ul).getByRole('article', { name: `${title} at ${company}` });
    expect(
      within(card('Design Systems Lead', 'Acme')).getByText('$150k to $185k'),
    ).toBeInTheDocument();
    expect(
      within(card('Senior Design Systems Designer', 'Beta')).getByText('€95k to €120k'),
    ).toBeInTheDocument();
    // No pay found: no pay fact on the card (never a funding or 401(k) figure).
    const none = card('Design Systems Engineer', 'Gamma');
    expect(
      within(none).queryByText(/\$|€|£|Pay not stated/, { ignore: '.rjb-clamp-2, script, style' }),
    ).toBeNull();
  });
});

describe('Review new: Deck card anatomy (#458)', () => {
  const ONE = post('hn:1', 'Design Systems Designer', 'Acme', {
    location: 'Lisbon',
    mode: 'remote',
    salaryMin: 95000,
    salaryMax: 120000,
  });
  const openDeck = async (p: Posting) => {
    feed.fetchFeed.mockResolvedValue(result([p]));
    const user = userEvent.setup();
    renderReview();
    await list();
    await user.click(screen.getByRole('button', { name: 'View: List, switch to Deck' }));
    return screen.getByRole('article');
  };
  const before = (a: Node, b: Node) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('stacks title (full width), company, meta lines, pay, the excerpt; Skip and Save in the dock (#545)', async () => {
    const card = await openDeck(ONE);
    const title = within(card).getByRole('heading', { level: 3 });
    const company = within(card).getByText('Acme');
    const place = within(card).getByText('Lisbon');
    const mode = within(card).getByText('Remote');
    const posted = within(card).getByText('Posted today');
    const pay = within(card).getByText('$95k to $120k');
    // The text shows at once (no disclosure), cut at 7 lines, then the link to the full posting.
    const text = within(card).getByText('Own the design system.');
    expect(text).toHaveClass('rjb-deck-excerpt');
    // Inline company mark, 24px before the name (2026-11-13).
    expect(card.querySelector('[data-rjb-logo]')).toHaveClass('rjb-logo-inline');
    expect(within(card).queryByRole('button', { name: /description/i })).toBeNull();
    const full = within(card).getByRole('link', { name: /Read the full posting/ });
    expect(full).toHaveAttribute('href', ONE.url);
    // More left the title's side (2026-11-13): it ends the key row under the card.
    expect(within(card).queryByRole('button', { name: /^More actions/ })).toBeNull();
    const order = [title, company, place, mode, posted, pay, text, full];
    order.slice(1).forEach((el, i) => expect(before(order[i], el)).toBe(true));
    // Save and Skip left the card for the dock: Skip (grey) first, Save (filled) on the right.
    expect(within(card).queryByRole('button', { name: /^(Save|Skip) / })).toBeNull();
    expect(within(card).queryByRole('link', { name: /^Open posting for/ })).toBeNull();
    const dock = screen.getByRole('group', {
      name: 'Actions for Design Systems Designer at Acme',
    });
    const keys = within(dock).getAllByRole('button');
    expect(keys.map((k) => k.getAttribute('aria-label'))).toEqual([
      'Skip Design Systems Designer at Acme',
      'Save Design Systems Designer at Acme',
      'More actions: Design Systems Designer at Acme',
    ]);
    expect(keys[2]).toHaveClass('rjb-deck-more');
    expect(keys[1]).toHaveAttribute('data-variant', 'primary');
    expect(keys[0]).toHaveAttribute('data-variant', 'secondary');
    // In flow under the card at every width (2026-11-13): no fixed dock on Find.
    expect(dock).toHaveClass('rjb-dock-row');
    expect(dock).not.toHaveClass('rjb-dock');
    expect(dock.parentElement).toHaveClass('rjb-deck');
    // The meta lines carry their icons (lucide marks them aria-hidden svgs).
    expect(
      card.querySelectorAll('svg.lucide-map-pin, svg.lucide-briefcase, svg.lucide-calendar'),
    ).toHaveLength(3);
  });

  it('says "Company not stated" for a posting with none, and has no More (2026-11-12)', async () => {
    const card = await openDeck(post('hn:5', 'Design Systems Designer', ''));
    expect(within(card).getByText('Company not stated')).toBeInTheDocument();
    // More would hold only Not this company: with no company there is none.
    expect(within(card).queryByRole('button', { name: /^More actions/ })).toBeNull();
  });

  it('shows no pay when the source states none, and Save still sits in the dock', async () => {
    const card = await openDeck(post('hn:1', 'Design Systems Designer', 'Acme'));
    expect(within(card).queryByText(/\$|EUR|GBP|\bk\b/)).toBeNull();
    expect(within(card).queryByText(/pay|salary/i)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Save Design Systems Designer at Acme' }),
    ).toBeInTheDocument();
  });

  it('shows no source or New badge, new or seen (#557 cuts); the kept facts stay', async () => {
    const card = await openDeck(ONE);
    expect(within(card).queryByText('Hacker News')).toBeNull();
    expect(within(card).queryByText('New')).toBeNull();
    expect(card.querySelector('[data-tone="info"]')).toBeNull();
    // Kept (#557 "Do not cut"): the pay when stated and the company.
    expect(within(card).getByText('$95k to $120k')).toBeInTheDocument();
    expect(within(card).getByText('Acme')).toBeInTheDocument();
    cleanup();
    localStorage.setItem(SEEN_KEY, JSON.stringify({ [postingFingerprint(ONE)]: '2020-01-01' }));
    resetViewMemory();
    resetScan();
    const seen = await openDeck(ONE);
    expect(within(seen).queryByText('Hacker News')).toBeNull();
    expect(within(seen).queryByText('New')).toBeNull();
  });

  it('the selected posting uses the job page’s template (#546); a decision on the last one clears it', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(result([ONE]));
    renderFind();
    const ul = await list();
    await user.click(within(ul).getByRole('link', { name: 'Design Systems Designer' }));
    const detail = await detailOf('Design Systems Designer');
    // Title block (title, company, facts, the source), one action row, then the content.
    const block = detail.querySelector('[data-rjb-title-block]') as HTMLElement;
    const keys = within(detail).getByRole('group', {
      name: 'Actions for Design Systems Designer at Acme',
    });
    const title = within(block).getByRole('heading', { level: 1 });
    const company = within(block).getByText('Acme');
    const pay = within(block).getByText('$95k to $120k');
    const source = within(block).getByText('Hacker News');
    const save = within(keys).getByRole('button', { name: 'Save Design Systems Designer at Acme' });
    const skip = within(keys).getByRole('button', { name: 'Skip Design Systems Designer at Acme' });
    const content = within(detail).getByRole('region', { name: 'Description' });
    const order = [title, company, pay, source, save, skip, content];
    order.slice(1).forEach((el, i) => expect(before(order[i], el)).toBe(true));
    expect(save).toHaveAttribute('data-variant', 'primary');
    expect(skip).toHaveAttribute('data-variant', 'secondary');
    // More (Not this company) sits beside the title block, as a job's does.
    expect(
      within(detail).getByRole('button', { name: 'More actions: Design Systems Designer at Acme' }),
    ).toBeInTheDocument();
    // No blue New badge in the title block: status there is neutral.
    expect(within(block).queryByText('New')).toBeNull();
    await user.click(save);
    // No posting left: the list alone says so (Adrian 2026-11-12), nothing beside it.
    expect(await screen.findByText('You’re all caught up')).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#/review'));
    expect(screen.queryByText('Pick a posting')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Review' })).toBeInTheDocument();
  });

  it('at lg Browse opens on the first posting, in place; the Deck keeps none (#546)', async () => {
    const user = userEvent.setup();
    renderFind();
    const ul = await list();
    const first = titles(ul)[0]!;
    expect(await screen.findByRole('heading', { level: 1, name: first })).toBeInTheDocument();
    expect(window.location.hash).toMatch(/^#\/review\/./);
    expect(within(ul).getAllByRole('article', { current: true })).toHaveLength(1);
    expect(screen.queryByText('Pick a posting')).toBeNull();
    // The Deck walks its own card: the selection goes and Find's header shows again.
    await user.click(screen.getByRole('button', { name: 'View: List, switch to Deck' }));
    await waitFor(() => expect(window.location.hash).toBe('#/review'));
    expect(screen.getByRole('heading', { level: 1, name: 'Review' })).toBeInTheDocument();
  });

  // #544 (redesign §5.1): the compact Browse card is the title (bold body, 3 lines at most; it opens
  // the posting), the company, the facts, the pay, then Save, Skip and More. No source or New badge,
  // no Show description row, no Open posting key.
  it('Browse rows are compact standalone cards; below lg the title is the link out', async () => {
    feed.fetchFeed.mockResolvedValue(result([ONE]));
    renderReview();
    const ul = await list();
    const card = within(ul).getByRole('article', { name: 'Design Systems Designer at Acme' });
    const title = within(card).getByRole('heading', { level: 3 });
    const company = within(card).getByText('Acme');
    const place = within(card).getByText('Lisbon');
    const pay = within(card).getByText('$95k to $120k');
    const save = within(card).getByRole('button', { name: 'Save Design Systems Designer at Acme' });
    const skip = within(card).getByRole('button', { name: 'Skip Design Systems Designer at Acme' });
    const more = within(card).getByRole('button', {
      name: 'More actions: Design Systems Designer at Acme',
    });
    const order = [title, company, place, pay, save, skip, more];
    order.slice(1).forEach((el, i) => expect(before(order[i], el)).toBe(true));
    // Save is the filled key with a plus; Skip the grey one.
    expect(save.querySelector('svg.lucide-plus')).not.toBeNull();
    // The title is bold body text, cut at 3 lines, and it is the link to the posting.
    expect(title.className).toMatch(/line-clamp-3|clamp/);
    const link = within(title).getByRole('link', { name: /^Design Systems Designer/ });
    expect(link).toHaveAttribute('href', ONE.url);
    expect(link).toHaveAttribute('target', '_blank');
    // Cut: badges, the description row, the Open posting key.
    expect(within(card).queryByText('Hacker News')).toBeNull();
    expect(within(card).queryByText('New')).toBeNull();
    expect(within(card).queryByRole('button', { name: /description/ })).toBeNull();
    expect(within(card).queryByRole('link', { name: /^Open posting/ })).toBeNull();
  });

  it('Browse and Deck cards draw no outline (soft surfaces: never bordered)', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(result([ONE]));
    renderReview();
    const ul = await list();
    expect(within(ul).getByRole('article')).not.toHaveAttribute('data-bordered', 'true');
    await user.click(screen.getByRole('button', { name: 'View: List, switch to Deck' }));
    expect(screen.getByRole('article')).not.toHaveAttribute('data-bordered', 'true');
  });

  // #616 (Adrian 2026-11-12): one fact per line, in one order: place, work mode, posted day. The
  // mode shows once, on its own line, also when the place text already says Remote.
  it('puts each fact on its own line: place, work mode, posted', async () => {
    feed.fetchFeed.mockResolvedValue(
      result([
        post('hn:1', 'Design Systems Designer', 'Acme', {
          location: 'Lisbon, Portugal',
          mode: 'remote',
        }),
      ]),
    );
    renderReview();
    const card = within(await list()).getByRole('article');
    const place = within(card).getByText('Lisbon, Portugal');
    const mode = within(card).getByText('Remote');
    const posted = within(card).getByText('Posted today');
    const lines = [place, mode, posted].map((el) => el.parentElement!);
    // Three lines, one fact each, each with its icon, in that order.
    expect(new Set(lines).size).toBe(3);
    const icons = ['lucide-map-pin', 'lucide-briefcase', 'lucide-calendar'];
    lines.forEach((line, i) => {
      expect(line.querySelectorAll('svg')).toHaveLength(1);
      expect(line.querySelector('svg')!.classList.contains(icons[i])).toBe(true);
      expect(line.textContent).toBe([place, mode, posted][i].textContent);
    });
    lines.slice(1).forEach((line, i) => expect(before(lines[i], line)).toBe(true));
    expect(lines[0].parentElement).toBe(lines[1].parentElement);
    expect(lines[1].parentElement).toBe(lines[2].parentElement);
  });

  it('leaves the mode line out when the place already says remote (2026-11-12)', async () => {
    feed.fetchFeed.mockResolvedValue(
      result([post('hn:1', 'Design Systems Designer', 'Acme', { location: 'Remote (US)' })]),
    );
    renderReview();
    const card = within(await list()).getByRole('article');
    expect(within(card).getByText('Remote (US)')).toBeInTheDocument();
    expect(within(card).queryByText('Remote', { exact: true })).toBeNull();
    expect(card.querySelectorAll('svg.lucide-briefcase')).toHaveLength(0);
  });

  it('says what the source leaves out, and shows a mode-only place once, as the mode', async () => {
    feed.fetchFeed.mockResolvedValue(
      result([
        post('hn:1', 'Design Systems Designer', 'Acme', { location: 'Remote', mode: 'remote' }),
        post('hn:2', 'Design Systems Lead', 'Kite', { location: 'Berlin', mode: undefined }),
      ]),
    );
    renderReview();
    const [first, second] = within(await list()).getAllByRole('article');
    expect(within(first).getByText('Location not stated')).toBeInTheDocument();
    expect(within(first).getAllByText('Remote')).toHaveLength(1);
    expect(within(second).getByText('Berlin')).toBeInTheDocument();
    expect(
      within(second).getByText(/^(Work mode not stated|Remote not stated)$/),
    ).toBeInTheDocument();
  });
});

describe('Find on a phone: no posting page (Adrian 2026-11-08)', () => {
  const renderPhoneFind = (hash = '#/review') => {
    window.location.hash = hash;
    return render(
      <ToastProvider>
        <main>
          <ReviewView header={<h1>Review</h1>} />
        </main>
        <NoticeHost />
      </ToastProvider>,
    );
  };

  it('the title opens the posting itself; nothing on the card opens a page in the app', async () => {
    renderPhoneFind();
    const ul = await list();
    const card = within(ul).getAllByRole('article')[0];
    const links = within(card).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(within(card).getByRole('heading', { level: 3 })).toContainElement(links[0]);
    expect(links[0].getAttribute('href')).toMatch(/^https:/);
    // Two lines of the held text (2026-11-12); Show more opens it in place, then the full posting.
    expect(within(card).getByText('Own the design system.')).toHaveClass('rjb-clamp-2');
    const more = within(card).getByRole('button', { name: 'Show more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await userEvent.setup().click(more);
    expect(within(card).getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(card).getByRole('link', { name: /Read the full posting/ })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/review');
  });

  it('an old #/find/<fingerprint> link (Find was renamed Review) opens Review with that card in view', async () => {
    const seen: Element[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      seen.push(this);
    });
    renderPhoneFind(`#/find/${encodeURIComponent(postingFingerprint(BASIC[2]))}`);
    const ul = await list();
    await waitFor(() => expect(window.location.hash).toBe('#/review'));
    // The page itself, not a posting view: Find's h1 and the list.
    expect(screen.getByRole('heading', { level: 1, name: 'Review' })).toBeInTheDocument();
    const card = within(ul)
      .getAllByRole('article')
      .find((a) => within(a).queryByText('Beta'))!;
    await waitFor(() => expect(seen.some((el) => el.contains(card))).toBe(true));
  });

  it('each card’s list item says its place in the whole list (aria-setsize / posinset)', async () => {
    renderPhoneFind();
    const ul = await list();
    const items = within(ul).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(1);
    items.forEach((li, i) => {
      expect(li).toHaveAttribute('aria-posinset', String(i + 1));
      expect(li).toHaveAttribute('aria-setsize', String(items.length));
    });
  });

  it('after the last card, focus goes to the empty state’s title', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(result([BASIC[0]]));
    renderPhoneFind();
    const ul = await list();
    await user.click(within(ul).getByRole('button', { name: /^Skip / }));
    const title = await screen.findByText('You’re all caught up');
    await waitFor(() => expect(document.activeElement).toBe(title));
  });

  it('after Skip on a card, focus goes to the next card’s title', async () => {
    const user = userEvent.setup();
    renderPhoneFind();
    const ul = await list();
    const cards = within(ul).getAllByRole('article');
    const next = within(cards[1]).getByRole('heading', { level: 3 });
    await user.click(within(cards[0]).getByRole('button', { name: /^Skip / }));
    await waitFor(() => expect(titles(ul)).toHaveLength(2));
    await waitFor(() => expect(document.activeElement).toBe(next));
  });
});

describe('Review new: the caught-up empty state (Adrian 2026-11-08)', () => {
  it('sits in its own section with room around it, framed like Apply’s first-job empty', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(result([BASIC[0]]));
    renderReview();
    const ul = await list();
    await user.click(within(ul).getByRole('button', { name: /^Skip / }));
    const title = await screen.findByText('You’re all caught up');
    const section = title.closest('[data-empty-section]') as HTMLElement;
    expect(section).not.toBeNull();
    expect(section.tagName).toBe('SECTION');
    // The framed teaching empty: its icon tile and centred column inside one panel.
    expect(within(section).getByText(/saved or skipped/)).toBeInTheDocument();
    expect(section.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
    // No postings shown: no List | Deck toggle to switch it (Adrian 2026-11-13).
    expect(screen.queryByRole('button', { name: /^View: / })).toBeNull();
  });
});

describe('Review new: every design-system posting, no tiers', () => {
  it('lists each one that passes the inclusion check, newest first, and counts the rest', async () => {
    feed.fetchFeed.mockResolvedValue(
      result([
        post('hn:1', 'Design Systems Engineer', 'Orbit', { postedAt: '2026-10-01T00:00:00Z' }),
        post('hn:2', 'Design Technologist', 'Glyph', { postedAt: '2026-10-20T00:00:00Z' }),
        post('hn:3', 'Frontend Platform Engineer', 'Kite', { text: 'our design system' }),
        post('hn:4', 'Backend Engineer', 'Nimbus'),
      ]),
    );
    renderReview();
    const ul = await list();
    expect(titles(ul)).toEqual(['Design Technologist', 'Design Systems Engineer']);
    expect(screen.queryByRole('heading', { name: 'Review' })).toBeNull();
    // Counted for Scan details (the Account menu), not shown on the page (Adrian 2026-11-08).
    expect(screen.queryByText(/not design-system roles/)).toBeNull();
    expect(getScanDetails()?.hidden).toContain('2 not design-system roles');
    // No match-reason line on the cards (Adrian 2026-11-08).
    expect(within(ul).queryByText('Related title')).toBeNull();
    expect(within(ul).queryByText(/^Design-system title/)).toBeNull();
  });

  it('remote only: a posting that names no place says so', async () => {
    feed.fetchFeed.mockResolvedValue(
      result([
        post('hn:1', 'Design Systems Engineer', 'Orbit', { location: '', mode: undefined }),
        post('hn:2', 'Design Systems Lead', 'Kite', { location: 'Austin, TX', mode: 'onsite' }),
      ]),
    );
    renderReview();
    const ul = await list();
    expect(titles(ul)).toEqual(['Design Systems Engineer']);
    expect(within(ul).getByText('Location not stated')).toBeInTheDocument();
  });

  it('a title selects the posting: details, Open posting, and Save / Skip / Not this company', async () => {
    const user = userEvent.setup();
    renderFind();
    const ul = await list();
    await user.click(within(ul).getByRole('link', { name: 'Design Systems Engineer, Web' }));
    const detail = await detailOf('Design Systems Engineer, Web');
    expect(within(detail).getByText('Own the design system.')).toBeInTheDocument();
    expect(within(detail).getByRole('link', { name: /^Open posting for / })).toHaveAttribute(
      'href',
      'https://news.ycombinator.com/item?id=hn2',
    );
    await user.click(
      within(detail).getByRole('button', { name: 'Skip Design Systems Engineer, Web at Acme' }),
    );
    await waitFor(() => expect(titles(ul)).toHaveLength(2));
    // The next posting in the list is selected in its place.
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent(
      'Design Systems Engineer, Web',
    );
  });

  it('a double tap on Skip in the selected posting skips one posting, not the next too', async () => {
    const user = userEvent.setup();
    renderFind();
    const ul = await list();
    await user.click(within(ul).getByRole('link', { name: 'Design Systems Engineer, Web' }));
    const detail = await detailOf('Design Systems Engineer, Web');
    await user.click(within(detail).getByRole('button', { name: /^Skip / }));
    // The next posting renders under the finger; the second tap lands on its Skip.
    const next = await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(next).not.toHaveTextContent('Design Systems Engineer, Web'));
    await user.click(
      within(next.closest('section') as HTMLElement).getByRole('button', { name: /^Skip / }),
    );
    await waitFor(() => expect(titles(ul)).toHaveLength(2));
    expect(getAllDecided().decided).toHaveLength(1);
  });

  it('at lg, list cards carry no keys; the detail column has them (#546)', async () => {
    const user = userEvent.setup();
    renderFind();
    const ul = await list();
    expect(within(ul).queryAllByRole('button', { name: /^(Save|Skip|More actions:) / })).toEqual(
      [],
    );
    expect(within(ul).queryAllByRole('link', { name: /^Open posting for / })).toEqual([]);
    await user.click(within(ul).getByRole('link', { name: 'Design Systems Engineer, Web' }));
    const detail = await detailOf('Design Systems Engineer, Web');
    await user.click(within(detail).getByRole('button', { name: /^Skip / }));
    const next = await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(next).not.toHaveTextContent('Design Systems Engineer, Web'));
    expect(screen.queryByText('Pick a posting')).toBeNull();
    expect(window.location.hash).toMatch(/^#\/review\/./);
    await waitFor(() => expect(titles(ul)).toHaveLength(2));
    expect(getAllDecided().decided).toHaveLength(1);
  });

  it('a double tap on Save in the list saves one posting', async () => {
    const user = userEvent.setup();
    renderReview();
    const ul = await list();
    const saves = within(ul).getAllByRole('button', { name: /^Save / });
    await user.click(saves[0]);
    await user.click(within(ul).getAllByRole('button', { name: /^Save / })[0]);
    await waitFor(() => expect(getAllJobs()).toHaveLength(1));
  });

  it('after a decision, focus goes to the next posting’s title; after the last, to Find', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(result([BASIC[0], BASIC[1]]));
    renderFind();
    const ul = await list();
    await user.click(within(ul).getByRole('link', { name: 'Design Systems Engineer, Web' }));
    const detail = await detailOf('Design Systems Engineer, Web');
    await user.click(within(detail).getByRole('button', { name: /^Skip / }));
    const next = await screen.findByRole('heading', { level: 1, name: 'Design Systems Designer' });
    await waitFor(() => expect(next).toHaveFocus());
    resetAnswerGuard(); // a person reads the next posting before deciding
    await user.click(
      within(next.closest('section') as HTMLElement).getByRole('button', { name: /^Skip / }),
    );
    const find = await screen.findByRole('heading', { level: 1, name: 'Review' });
    await waitFor(() => expect(find).toHaveFocus());
  });

  it('a company watched since the last read shows its jobs at once, reading only its board', async () => {
    renderReview();
    const ul = await list();
    feed.fetchFeed.mockResolvedValueOnce({
      postings: [
        post('ashby:zeta:1', 'Design System Lead', 'Zeta', {
          source: 'ashby',
          url: 'https://jobs.ashbyhq.com/zeta/1',
        }),
      ],
      sources: [{ key: 'ashby:zeta', label: 'Zeta (Ashby)', fetched: 1 }],
    });
    act(() => void addSources([{ kind: 'ashby', ref: 'zeta', label: 'Zeta' }]));
    // The rows already up stay while the new board is read.
    expect(titles(ul)).toHaveLength(3);
    await waitFor(() => expect(titles(ul)).toHaveLength(4));
    expect(feed.fetchFeed).toHaveBeenCalledTimes(2);
    expect(feed.fetchFeed.mock.calls[1][0]).toMatchObject({
      terms: [],
      boardUrls: ['https://jobs.ashbyhq.com/zeta'],
    });
  });
});

describe('Find: one empty state, picked by cause, the same in List and Deck (#694)', () => {
  const shape = async () => {
    const section = (await screen.findByRole('region', { name: 'No postings' })) as HTMLElement;
    return {
      cause: section.getAttribute('data-empty-cause'),
      title: section.querySelector(`#${CSS.escape('rjb-review-empty-title')}`)?.textContent ?? null,
      text: section.textContent,
      keys: within(section)
        .queryAllByRole('button')
        .map((b) => `${b.textContent}`),
      icon: section.querySelector('[aria-hidden="true"] svg')?.getAttribute('class'),
    };
  };
  // No postings shown: the List | Deck toggle hides (Adrian 2026-11-13), so an empty state is
  // never switched; the Deck's own empty is checked by emptying the Deck below.
  const both = async (_user: ReturnType<typeof userEvent.setup>) => {
    const s = await shape();
    expect(screen.queryByRole('button', { name: /^View: / })).toBeNull();
    return s;
  };

  it('nothing matches: "No postings match yet" with Scan now and Edit search profile', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(result([]));
    renderReview();
    const s = await both(user);
    expect(s.cause).toBe('none');
    expect(s.text).toContain('No postings match yet');
    expect(s.keys).toEqual(['Scan now', 'Edit search profile']);
    expect(s.icon).toContain('search-x');
  });

  it('all saved or skipped: "You’re all caught up" with Scan now and a check-circle tile', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(result([BASIC[0]]));
    renderReview();
    const ul = await list();
    await user.click(within(ul).getByRole('button', { name: /^Skip / }));
    const s = await both(user);
    expect(s.cause).toBe('caughtUp');
    expect(s.text).toContain('You’re all caught up');
    expect(s.keys).toEqual(['Scan now']);
    expect(s.icon).toMatch(/circle-check|check-circle/);
  });

  it('filters hide everything: "No postings with these filters" with Clear filters', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(
      result([post('hn:9', 'Design Systems Designer', 'Acme', { location: '', mode: undefined })]),
    );
    renderReview();
    await list();
    await user.click(screen.getByRole('button', { name: /^Remote/ }));
    const s = await both(user);
    expect(s.cause).toBe('filtered');
    expect(s.text).toContain('No postings with these filters');
    expect(s.keys).toEqual(['Clear filters']);
    // The chips stay (Clear is a chip away); only the toggle hides. Back to postings: it returns.
    await user.click(screen.getByRole('button', { name: /^Remote/ }));
    expect(
      await screen.findByRole('button', { name: 'View: List, switch to Deck' }),
    ).toBeInTheDocument();
  });

  it('the Deck emptied by its last decision: the same empty state, the toggle hides', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(result([BASIC[0]]));
    renderReview();
    await list();
    await user.click(screen.getByRole('button', { name: 'View: List, switch to Deck' }));
    const card = screen.getByRole('article').getAttribute('aria-label');
    await user.click(screen.getByRole('button', { name: `Skip ${card}` }));
    const s = await shape();
    expect(s.cause).toBe('caughtUp');
    expect(screen.queryByRole('button', { name: /^View: / })).toBeNull();
  });
});

describe('Find: the List | Deck toggle shows only beside postings (Adrian 2026-11-13)', () => {
  const toggle = () => screen.queryByRole('button', { name: /^View: / });

  it('shown while postings show', async () => {
    feed.fetchFeed.mockResolvedValue(result(BASIC));
    renderReview();
    await list();
    expect(toggle()).toBeInTheDocument();
  });

  it('hidden while loading (skeleton, no cards)', () => {
    feed.fetchFeed.mockReturnValue(new Promise(() => {}));
    renderReview();
    expect(toggle()).toBeNull();
  });

  it('hidden when nothing matches', async () => {
    feed.fetchFeed.mockResolvedValue(result([]));
    renderReview();
    await screen.findByRole('region', { name: 'No postings' });
    expect(toggle()).toBeNull();
  });
});
