import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobTitleBlock } from './JobHeader';
import { dueBadgeOf } from './jobDates';
import type { Job } from './types';

// #538: title, company, one facts line, then an amber badge only for a date that needs action.
const NOW = new Date(2026, 10, 10, 12); // Tue, Nov 10 2026
const base: Job = { url: 'https://x.test/1', label: 'Design Systems Lead', status: 'Saved' };

describe('dueBadgeOf', () => {
  it('names the weekday and days left for a deadline within the week', () => {
    expect(dueBadgeOf({ ...base, deadline: '2026-11-13' }, NOW)).toEqual({
      kind: 'closing',
      label: 'Closes Fri, Nov 13 · 3 days',
    });
  });
  it('is null with no deadline, or one far off: a missing deadline is not a status', () => {
    expect(dueBadgeOf(base, NOW)).toBeNull();
    expect(dueBadgeOf({ ...base, deadline: '2026-12-30' }, NOW)).toBeNull();
  });
  it('says how long since you applied when a follow-up is due', () => {
    const b = dueBadgeOf({ ...base, status: 'Applied', applied: '2026-10-29' }, NOW);
    expect(b).toEqual({ kind: 'followup', label: 'Follow-up due · 12 days since you applied' });
  });
});

describe('JobTitleBlock', () => {
  it('leads with the title, then "Company not stated" and the facts with "Pay not stated"', () => {
    render(<JobTitleBlock job={{ ...base, location: 'Remote' }} />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Design Systems Lead' });
    expect(h1.className).toContain('rjb-break');
    expect(screen.getByText('Company not stated')).toBeInTheDocument();
    const facts = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(facts.slice(0, 2)).toEqual(['Remote', 'Pay not stated']);
    expect(screen.queryByText('Saved')).toBeNull();
    expect(document.querySelector('[data-tone="info"]')).toBeNull();
  });
  it("puts the company's 24px inline mark before its name, as on Find cards", () => {
    const { container } = render(<JobTitleBlock job={{ ...base, company: 'Harbor Atlas' }} />);
    const mark = container.querySelector('[data-rjb-logo]');
    expect(mark).toHaveClass('rjb-logo-inline');
    expect(mark?.nextElementSibling).toHaveTextContent('Harbor Atlas');
  });

  it('shows stated pay and a company', () => {
    render(<JobTitleBlock job={{ ...base, company: 'Lattice Freight', salary: '$150k–$185k' }} />);
    expect(screen.getByText('Lattice Freight')).toBeInTheDocument();
    expect(screen.getByText('$150k–$185k')).toBeInTheDocument();
  });
  it('draws a due follow-up as an amber badge with an icon; other status is neutral', () => {
    const today = new Date();
    const applied = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 12);
    const ymd = applied.toLocaleDateString('en-CA');
    render(<JobTitleBlock job={{ ...base, status: 'Applied', applied: ymd }} />);
    const due = screen.getByText(/^Follow-up due/).closest('[data-tone]')!;
    expect(due).toHaveAttribute('data-tone', 'warning');
    expect(due.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Applied').closest('[data-tone]')).toHaveAttribute(
      'data-tone',
      'neutral',
    );
  });
});
