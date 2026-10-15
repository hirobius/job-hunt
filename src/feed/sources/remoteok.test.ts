import { describe, expect, it } from 'vitest';
import { fetchRemoteOk, parseRemoteOkJob, REMOTEOK_URL } from './remoteok';

const legal = {
  last_updated: 1760000000,
  legal: 'By using the API you agree to link back to Remote OK.',
};
const job = {
  id: '9001',
  slug: 'remote-design-engineer-acme-9001',
  url: 'https://remoteOK.com/remote-jobs/remote-design-engineer-acme-9001',
  position: 'Design Engineer',
  company: 'Acme',
  location: 'Worldwide',
  tags: ['design', 'frontend', 'contract'],
  date: '2026-10-12T10:00:00+00:00',
  description: '<p>Build the <b>design system</b>.</p>',
  salary_min: 100000,
  salary_max: 150000,
};

describe('parseRemoteOkJob', () => {
  it('normalizes a job and keeps their url exactly as given', () => {
    const p = parseRemoteOkJob(job)!;
    expect(p).toMatchObject({
      id: 'remoteok:9001',
      source: 'remoteok',
      title: 'Design Engineer',
      company: 'Acme',
      url: job.url,
      location: 'Worldwide',
      mode: 'remote',
      postedAt: '2026-10-12T10:00:00+00:00',
      salaryMin: 100000,
      salaryMax: 150000,
      currency: 'USD',
    });
    expect(p.text).toBe('Tags: design, frontend, contract\nBuild the design system.');
  });

  it('treats zero or missing salary as unstated', () => {
    const p = parseRemoteOkJob({ ...job, salary_min: 0, salary_max: 0 })!;
    expect(p.salaryMin).toBeUndefined();
    expect(p.currency).toBeUndefined();
  });

  it('skips the legal notice row and junk', () => {
    expect(parseRemoteOkJob(legal)).toBeNull();
    expect(parseRemoteOkJob({ ...job, url: '' })).toBeNull();
    expect(parseRemoteOkJob(null)).toBeNull();
  });

  it('tolerates every optional field missing', () => {
    const p = parseRemoteOkJob({ id: 1, url: 'https://remoteok.com/remote-jobs/1' })!;
    expect(p).toMatchObject({ title: '', company: '', text: '' });
  });
});

describe('fetchRemoteOk', () => {
  it('drops the legal element, and filters by term client-side (the API has no search)', async () => {
    let seen = '';
    const other = {
      ...job,
      id: '9002',
      url: 'https://remoteok.com/remote-jobs/9002',
      position: 'Chef',
      description: 'cook',
      tags: [],
    };
    const out = await fetchRemoteOk('design system', async (u) => {
      seen = u;
      return [legal, job, other];
    });
    expect(seen).toBe(REMOTEOK_URL);
    expect(out.map((p) => p.id)).toEqual(['remoteok:9001']);
  });

  it('a non-array body is an empty list', async () => {
    expect(await fetchRemoteOk('design system', async () => ({}))).toEqual([]);
  });
});
