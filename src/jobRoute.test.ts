import { describe, expect, it } from 'vitest';
import { jobHref, jobUrlFromSub } from './jobRoute';
import { parseHash } from './route';

describe('job route', () => {
  it('round-trips a job url through the hash', () => {
    const url = 'https://boards.greenhouse.io/acme/jobs/42?gh_src=x#frag';
    const r = parseHash(jobHref(url));
    expect(r.tab).toBe('queue');
    expect(jobUrlFromSub(r.sub)).toBe(url);
  });
  it('ignores sub-routes that are not job urls', () => {
    expect(jobUrlFromSub(null)).toBeNull();
    expect(jobUrlFromSub('titles')).toBeNull();
    expect(jobUrlFromSub('%E0%A4%A')).toBeNull();
  });
});
