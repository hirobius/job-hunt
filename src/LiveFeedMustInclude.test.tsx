import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import type { FeedResult } from './feed/fetchFeed';

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
vi.mock('./feed/fetchFeed', () => feed);

import LiveFeedPanel from './LiveFeedPanel';
import { addCategory, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { readMustInclude, setMustInclude } from './feed/mustInclude';
import { getAllJobs } from './store';

const post = (id: string, title: string, text: string) => ({
  id,
  source: 'ashby' as const,
  title,
  text,
  company: 'Acme',
  location: '',
  url: `https://jobs.ashbyhq.com/a/${id}`,
});
const RESULT: FeedResult = {
  postings: [
    post('1', 'Design Systems Designer', 'Own the library.'),
    post('2', 'Product Designer', 'Grow our design system with us.'),
    post('3', 'Product Designer, Growth', 'Join our partner ecosystem.'),
    post('4', 'UI Systems Designer', 'Tokens and components.'),
  ],
  sources: [{ key: 'hn', label: 'Hacker News', fetched: 4 }],
};

let cat: string;
beforeEach(() => {
  localStorage.clear();
  feed.fetchFeed.mockReset().mockResolvedValue(RESULT);
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Design Systems', seniority: 'any' });
});
afterEach(cleanup);

const renderPanel = () =>
  render(
    <ToastProvider>
      <LiveFeedPanel categoryId={cat} terms={['designer']} boardUrls={[]} calibrate />
    </ToastProvider>,
  );
const titles = () =>
  within(screen.getByRole('list', { name: 'Live postings' }))
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent?.replace(' (opens in new tab)', ''));

describe('must include in Live postings', () => {
  it('shows only postings that say systems in the title or description, and counts the rest', async () => {
    setMustInclude(cat, { terms: ['systems'], inText: true });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(titles()).toEqual(
      expect.arrayContaining([
        'Design Systems Designer',
        'Product Designer',
        'UI Systems Designer',
      ]),
    );
    expect(titles()).not.toContain('Product Designer, Growth'); // "ecosystem" is not "systems"
    expect(screen.getByText(/1 hidden by must include/i)).toBeInTheDocument();
  });

  it('is edited in Calibrate as chips, per track and kept', async () => {
    const user = userEvent.setup();
    setMustInclude(cat, { inText: true });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(titles()).toHaveLength(4);
    const field = screen.getByRole('textbox', { name: 'Add a phrase' });
    await user.type(field, 'systems{Enter}');
    expect(readMustInclude(cat).terms).toEqual(['systems']);
    expect(titles()).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Remove systems' }));
    expect(readMustInclude(cat).terms).toEqual([]);
    expect(titles()).toHaveLength(4);
  });

  it('Save all saves only what must include lets through', async () => {
    const user = userEvent.setup();
    setMustInclude(cat, { terms: ['systems'], inText: true });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    await user.click(screen.getByRole('button', { name: 'Openings options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Save all (3)' }));
    expect(getAllJobs().map((j) => j.label)).not.toContain('Product Designer, Growth');
    expect(getAllJobs()).toHaveLength(3);
  });

  it('the title/description toggles re-filter what is loaded, with no new read; description starts off', async () => {
    const user = userEvent.setup();
    setMustInclude(cat, { terms: ['systems'] });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    const reads = feed.fetchFeed.mock.calls.length;
    const byTitle = ['Design Systems Designer', 'UI Systems Designer'];
    expect(titles().sort()).toEqual(byTitle);
    const text = screen.getByRole('switch', { name: 'Match in description' });
    expect(text).not.toBeChecked();
    await user.click(text);
    expect(readMustInclude(cat).inText).toBe(true);
    expect(titles().sort()).toEqual([...byTitle, 'Product Designer'].sort());
    await user.click(screen.getByRole('switch', { name: 'Match in title' }));
    expect(titles()).toEqual(['Product Designer']);
    await user.click(text);
    // Both off reads as title only, and says so.
    expect(screen.getByText('Both off: matching the title only.')).toBeInTheDocument();
    expect(titles().sort()).toEqual(byTitle);
    expect(feed.fetchFeed.mock.calls.length).toBe(reads);
  });

  // Muse Phase 1 (2026-10-24): a design system rule makes the track a scored one. The scorer
  // (src/tracks) replaces related titles and the field toggles; Design Engineers stay out unless
  // the title is a design-system one (Adrian 2026-10-23), and every card says why it is listed.
  it('a design system rule is scored: queue by score with reasons, review apart, the rest left out', async () => {
    const user = userEvent.setup();
    const ds = 'Own our design system and component library, and the design tokens.';
    const text = 'Grow our design system with designers, Claude Code and Cursor.';
    feed.fetchFeed.mockResolvedValue({
      ...RESULT,
      postings: [
        post('1', 'Design Systems Designer', 'Own the library.'),
        post('2', 'Product Designer', text),
        post('f', 'Senior Design Engineer', `Frontcareers. ${text}`),
        post('u', 'Design Engineer – UK', text),
        post('p', 'UI Platform Engineer', text),
        post('t', 'Design Technologist', 'Prototype with designers.'),
        post('t2', 'Design Technologist, Web', ds),
        post('r', 'Staff Product Designer, Platform', 'Contribute to our design system.'),
        post('m', 'Senior Mechanical Design Engineer', ds),
        post('i', 'Design Systems Intern', ds),
      ],
    });
    setMustInclude(cat, { terms: ['design system'], inText: true });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    // Strong title first (88+), then the promoted adjacent title.
    expect(titles()).toEqual(['Design Systems Designer', 'Design Technologist, Web']);
    const cards = within(screen.getByRole('list', { name: 'Live postings' })).getAllByRole(
      'listitem',
    );
    for (const c of cards) expect(within(c).getByText(/^Queued because: /)).toBeInTheDocument();
    expect(screen.getByText(/7 left out by the scorer/)).toBeInTheDocument();
    expect(screen.getByText(/scored on title \+ posting evidence/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Match in description' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Related titles' })).not.toBeInTheDocument();
    // Review is its own bucket, with a count.
    await user.click(screen.getByRole('button', { name: /Review/ }));
    const held = screen.getByRole('list', { name: 'Held for review' });
    expect(within(held).getByText('Staff Product Designer, Platform')).toBeInTheDocument();
    expect(within(held).getByText(/^Held for review because: /)).toBeInTheDocument();
  });

  it('related titles only show on a design system rule', async () => {
    setMustInclude(cat, { terms: ['systems'] });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(screen.queryByRole('switch', { name: 'Related titles' })).not.toBeInTheDocument();
  });
});
