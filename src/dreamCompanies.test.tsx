// Dream companies on a scored track (src/tracks): the check lists what the scorer queued, nothing
// folded away, so the row's "N new" matches the roles it shows with a New badge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DreamCompanies from './DreamCompanies';
import { starDream } from './feed/dreams';
import { createLimiter } from './feed/probe';
import { foldRoles } from './feed/roleType';

const TITLES = ['Frontend Engineer, Design Systems', 'Senior Design Systems Designer'];
const fakeFetch = vi.fn(
  async () =>
    new Response(
      JSON.stringify(
        TITLES.map((text, i) => ({
          id: `d${i}`,
          text,
          hostedUrl: `https://jobs.lever.co/dsco/d${i}`,
          categories: { location: 'Remote' },
          descriptionPlain: 'Grow our design system.',
        })),
      ),
      { status: 200 },
    ),
);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', fakeFetch);
  starDream('t1', { company: 'Dsco', board: { kind: 'lever', slug: 'dsco' } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Dream companies on a scored track', () => {
  it('folds nothing away: every queued role is listed, and each new one is badged', async () => {
    // The premise: on an unscored design-systems track this role would be folded.
    const eng = { title: TITLES[0], text: '' };
    expect(foldRoles([eng], true).folded).toEqual([eng]);
    render(
      <DreamCompanies
        categoryId="t1"
        terms={['design system']}
        limiter={createLimiter()}
        roleTypes={{ ranked: true, fold: true }}
        include={{ terms: ['design system'] }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Check dream companies' }));
    const roles = await screen.findByRole('list', { name: 'Open roles at Dsco' });
    expect(within(roles).getByText(TITLES[0])).toBeVisible();
    expect(screen.queryByText(/engineering-heavy/)).toBeNull();
    const shown = within(roles).getAllByRole('listitem').length;
    expect(within(roles).getAllByText('New')).toHaveLength(shown);
    expect(screen.getByText(`Lever · ${shown} matching roles · ${shown} new`)).toBeVisible();
  });
});
