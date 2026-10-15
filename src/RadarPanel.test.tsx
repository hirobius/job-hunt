// Role Radar (docs/specs/role-radar.md), first pass: a "Radar" view inside Live postings. It scans
// many company boards on demand, tiers what matches the search against the user's own evidence,
// says what each posting asks for that the evidence covers (Fit) and doesn't (Gap), and rolls the
// asks up across the scan. Driven by role + name, with the network stubbed at the scan seam.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { axe } from 'vitest-axe';
import type { ScanResult } from './radar/scan';

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
const radar = vi.hoisted(() => ({ scanBoards: vi.fn() }));
vi.mock('./radar/scan', async (orig) => ({
  ...(await orig<typeof import('./radar/scan')>()),
  scanBoards: radar.scanBoards,
}));

import LiveFeedPanel from './LiveFeedPanel';
import { getAllJobs, removeJob } from './store';
import { addCategory, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { STARTER_DIRECTORY } from './radar/directory';

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

const SCAN: ScanResult = {
  postings: [
    posting(
      '1',
      'Design Systems Engineer',
      'Own the design system: design tokens, accessibility, a component library, Storybook.',
    ),
    posting('2', 'Design Systems Designer', 'Work on our design systems with Storybook and Figma.'),
    posting('4', 'Product Engineer', 'Ship features against our design systems.'),
    posting('3', 'Backend Engineer', 'Postgres only.'),
  ],
  boards: [
    { key: 'ashby:newco', label: 'Newco', outcome: 'ok', openings: 3 },
    { key: 'ashby:gone', label: 'Gone', outcome: 'closed', openings: 0 },
    { key: 'ashby:down', label: 'Down', outcome: 'unreachable', openings: 0 },
  ],
};

const EVIDENCE = `Design system ownership: HDS (https://example.com/hds)
Design tokens: DTCG pipeline
Accessibility: axe and contrast gates
Component library: 53 components on npm`;

let cat: string;
beforeEach(() => {
  localStorage.clear();
  feed.fetchFeed.mockReset().mockResolvedValue({ postings: [], sources: [], boardsSkipped: 0 });
  radar.scanBoards.mockReset().mockResolvedValue(SCAN);
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Design Systems' });
});
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

const openRadar = async () => {
  render(
    <ToastProvider>
      <LiveFeedPanel
        categoryId={cat}
        terms={['design systems']}
        boardUrls={['https://jobs.ashbyhq.com/newco']}
        where=""
        mode="any"
        onWhere={() => {}}
        onMode={() => {}}
      />
    </ToastProvider>,
  );
  await userEvent.click(screen.getByRole('radio', { name: 'Radar' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your evidence' }), {
    target: { value: EVIDENCE },
  });
  await userEvent.click(
    screen.getByRole('button', {
      name: `Scan ${STARTER_DIRECTORY.length + 1} company boards`,
    }),
  );
  await screen.findByRole('heading', { name: /^Strong/ });
};

describe('Role Radar (first pass)', () => {
  it('scans on demand: watched boards first, then the starter directory', async () => {
    await openRadar();
    const boards = radar.scanBoards.mock.calls[0][0];
    expect(boards[0]).toEqual({ kind: 'ashby', slug: 'newco' });
    expect(boards).toHaveLength(STARTER_DIRECTORY.length + 1);
    // Nothing is fetched until asked: the Postings view's own feed is separate.
    expect(
      screen.getByText('1 board read · 1 closed (Gone) · 1 didn’t answer (Down)'),
    ).toBeInTheDocument();
  });

  it('tiers matching postings against the evidence; non-matches are left out', async () => {
    await openRadar();
    const strong = screen.getByRole('region', { name: /^Strong/ });
    expect(
      within(strong).getByRole('link', { name: /^Design Systems Engineer/ }),
    ).toBeInTheDocument();
    const reach = screen.getByRole('region', { name: /^Reach/ });
    expect(
      within(reach).getByRole('link', { name: /^Design Systems Designer/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Backend Engineer')).toBeNull();
  });

  it('keeps description-only matches out until asked for', async () => {
    await openRadar();
    expect(screen.queryByRole('link', { name: /^Product Engineer/ })).toBeNull();
    expect(
      screen.getByText(
        '2 with “design systems” in the title. 1 more only mention it in the description.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show those too' }));
    expect(screen.getByRole('link', { name: /^Product Engineer/ })).toBeInTheDocument();
  });

  it('shows Fit with the proof and Gap per posting', async () => {
    await openRadar();
    const strong = screen.getByRole('region', { name: /^Strong/ });
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

  it('rolls up what the postings ask for, covered vs thin', async () => {
    await openRadar();
    const patterns = screen.getByRole('region', { name: 'What these postings ask for' });
    expect(within(patterns).getByRole('list', { name: 'Thin or not shown' })).toHaveTextContent(
      'Storybook / visual regression · 2 of 2',
    );
    expect(
      within(patterns).getByRole('list', { name: 'Covered by your evidence' }),
    ).toHaveTextContent('Design system ownership · 2 of 2');
  });

  it('saving a posting adds it to the Pipeline with its tier as the fit', async () => {
    await openRadar();
    const strong = screen.getByRole('region', { name: /^Strong/ });
    await userEvent.click(
      within(strong).getByRole('button', { name: 'Save: Design Systems Engineer' }),
    );
    const job = getAllJobs().find((j) => j.url === 'https://jobs.ashbyhq.com/newco/1');
    expect(job?.verdict).toBe('match');
    expect(job?.label).toBe('Design Systems Engineer');
  });

  it('keeps the evidence on this device between visits', async () => {
    await openRadar();
    cleanup();
    render(
      <ToastProvider>
        <LiveFeedPanel
          categoryId={cat}
          terms={['design systems']}
          boardUrls={[]}
          where=""
          mode="any"
          onWhere={() => {}}
          onMode={() => {}}
        />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Radar' }));
    // Filled-in evidence starts collapsed, so the scan and results lead.
    await userEvent.click(screen.getByRole('button', { name: 'Your evidence (4)' }));
    expect(screen.getByRole('textbox', { name: 'Your evidence' })).toHaveValue(EVIDENCE);
  });

  it('has no WCAG A/AA violations with results showing', async () => {
    await openRadar();
    const results = await axe(document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    expect(results.violations.map((v) => `${v.id} ×${v.nodes.length}`)).toEqual([]);
  });
});
