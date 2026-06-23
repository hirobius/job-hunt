import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractJob } from './extractJob';

afterEach(() => vi.unstubAllGlobals());

// Minimal fetch stub — the client only calls res.json().
function stubFetch(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => body }) as unknown as Response),
  );
}

describe('extractJob client', () => {
  it('returns the job on success', async () => {
    stubFetch({
      ok: true,
      source: 'link',
      job: {
        title: 'Frontend Engineer',
        company: 'Acme',
        location: 'Remote',
        seniority: 'Senior',
        salary: '',
        requirements: ['React'],
        matched: ['React'],
        gaps: [],
      },
    });
    const r = await extractJob({ url: 'https://x.com/job' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.job.title).toBe('Frontend Engineer');
      expect(r.source).toBe('link');
    }
  });

  it('surfaces a fallback error', async () => {
    stubFetch({ error: 'thin_content', fallback: 'paste', message: 'paste it' });
    const r = await extractJob({ url: 'https://x.com/job' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('thin_content');
      expect(r.fallback).toBe('paste');
    }
  });

  it('handles a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down');
      }),
    );
    const r = await extractJob({ text: 'a job description' });
    expect(r).toMatchObject({ ok: false, error: 'network' });
  });
});
