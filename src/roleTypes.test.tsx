// Role types on a design-systems track (Adrian: "all of these results are engineering heavy"):
// design-systems roles lead, then product design; engineering-heavy roles fold behind one quiet
// "N engineering-heavy roles" row in Live postings and on each company row, and the counts leave
// them out. Calibrate's "Show engineering-heavy roles" brings them back, per track. Another track
// keeps its order, with no tags and no setting.
import './test/legacyScreens';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import type { FeedResult } from './feed/fetchFeed';
import type { Posting } from './feed/types';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});
const feed = vi.hoisted(() => ({ fetchFeed: vi.fn() }));
vi.mock('./feed/fetchFeed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./feed/fetchFeed')>()),
  fetchFeed: feed.fetchFeed,
}));

import LiveFeedPanel from './LiveFeedPanel';
import { ColorModeProvider } from './ColorMode';
import App from './App';
import { addCategory, addGroup, addTile, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { readShowEngineering } from './feed/roleTypePref';

const post = (id: string, title: string, text = ''): Posting => ({
  id: `ashby:${id}`,
  source: 'ashby',
  title,
  company: 'Acme',
  url: `https://jobs.ashbyhq.com/acme/${id}`,
  location: '',
  text,
});
// Ashby's board as Adrian saw it: the Design Engineer led on score.
const POSTINGS = [
  post('1', 'Design Engineer - Americas/Canada/EU', 'Ship our design systems in React.'),
  post('2', 'Senior Frontend Engineer, Design Systems'),
  post('3', 'Product Designer', 'Work closely with our design systems team.'),
  post('4', 'Product Designer – Design Systems'),
];
const RESULT: FeedResult = { postings: POSTINGS, sources: [] };
const DS_TERMS = ['design systems', 'design engineer', 'product designer'];

let cat: string;
beforeEach(() => {
  localStorage.clear();
  feed.fetchFeed.mockReset().mockResolvedValue(RESULT);
  replaceCurationState(EMPTY_CURATION);
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
  vi.unstubAllGlobals();
});

const renderPanel = (terms: string[]) =>
  render(
    <ToastProvider>
      <LiveFeedPanel categoryId={cat} terms={terms} boardUrls={[]} />
    </ToastProvider>,
  );
const titlesIn = (list: HTMLElement) =>
  within(list)
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent?.replace(' (opens in new tab)', ''));

describe('Live postings on a design-systems track', () => {
  beforeEach(() => {
    cat = addCategory({ label: 'Design work', titles: DS_TERMS });
  });

  it('design systems first, then product design; engineering-heavy roles fold behind one row', async () => {
    renderPanel(DS_TERMS);
    const list = await screen.findByRole('list', { name: 'Live postings' });
    expect(titlesIn(list)).toEqual(['Product Designer – Design Systems', 'Product Designer']);
    // Each row names its type in plain words.
    expect(within(list).getByText('Design systems')).toBeVisible();
    expect(within(list).getByText('Product design')).toBeVisible();
    // The Openings count leaves the folded roles out.
    expect(screen.getByRole('img', { name: '2 openings' })).toBeInTheDocument();
    const fold = screen.getByRole('button', { name: '2 engineering-heavy roles' });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(fold);
    const heavy = screen.getByRole('list', { name: 'Engineering-heavy roles' });
    expect(titlesIn(heavy)).toEqual([
      'Senior Frontend Engineer, Design Systems',
      'Design Engineer - Americas/Canada/EU',
    ]);
    expect(within(heavy).getAllByText('Engineering-heavy')).toHaveLength(2);
  });

  it('Calibrate’s "Show engineering-heavy roles" lists them inline, last, and is kept per track', async () => {
    renderPanel(DS_TERMS);
    await screen.findByRole('list', { name: 'Live postings' });
    await userEvent.click(screen.getByRole('button', { name: /Calibrate/ }));
    const toggle = screen.getByRole('switch', { name: 'Show engineering-heavy roles' });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(readShowEngineering(cat)).toBe(true);
    const list = screen.getByRole('list', { name: 'Live postings' });
    expect(titlesIn(list)).toEqual([
      'Product Designer – Design Systems',
      'Product Designer',
      'Senior Frontend Engineer, Design Systems',
      'Design Engineer - Americas/Canada/EU',
    ]);
    expect(screen.queryByRole('button', { name: /engineering-heavy roles$/ })).toBeNull();
    expect(screen.getByRole('img', { name: '4 openings' })).toBeInTheDocument();
    // Another track is unaffected.
    expect(readShowEngineering('another-track')).toBe(false);
  });
});

describe('Live postings on another track', () => {
  it('keeps relevance order: no tags, no fold, no setting', async () => {
    cat = addCategory({ label: 'Frontend', titles: ['engineer', 'designer'] });
    renderPanel(['engineer', 'designer']);
    const list = await screen.findByRole('list', { name: 'Live postings' });
    expect(titlesIn(list)).toHaveLength(2);
    expect(within(list).queryByText('Engineering-heavy')).toBeNull();
    expect(screen.queryByRole('button', { name: /engineering-heavy/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Calibrate/ }));
    expect(screen.queryByRole('switch', { name: 'Show engineering-heavy roles' })).toBeNull();
  });
});

describe('Companies rows on a design-systems track', () => {
  const ashbyJob = (id: string, title: string) => ({
    id,
    title,
    jobUrl: `https://jobs.ashbyhq.com/acme/${id}`,
    location: 'Remote',
    descriptionPlain: '',
  });
  beforeEach(() => {
    const board = {
      jobs: [
        ashbyJob('1', 'Design Engineer - Americas/Canada/EU'),
        ashbyJob('2', 'Senior Frontend Engineer, Design Systems'),
        ashbyJob('3', 'Product Designer – Design Systems'),
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(board), { status: 200 })),
    );
    cat = addCategory({ label: 'Design work', titles: DS_TERMS, atsRoles: DS_TERMS });
    const g = addGroup(cat, { label: 'Watched companies' });
    addTile(g, { name: 'Acme', url: 'https://jobs.ashbyhq.com/acme', meta: '' });
    window.location.hash = '#/discover';
  });

  it('"N matching roles" counts the shown roles; engineering-heavy ones sit behind a quiet row', async () => {
    render(
      <ColorModeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ColorModeProvider>,
    );
    const list = await screen.findByRole('list', { name: 'Companies' });
    expect(await within(list).findByText('Ashby · 1 matching role')).toBeVisible();
    await userEvent.click(within(list).getByRole('button', { name: /^Roles at / }));
    const roles = await within(list).findByRole('list', { name: /^Open roles at / });
    expect(within(roles).getByText('Product Designer – Design Systems')).toBeVisible();
    expect(within(roles).getByText('Design systems')).toBeVisible();
    expect(within(roles).queryByText(/Design Engineer/)).toBeNull();
    await userEvent.click(within(list).getByRole('button', { name: '2 engineering-heavy roles' }));
    const heavy = within(list).getByRole('list', { name: /^Engineering-heavy roles at / });
    expect(within(heavy).getAllByRole('listitem')).toHaveLength(2);
  });
});
