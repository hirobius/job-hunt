import { describe, expect, it } from 'vitest';
import { buildLinkList, linksFilename } from './exportLinks';
import { BRAND } from './brand';
import type { Job } from './types';

const job = (url: string, label = '', company?: string): Job =>
  ({ url, label, company, status: 'Saved' }) as Job;

describe('buildLinkList', () => {
  it.each([
    {
      name: 'links only: one URL per line, in the given order',
      jobs: [job('https://b.co/2', 'B'), job('https://a.co/1', 'A')],
      format: 'links' as const,
      text: 'https://b.co/2\nhttps://a.co/1',
      count: 2,
      skipped: 0,
    },
    {
      name: 'with title and company: heading, URL, blank line between jobs',
      jobs: [job('https://a.co/1', 'Welder', 'Acme'), job('https://b.co/2', 'Fitter', 'Bolt')],
      format: 'titled' as const,
      text: 'Welder — Acme\nhttps://a.co/1\n\nFitter — Bolt\nhttps://b.co/2',
      count: 2,
      skipped: 0,
    },
    {
      name: 'a missing company drops the dash; a missing title keeps the company',
      jobs: [job('https://a.co/1', 'Welder'), job('https://b.co/2', '', 'Bolt')],
      format: 'titled' as const,
      text: 'Welder\nhttps://a.co/1\n\nBolt\nhttps://b.co/2',
      count: 2,
      skipped: 0,
    },
    {
      name: 'no title or company: the URL alone',
      jobs: [job('https://a.co/1')],
      format: 'titled' as const,
      text: 'https://a.co/1',
      count: 1,
      skipped: 0,
    },
    {
      name: 'jobs without a web link are skipped and counted',
      jobs: [job('', 'Blank'), job('manual:123', 'Manual'), job('https://a.co/1', 'A')],
      format: 'links' as const,
      text: 'https://a.co/1',
      count: 1,
      skipped: 2,
    },
    {
      name: 'identical URLs appear once, at the first place they appear',
      jobs: [job('https://a.co/1', 'A'), job('https://b.co/2'), job('https://a.co/1', 'A again')],
      format: 'titled' as const,
      text: 'A\nhttps://a.co/1\n\nhttps://b.co/2',
      count: 2,
      skipped: 0,
    },
    {
      name: 'surrounding whitespace is trimmed before deduping',
      jobs: [job(' https://a.co/1 '), job('https://a.co/1')],
      format: 'links' as const,
      text: 'https://a.co/1',
      count: 1,
      skipped: 0,
    },
    {
      name: 'nothing to export',
      jobs: [],
      format: 'links' as const,
      text: '',
      count: 0,
      skipped: 0,
    },
  ])('$name', ({ jobs, format, text, count, skipped }) => {
    expect(buildLinkList(jobs, format)).toEqual({ text, count, skipped });
  });
});

describe('linksFilename', () => {
  it('is the brand slug, "links" and the local date', () => {
    expect(linksFilename(new Date(2026, 9, 22, 23, 30))).toBe(`${BRAND.slug}-links-2026-10-22.txt`);
    expect(linksFilename(new Date(2026, 0, 5))).toBe(`${BRAND.slug}-links-2026-01-05.txt`);
  });
});
