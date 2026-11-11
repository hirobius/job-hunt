// Badges are neutral except what needs attention (rev-3 B): the Pipeline's cards, the job rail and
// the Company page show status and fit in the neutral tone, like the job header and the phone
// cards. Only what needs attention is a warning: a due follow-up, a closing date within 7 days (#419).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';
import JobListCard from './JobListCard';
import JobRail from './JobRail';
import CompanyPage from './CompanyPage';
import { addJob, getAllJobs, jobIdOf, removeJob, updateJob } from './store';

const URL_A = 'https://acme.example/jobs/1';
const URL_B = 'https://acme.example/jobs/2';
const URL_C = 'https://acme.example/jobs/3';

const seed = () => {
  addJob(URL_A, 'Product Designer');
  updateJob(URL_A, { company: 'Acme', status: 'Offer', verdict: 'match' });
  addJob(URL_B, 'UX Researcher');
  updateJob(URL_B, { company: 'Acme', status: 'Interviewing', verdict: 'stretch' });
  addJob(URL_C, 'Design Engineer');
  updateJob(URL_C, { company: 'Acme', status: 'Applied', verdict: 'reach' });
};

/** Every badge tone on screen except the warnings. */
const nonNeutral = (el: Element) =>
  [...el.querySelectorAll('[data-tone]')]
    .map((b) => b.getAttribute('data-tone'))
    .filter((t) => t !== 'neutral' && t !== 'warning');

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('neutral badges on desktop (rev-3 B)', () => {
  it('the Pipeline cards show status and fit neutral', () => {
    seed();
    const { container } = render(
      <ToastProvider>
        {getAllJobs().map((j) => (
          <JobListCard key={j.url} job={j} />
        ))}
      </ToastProvider>,
    );
    expect(container.querySelectorAll('[data-tone]').length).toBeGreaterThan(0);
    expect(nonNeutral(container)).toEqual([]);
  });

  it('the job rail uses the shared badge row: neutral status, no fit chips (#538)', () => {
    seed();
    const { container } = render(<JobRail openId={jobIdOf(URL_A)} />);
    expect(container.textContent).not.toContain('Strong fit');
    expect(nonNeutral(container)).toEqual([]);
  });

  it('the Company page lists its jobs with neutral status', () => {
    seed();
    const { container } = render(<CompanyPage slug="acme" />);
    expect(container.textContent).toContain('Offer');
    expect(nonNeutral(container)).toEqual([]);
  });
});
