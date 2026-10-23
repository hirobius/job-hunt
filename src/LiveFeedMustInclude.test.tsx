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
    setMustInclude(cat, { terms: ['systems'] });
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
    setMustInclude(cat, { terms: ['systems'] });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    await user.click(screen.getByRole('button', { name: 'Openings options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Save all (3)' }));
    expect(getAllJobs().map((j) => j.label)).not.toContain('Product Designer, Growth');
    expect(getAllJobs()).toHaveLength(3);
  });

  it('the phrase and the title/description toggles re-filter what is loaded, with no new read', async () => {
    const user = userEvent.setup();
    setMustInclude(cat, { terms: ['design system'] });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    const reads = feed.fetchFeed.mock.calls.length;
    // "UI Systems" is not the phrase; "design system" in a body counts while descriptions are on.
    expect(titles().sort()).toEqual(['Design Systems Designer', 'Product Designer']);
    await user.click(screen.getByRole('switch', { name: 'Match in description' }));
    expect(readMustInclude(cat).inText).toBe(false);
    expect(titles()).toEqual(['Design Systems Designer']);
    expect(screen.getByText(/3 hidden by must include/i)).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Match in title' }));
    // Both off reads as title only, and says so.
    expect(screen.getByText('Both off: matching the title only.')).toBeInTheDocument();
    expect(titles()).toEqual(['Design Systems Designer']);
    await user.click(screen.getByRole('switch', { name: 'Match in description' }));
    expect(titles()).toEqual(['Product Designer']);
    expect(feed.fetchFeed.mock.calls.length).toBe(reads);
  });
  it('related titles: a switch beside the two, chips with counts, re-filter at once and kept', async () => {
    const user = userEvent.setup();
    feed.fetchFeed.mockResolvedValue({
      ...RESULT,
      postings: [
        post('1', 'Design Systems Designer', 'Own the library.'),
        post('5', 'Design Technologist', 'Prototype in code with designers.'),
        post('6', 'UI Platform Engineer', 'Own our design system with designers.'),
        post('7', 'UI Platform Engineer, Infra', 'Own the platform with designers.'),
        post('8', 'Design Engineer', 'Grow the design system with Claude Code with designers.'),
      ],
    });
    setMustInclude(cat, { terms: ['design system'], inText: false });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    const reads = feed.fetchFeed.mock.calls.length;
    const all = ['Design Systems Designer', 'Design Technologist', 'UI Platform Engineer'];
    expect(titles().sort()).toEqual(all);
    const sw = screen.getByRole('switch', { name: 'Related titles' });
    expect(sw).toBeChecked();
    const chip = screen.getByRole('button', { name: 'Design Technologist, 1' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'UI Platform, 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Component Library, 0' })).toBeInTheDocument();
    // Off by default (2026-10-23): counted, not listed.
    expect(screen.getByRole('button', { name: 'Design Engineer, 1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.click(chip);
    expect(readMustInclude(cat).relatedOff).toEqual(['Design Technologist']);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(titles()).not.toContain('Design Technologist');
    await user.click(sw);
    expect(readMustInclude(cat).related).toBe(false);
    expect(titles()).toEqual(['Design Systems Designer']);
    expect(screen.queryByRole('button', { name: 'UI Platform, 1' })).not.toBeInTheDocument();
    await user.click(sw);
    await user.click(screen.getByRole('button', { name: 'Design Technologist, 1' }));
    expect(titles().sort()).toEqual(all);
    expect(feed.fetchFeed.mock.calls.length).toBe(reads);
  });

  it("Design Engineer is off by default: Ashby's Design Engineer roles stay out, Match in description too", async () => {
    const user = userEvent.setup();
    const text = 'Grow our design system with designers, Claude Code and Cursor.';
    feed.fetchFeed.mockResolvedValue({
      ...RESULT,
      postings: [
        post('1', 'Design Systems Designer', 'Own the library.'),
        post('a', 'Design Engineer – Americas', text),
        post('c', 'Design Engineer – Canada', text),
        post('e', 'Design Engineer – EU', text),
        post('u', 'Design Engineer – UK', text),
        post('s', 'Staff Design Engineer', text),
      ],
    });
    setMustInclude(cat, { terms: ['design system'] });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(titles()).toEqual(['Design Systems Designer']);
    const chip = screen.getByRole('button', { name: 'Design Engineer, 5' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);
    expect(readMustInclude(cat).relatedOn).toEqual(['Design Engineer']);
    expect(titles()).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: 'Design Engineer, 5' }));
    expect(readMustInclude(cat).relatedOn).toBeUndefined();
    expect(titles()).toEqual(['Design Systems Designer']);
  });

  it('related titles only show on a design system rule', async () => {
    setMustInclude(cat, { terms: ['systems'] });
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(screen.queryByRole('switch', { name: 'Related titles' })).not.toBeInTheDocument();
  });
});
