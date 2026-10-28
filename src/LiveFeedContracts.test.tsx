import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({
      upsert: async () => ({ error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

import LiveFeedPanel from './LiveFeedPanel';
import { addCategory, replaceCurationState } from './curation/curationStore';
import { EMPTY_CURATION } from './curation/types';
import { NO_KEY_MESSAGE, type SamOpportunity } from './contracts/sam';
import { clearSamCache } from './feed/sources/sam';
import { readMustInclude } from './feed/mustInclude';
import { getAllJobs } from './store';
import { followUpDate } from './jobEvents';

const OPP: SamOpportunity = {
  id: 'abc123',
  title: 'HVAC sheet metal ductwork',
  agency: 'DEPT OF DEFENSE',
  url: 'https://sam.gov/opp/abc123/view',
  postedDate: '2026-10-20',
  responseDeadline: '2099-11-05',
  naics: '332322',
  type: 'Solicitation',
  city: 'Spokane',
  state: 'WA',
};

const fetchMock = vi.fn();
const answer = (status: number, body: unknown) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

let cat: string;
beforeEach(() => {
  localStorage.clear();
  clearSamCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Contracts', seniority: 'any', location: 'Spokane, WA' });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderPanel = () =>
  render(
    <ToastProvider>
      <LiveFeedPanel categoryId={cat} terms={[]} boardUrls={[]} />
    </ToastProvider>,
  );
const sourceRow = () => screen.getByRole('region', { name: 'Contracts source' });

describe('Live postings on a Contracts track', () => {
  it('without the key, the SAM.gov row says which variable to set and where', async () => {
    answer(503, { error: NO_KEY_MESSAGE });
    renderPanel();
    expect(
      await within(sourceRow()).findByText(
        'SAM_GOV_API_KEY is not set: add it in Vercel → Settings → Environment Variables',
      ),
    ).toBeInTheDocument();
    expect(within(sourceRow()).getByText('Off')).toBeInTheDocument();
    expect(screen.getByText('SAM.gov didn’t answer')).toBeInTheDocument();
  });

  it('reads only same-origin /api/sam, with the default codes and the track’s state', async () => {
    answer(200, { opportunities: [] });
    renderPanel();
    await within(sourceRow()).findByText(/0 open solicitations/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0], 'https://app.test');
    expect(url.origin + url.pathname).toBe('https://app.test/api/sam');
    expect(url.searchParams.get('naics')).toBe('332322,332312,541511,541512,541430');
    expect(url.searchParams.get('state')).toBe('WA');
    expect(within(sourceRow()).getByText(/last 30 days · Washington/)).toBeInTheDocument();
  });

  it('saves a solicitation as a Job whose follow-up date is its response deadline', async () => {
    answer(200, { opportunities: [OPP] });
    renderPanel();
    const list = await screen.findByRole('list', { name: 'Live postings' });
    expect(within(list).getByText('HVAC sheet metal ductwork')).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: /^save/i }));
    const job = getAllJobs().find((j) => j.url === OPP.url)!;
    expect(job).toMatchObject({ company: 'DEPT OF DEFENSE', deadline: '2099-11-05' });
    expect(job.note).toMatch(/SAM\.gov · Response due 2099-11-05/);
    expect(followUpDate(job, new Date())).toBe('2099-11-05');
  });

  it('the NAICS codes are the track’s own, edited on the row', async () => {
    answer(200, { opportunities: [] });
    renderPanel();
    await within(sourceRow()).findByText(/0 open solicitations/);
    const field = within(sourceRow()).getByRole('textbox', { name: 'Add a NAICS code' });
    await userEvent.type(field, 'abc{Enter}');
    expect(within(sourceRow()).getByText(/2 to 6 digits/)).toBeInTheDocument();
    await userEvent.type(field, '336{Enter}');
    expect(readMustInclude(cat).naics).toEqual([
      '332322',
      '332312',
      '541511',
      '541512',
      '541430',
      '336',
    ]);
    await userEvent.click(within(sourceRow()).getByRole('button', { name: 'Remove 332322' }));
    expect(readMustInclude(cat).naics).not.toContain('332322');
    await userEvent.click(
      within(sourceRow()).getByRole('button', { name: 'Use the default codes' }),
    );
    expect(readMustInclude(cat).naics).toEqual(['332322', '332312', '541511', '541512', '541430']);
  });

  it('a term narrows the list without reading SAM.gov again', async () => {
    answer(200, {
      opportunities: [
        OPP,
        { ...OPP, id: 'x2', title: 'Website redesign', url: 'https://sam.gov/opp/x2/view' },
      ],
    });
    renderPanel();
    await screen.findByText('Website redesign');
    await userEvent.type(screen.getByRole('textbox', { name: 'Search term' }), 'ductwork{Enter}');
    expect(screen.queryByText('Website redesign')).not.toBeInTheDocument();
    expect(screen.getByText('HVAC sheet metal ductwork')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
