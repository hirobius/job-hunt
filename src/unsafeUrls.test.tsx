// Defence in depth (security audit #2, #3): a link from a third-party feed, the YC mirror, a synced
// tile or a synced job only becomes an href when it is http(s). `javascript:` and `data:` links are
// dropped (a posting, a job) or shown as plain text (a tile, a company's website).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';
import {
  parseAshbyJob,
  parseGreenhouseJob,
  parseLeverJob,
  parseTeamtailorJob,
  parseWorkableJob,
} from './feed/sources/ats';
import { parseRemotiveJob } from './feed/sources/remotive';
import { parseJobicyJob } from './feed/sources/jobicy';
import { parseRemoteOkJob } from './feed/sources/remoteok';
import { sanitizeJobs } from './store';
import { httpUrl, safeJobUrl } from './httpUrl';
import TileGrid from './TileGrid';

const BAD = ['javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>1</script>'];

afterEach(cleanup);

describe.each(BAD)('a %j link', (bad) => {
  it('is never a posting from any feed', () => {
    expect(parseGreenhouseJob({ id: 1, title: 'T', absolute_url: bad }, 'acme')).toBeNull();
    expect(parseLeverJob({ id: 'a', text: 'T', hostedUrl: bad }, 'acme')).toBeNull();
    expect(parseAshbyJob({ id: 'a', title: 'T', jobUrl: bad }, 'acme')).toBeNull();
    expect(parseWorkableJob({ shortcode: 'a', title: 'T', url: bad }, 'acme')).toBeNull();
    expect(
      parseTeamtailorJob(
        { id: '1', attributes: { title: 'T', url: bad }, links: { 'careersite-job-url': bad } },
        'acme',
      ),
    ).toBeNull();
    expect(parseRemotiveJob({ id: 1, title: 'T', url: bad })).toBeNull();
    expect(parseJobicyJob({ id: 1, jobTitle: 'T', url: bad })).toBeNull();
    expect(parseRemoteOkJob({ id: '1', position: 'T', url: bad })).toBeNull();
  });

  it('is dropped from a synced or restored job list', () => {
    const jobs = sanitizeJobs([
      { url: bad, label: 'Evil', status: 'Saved' },
      { url: 'https://jobs.example.org/1', label: 'Fine', status: 'Saved' },
    ]);
    expect(jobs.map((j) => j.label)).toEqual(['Fine']);
  });

  it('never becomes an href on a tile', () => {
    render(
      <ToastProvider>
        <TileGrid tiles={[{ name: 'Evil tile', meta: '', url: bad }]} />
      </ToastProvider>,
    );
    const card = screen.getByRole('article', { name: 'Evil tile' });
    expect(within(card).queryAllByRole('link')).toEqual([]);
    expect(card.querySelector('a[href]')).toBeNull();
  });

  it('fails both checks', () => {
    expect(httpUrl(bad)).toBeUndefined();
    expect(safeJobUrl(bad)).toBe(false);
  });
});

describe('web links still work', () => {
  it('the same postings with an https link parse (so the nulls above are the link)', () => {
    const ok = 'https://jobs.example.org/1';
    expect(parseGreenhouseJob({ id: 1, title: 'T', absolute_url: ok }, 'acme')).not.toBeNull();
    expect(parseLeverJob({ id: 'a', text: 'T', hostedUrl: ok }, 'acme')).not.toBeNull();
    expect(parseAshbyJob({ id: 'a', title: 'T', jobUrl: ok }, 'acme')).not.toBeNull();
    expect(parseWorkableJob({ shortcode: 'a', title: 'T', url: ok }, 'acme')).not.toBeNull();
    expect(
      parseTeamtailorJob({ id: '1', attributes: { title: 'T', url: ok } }, 'acme'),
    ).not.toBeNull();
    expect(parseJobicyJob({ id: 1, jobTitle: 'T', url: ok })).not.toBeNull();
    expect(parseRemoteOkJob({ id: '1', position: 'T', url: ok })).not.toBeNull();
  });

  it('a posting with an https link parses', () => {
    expect(parseRemotiveJob({ id: 1, title: 'T', url: 'https://remotive.com/job/1' })?.url).toBe(
      'https://remotive.com/job/1',
    );
  });

  it('a job saved without a scheme, or with no link at all, is kept (the store allows both)', () => {
    expect(safeJobUrl('acme.example/jobs/1')).toBe(true);
    expect(safeJobUrl('notes:fabricator')).toBe(true);
    expect(
      sanitizeJobs([
        { url: 'acme.example/jobs/1', status: 'Saved' },
        { url: 'notes:fabricator', status: 'Saved' },
      ]),
    ).toHaveLength(2);
  });

  it('a tile with an https link opens', () => {
    render(
      <ToastProvider>
        <TileGrid tiles={[{ name: 'Good tile', meta: '', url: 'https://example.org/jobs' }]} />
      </ToastProvider>,
    );
    const card = screen.getByRole('article', { name: 'Good tile' });
    expect(card.querySelectorAll('a[href="https://example.org/jobs"]').length).toBeGreaterThan(0);
  });
});
