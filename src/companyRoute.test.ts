// Company routes (#230): #/company/<slug>, built from a company name's slug.
import { afterEach, describe, expect, it } from 'vitest';
import { buildHash, companyHash, getRoute, openCompany, parseHash } from './route';
import { companyBySlug, companySlug } from './companies';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('company routes', () => {
  it.each([
    ['Acme Widgets, Inc.', '#/company/acme-widgets'],
    ['Café', '#/company/cafe'],
    ['株式会社', '#/company/' + encodeURIComponent('株式会社')],
  ])('%j → %j, and it parses back to the company', (name, hash) => {
    const slug = companySlug(name);
    expect(companyHash(slug)).toBe(hash);
    const r = parseHash(hash);
    expect(r).toEqual({ tab: 'company', sub: hash.split('/')[2], pillar: null, jobId: null });
    expect(buildHash(r)).toBe(hash);
    // The parsed sub finds the company again, escaped or not.
    const jobs = [
      { url: 'https://x.example/1', label: 'R', status: 'Saved' as const, company: name },
    ];
    expect(companyBySlug(r.sub!, jobs, [])?.name).toBe(name);
  });

  it('openCompany navigates to the company page and drops any job id', () => {
    window.location.hash = '#/queue/abc';
    openCompany('acme');
    expect(getRoute()).toEqual({ tab: 'company', sub: 'acme', pillar: null, jobId: null });
  });
});
