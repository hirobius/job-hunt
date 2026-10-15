// Role Radar's engine inside Live postings (docs/specs/role-radar.md, "Direction after the first
// pass"): no separate view. The feed reads the track's watched boards plus the starter directory,
// and once the user writes their evidence every posting gets a Strong / Stretch / Reach fit with
// Fit (citing the proof) and Gap, a "Strong fit" filter, and a roll-up of what the postings ask for.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { axe } from 'vitest-axe';
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
import { getAllJobs, removeJob } from './store';
import { addCategory, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';

const posting = (id: string, title: string, text: string) => ({
  id: `ashby:newco:${id}`,
  source: 'ashby' as const,
  title,
  company: 'Newco',
  url: `https://jobs.ashbyhq.com/newco/${id}`,
  location: 'Remote (US)',
  mode: 'remote' as const,
  text,
});

const RESULT: FeedResult = {
  postings: [
    posting(
      '1',
      'Design Systems Engineer',
      'Own the design system: design tokens, accessibility, a component library, Storybook.',
    ),
    posting('2', 'Design Systems Designer', 'Work on our design systems with Storybook and Figma.'),
    posting('3', 'Backend Engineer', 'Postgres only.'),
  ],
  sources: [{ key: 'ashby:newco', label: 'Newco (Ashby)', fetched: 3 }],
};

const EVIDENCE = `Design system ownership: HDS (https://example.com/hds)
Design tokens: DTCG pipeline
Accessibility: axe and contrast gates
Component library: 53 components on npm`;

let cat: string;
beforeEach(() => {
  localStorage.clear();
  feed.fetchFeed.mockReset().mockResolvedValue(RESULT);
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Design Systems', location: '' });
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

const renderPanel = () =>
  render(
    <ToastProvider>
      <LiveFeedPanel
        categoryId={cat}
        terms={['design systems']}
        boardUrls={['https://jobs.ashbyhq.com/newco']}
      />
    </ToastProvider>,
  );

const withEvidence = async () => {
  renderPanel();
  await screen.findByRole('list', { name: /live postings/i });
  fireEvent.change(screen.getByRole('textbox', { name: 'Your evidence' }), {
    target: { value: EVIDENCE },
  });
};

const row = (title: string) =>
  within(screen.getByRole('list', { name: /live postings/i }))
    .getAllByRole('listitem')
    .find((li) => within(li).queryByRole('link', { name: new RegExp(`^${title}`) }))!;

describe('Live postings with the radar engine', () => {
  it('is one feed, no separate Radar view, reading only the tracks watched boards', async () => {
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(screen.queryByRole('radio', { name: 'Radar' })).toBeNull();
    expect(feed.fetchFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        term: 'design systems',
        boardUrls: ['https://jobs.ashbyhq.com/newco'],
      }),
    );
  });

  it('without evidence, postings carry no fit and the evidence box invites one', async () => {
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    expect(screen.getByRole('textbox', { name: 'Your evidence' })).toHaveValue('');
    expect(screen.queryByText('Strong fit')).toBeNull();
  });

  it('with evidence, each posting shows its fit, with Fit citing the proof and the Gap', async () => {
    await withEvidence();
    const strong = row('Design Systems Engineer');
    expect(within(strong).getByText('Strong fit')).toBeInTheDocument();
    expect(within(row('Design Systems Designer')).getByText('Reach')).toBeInTheDocument();
    await userEvent.click(within(strong).getByRole('button', { name: /Fit and gap/ }));
    const fit = within(strong).getByRole('list', { name: 'Fit' });
    expect(fit).toHaveTextContent('Design tokens: DTCG pipeline');
    expect(within(fit).getByRole('link', { name: /HDS/ })).toHaveAttribute(
      'href',
      'https://example.com/hds',
    );
    expect(within(strong).getByRole('list', { name: 'Gap' })).toHaveTextContent(
      'Storybook / visual regression',
    );
  });

  it('filters to strong fits', async () => {
    await withEvidence();
    await userEvent.click(screen.getByRole('radio', { name: 'Strong fit (1)' }));
    const items = within(screen.getByRole('list', { name: /live postings/i })).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Design Systems Engineer');
  });

  it('rolls up what the postings ask for, covered vs thin', async () => {
    await withEvidence();
    await userEvent.click(screen.getByRole('button', { name: /What these postings ask for/ }));
    expect(screen.getByRole('list', { name: 'Thin or not shown' })).toHaveTextContent(
      'Storybook / visual regression · 2 of 2',
    );
    expect(screen.getByRole('list', { name: 'Covered by your evidence' })).toHaveTextContent(
      'Design system ownership · 2 of 2',
    );
  });

  it('saving keeps the fit on the job', async () => {
    await withEvidence();
    await userEvent.click(
      within(row('Design Systems Engineer')).getByRole('button', { name: 'Save' }),
    );
    const job = getAllJobs().find((j) => j.url === 'https://jobs.ashbyhq.com/newco/1');
    expect(job?.verdict).toBe('match');
  });

  it('keeps the evidence on this device', async () => {
    await withEvidence();
    cleanup();
    renderPanel();
    await screen.findByRole('list', { name: /live postings/i });
    // Filled-in evidence starts collapsed so the postings lead.
    await userEvent.click(screen.getByRole('button', { name: 'Your evidence (4)' }));
    expect(screen.getByRole('textbox', { name: 'Your evidence' })).toHaveValue(EVIDENCE);
  });

  it('has no WCAG A/AA violations with fits showing', async () => {
    await withEvidence();
    const results = await axe(document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
