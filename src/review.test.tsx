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
/** Find's two columns (#471 slice 3): the list and the selected posting, at lg. */
const renderFind = () => {
  viewport(1280);
  window.location.hash = '#/find';
  return render(
    <ToastProvider>
      <main>
        <ReviewView header={<h1>Find</h1>} />
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
    .map((h) => h.textContent?.replace(/\s*\(opens in new tab\)$/, ''));

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
    await screen.findByRole('button', { name: 'Browse' });
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
    // The posting is one tap away beside each title.
    expect(
      within(ul).getByRole('link', { name: 'Open posting for Design Systems Designer at Beta' }),
    ).toHaveAttribute('href', expect.stringMatching(/^https:\/\/news\.ycombinator\.com/));
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
    renderReview();
    const ul = await list();
    expect(titles(ul)).toHaveLength(REVIEW_PAGE);
    // Newest first by default.
    expect(titles(ul)[0]).toBe('Design Systems Designer 0');
    await user.click(screen.getByRole('button', { name: 'Load more (5)' }));
    expect(titles(ul)).toHaveLength(REVIEW_PAGE + 5);
    await user.click(screen.getByRole('button', { name: 'Sort: Newest' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Company' }));
    expect(titles(ul)[0]).toBe('Design Systems Designer 29');
    // Two filters only (Adrian 2026-10-28): New today and Remote.
    expect(
      within(screen.getByRole('group', { name: 'Filter postings' }))
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['New today 30', 'Remote 30']);
  });
});

describe('Review new: Deck', () => {
  it('Browse | Deck is two icon-only toggle buttons, named, one pressed (Adrian 2026-11-09)', async () => {
    const user = userEvent.setup();
    renderReview();
    await list();
    const group = screen.getByRole('group', { name: 'Review view' });
    const browse = within(group).getByRole('button', { name: 'Browse' });
    const deck = within(group).getByRole('button', { name: 'Deck' });
    expect(browse).toHaveAttribute('aria-pressed', 'true');
    expect(deck).toHaveAttribute('aria-pressed', 'false');
    // Icon only: no visible text in the button.
    expect(browse.textContent).toBe('');
    await user.click(deck);
    expect(deck).toHaveAttribute('aria-pressed', 'true');
    expect(browse).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('radio', { name: 'Deck' })).toBeNull();
  });

  it('shows one card at a time; a decided card makes way for the next', async () => {
    const user = userEvent.setup();
    renderReview();
    await list();
    await user.click(screen.getByRole('button', { name: 'Deck' }));
    const first = screen.getByRole('article');
    const name = first.getAttribute('aria-label');
    await user.click(within(first).getByRole('button', { name: /^Skip / }));
    await waitFor(() =>
      expect(screen.getByRole('article')).not.toHaveAttribute('aria-label', name!),
    );
    expect(screen.getAllByRole('article')).toHaveLength(1);
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
    await user.click(screen.getByRole('button', { name: 'Deck' }));
    return screen.getByRole('article', { name: 'Design Systems Designer at Acme' });
  };
  const before = (a: Node, b: Node) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('stacks source pill, title, company, meta lines, pay, then one action row', async () => {
    const card = await openDeck(ONE);
    const source = within(card).getByText('Hacker News');
    const title = within(card).getByRole('heading', { level: 3 });
    const company = within(card).getByText('Acme');
    const place = within(card).getByText('Lisbon');
    const mode = within(card).getByText('Remote');
    const posted = within(card).getByText('Posted today');
    const pay = within(card).getByText('$95k to $120k');
    const save = within(card).getByRole('button', { name: 'Save Design Systems Designer at Acme' });
    const skip = within(card).getByRole('button', { name: 'Skip Design Systems Designer at Acme' });
    const open = within(card).getByRole('link', {
      name: 'Open posting for Design Systems Designer at Acme',
    });
    const more = within(card).getByRole('button', {
      name: 'More actions: Design Systems Designer at Acme',
    });
    const order = [source, title, company, place, mode, posted, pay, save, skip, open, more];
    order.slice(1).forEach((el, i) => expect(before(order[i], el)).toBe(true));
    // One action row (Adrian 2026-11-08): Save primary, Skip secondary, the posting, More.
    const row = save.parentElement!;
    for (const el of [skip, more]) expect(row).toContainElement(el);
    expect(row).not.toContainElement(pay);
    // The meta lines carry their icons (lucide marks them aria-hidden svgs).
    expect(
      card.querySelectorAll('svg.lucide-map-pin, svg.lucide-briefcase, svg.lucide-calendar'),
    ).toHaveLength(3);
  });

  it('shows no pay when the source states none, and Save still sits in the footer', async () => {
    const card = await openDeck(post('hn:1', 'Design Systems Designer', 'Acme'));
    expect(within(card).queryByText(/\$|EUR|GBP|\bk\b/)).toBeNull();
    expect(within(card).queryByText(/pay|salary/i)).toBeNull();
    expect(
      within(card).getByRole('button', { name: 'Save Design Systems Designer at Acme' }),
    ).toBeInTheDocument();
  });

  it('shows New only when the posting is new', async () => {
    const card = await openDeck(ONE);
    expect(within(card).getByText('New')).toBeInTheDocument();
    cleanup();
    localStorage.setItem(SEEN_KEY, JSON.stringify({ [postingFingerprint(ONE)]: '2020-01-01' }));
    resetViewMemory();
    resetScan();
    const seen = await openDeck(ONE);
    expect(within(seen).queryByText('New')).toBeNull();
    expect(within(seen).getByText('Hacker News')).toBeInTheDocument();
  });

  it('the selected posting uses the same anatomy; a decision on the last one clears it', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(result([ONE]));
    renderFind();
    const ul = await list();
    await user.click(within(ul).getByRole('link', { name: 'Design Systems Designer' }));
    const detail = await detailOf('Design Systems Designer');
    const source = within(detail).getByText('Hacker News');
    const pay = within(detail).getByText('$95k to $120k');
    const save = within(detail).getByRole('button', {
      name: 'Save Design Systems Designer at Acme',
    });
    expect(before(source, pay) && before(pay, save)).toBe(true);
    await user.click(save);
    expect(await screen.findByText('Pick a posting')).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#/find'));
  });

  it('Browse rows are standalone cards in the same anatomy; below lg the title is no link', async () => {
    feed.fetchFeed.mockResolvedValue(result([ONE]));
    renderReview();
    const ul = await list();
    const card = within(ul).getByRole('article');
    const source = within(card).getByText('Hacker News');
    const title = within(card).getByRole('heading', { level: 3 });
    const company = within(card).getByText('Acme');
    const place = within(card).getByText('Lisbon');
    const pay = within(card).getByText('$95k to $120k');
    const save = within(card).getByRole('button', { name: 'Save Design Systems Designer at Acme' });
    const skip = within(card).getByRole('button', { name: 'Skip Design Systems Designer at Acme' });
    const order = [source, title, company, place, pay, save, skip];
    order.slice(1).forEach((el, i) => expect(before(order[i], el)).toBe(true));
    expect(
      within(card).getByRole('button', { name: 'More actions: Design Systems Designer at Acme' }),
    ).toBeInTheDocument();
    // Below lg nothing on the card navigates (no posting page): the title is plain text.
    expect(within(title).queryByRole('link')).toBeNull();
  });

  it('Browse and Deck cards draw no outline (soft surfaces: never bordered)', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue(result([ONE]));
    renderReview();
    const ul = await list();
    expect(within(ul).getByRole('article')).not.toHaveAttribute('data-bordered', 'true');
    await user.click(screen.getByRole('button', { name: 'Deck' }));
    expect(screen.getByRole('article')).not.toHaveAttribute('data-bordered', 'true');
  });

  it('gives the work mode no slot of its own when the place line already says it', async () => {
    feed.fetchFeed.mockResolvedValue(
      result([
        post('hn:1', 'Design Systems Designer', 'Acme', {
          location: 'Lisbon, Portugal (Remote)',
          mode: 'remote',
        }),
      ]),
    );
    renderReview();
    const card = within(await list()).getByRole('article');
    expect(within(card).getByText('Lisbon, Portugal (Remote)')).toBeInTheDocument();
    expect(within(card).queryByText('Remote')).toBeNull();
    expect(card.querySelector('svg.lucide-briefcase')).toBeNull();
  });
});

describe('Find on a phone: no posting page (Adrian 2026-11-08)', () => {
  const renderPhoneFind = (hash = '#/find') => {
    window.location.hash = hash;
    return render(
      <ToastProvider>
        <main>
          <ReviewView header={<h1>Find</h1>} />
        </main>
        <NoticeHost />
      </ToastProvider>,
    );
  };

  it('Show description opens the posting’s text in its card; the title goes nowhere', async () => {
    const user = userEvent.setup();
    renderPhoneFind();
    const ul = await list();
    const card = within(ul).getAllByRole('article')[0];
    expect(within(card).getByRole('heading', { level: 3 })).not.toContainElement(
      within(card).queryByRole('link', { name: /^Design Systems/ }),
    );
    expect(within(card).queryByText('Own the design system.')).toBeNull();
    await user.click(within(card).getByRole('button', { name: 'Show description' }));
    expect(within(card).getByText('Own the design system.')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Hide description' }));
    await waitFor(() => expect(within(card).queryByText('Own the design system.')).toBeNull());
    expect(window.location.hash).toBe('#/find');
  });

  it('an old #/find/<fingerprint> link opens Find with that card in view and its text open', async () => {
    const seen: Element[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      seen.push(this);
    });
    renderPhoneFind(`#/find/${encodeURIComponent(postingFingerprint(BASIC[2]))}`);
    const ul = await list();
    await waitFor(() => expect(window.location.hash).toBe('#/find'));
    // The page itself, not a posting view: Find's h1 and the list.
    expect(screen.getByRole('heading', { level: 1, name: 'Find' })).toBeInTheDocument();
    const card = within(ul)
      .getAllByRole('article')
      .find((a) => within(a).queryByText('Beta'))!;
    expect(within(card).getByRole('button', { name: 'Hide description' })).toBeInTheDocument();
    expect(within(card).getByText('Own the design system.')).toBeInTheDocument();
    await waitFor(() => expect(seen.some((el) => el.contains(card))).toBe(true));
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
    // The Deck's caught-up state is the same section.
    await user.click(screen.getByRole('button', { name: 'Deck' }));
    expect(
      (await screen.findByText('You’re all caught up')).closest('[data-empty-section]'),
    ).not.toBeNull();
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
    expect(screen.queryByRole('region', { name: 'Review' })).toBeNull();
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

  it("at lg, Skip on the selected posting's own list card selects the next posting (#471)", async () => {
    const user = userEvent.setup();
    renderFind();
    const ul = await list();
    await user.click(within(ul).getByRole('link', { name: 'Design Systems Engineer, Web' }));
    await detailOf('Design Systems Engineer, Web');
    const card = within(ul)
      .getAllByRole('article')
      .find((a) => within(a).queryByText('Design Systems Engineer, Web'))!;
    await user.click(within(card).getByRole('button', { name: /^Skip / }));
    const next = await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(next).not.toHaveTextContent('Design Systems Engineer, Web'));
    expect(screen.queryByText('Pick a posting')).toBeNull();
    expect(window.location.hash).toMatch(/^#\/find\/./);
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
    const find = await screen.findByRole('heading', { level: 1, name: 'Find' });
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
