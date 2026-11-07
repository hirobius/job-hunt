// Company routes (#230; #471 slice 2): #/apply/company/<slug>, built from a company name's slug.
// The old #/company/<slug> redirects there.
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildHash,
  companyHash,
  companySlugOf,
  getRoute,
  openCompany,
  parseHash,
  redirectOf,
} from './route';
import { companyBySlug, companySlug } from './companies';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('company routes', () => {
  it.each([
    ['Acme Widgets, Inc.', '#/apply/company/acme-widgets'],
    ['Café', '#/apply/company/cafe'],
    ['株式会社', '#/apply/company/' + encodeURIComponent('株式会社')],
  ])('%j → %j, and it parses back to the company', (name, hash) => {
    const slug = companySlug(name);
    expect(companyHash(slug)).toBe(hash);
    const r = parseHash(hash);
    const slugPart = hash.split('/')[3];
    expect(r).toEqual({ tab: 'apply', sub: `company/${slugPart}`, pillar: null, jobId: null });
    expect(companySlugOf(r)).toBe(slugPart);
    expect(buildHash(r)).toBe(hash);
    // The old hash lands on the same page.
    expect(redirectOf(parseHash(`#/company/${slugPart}`))).toEqual(r);
    // The parsed slug finds the company again, escaped or not.
    const jobs = [
      { url: 'https://x.example/1', label: 'R', status: 'Saved' as const, company: name },
    ];
    expect(companyBySlug(companySlugOf(r)!, jobs, [])?.name).toBe(name);
  });

  it('a job id is a job, never read as a company', () => {
    expect(companySlugOf(parseHash('#/apply/abc'))).toBeNull();
    expect(companySlugOf(parseHash('#/apply'))).toBeNull();
  });

  it('openCompany navigates to the company page and drops any job id', () => {
    window.location.hash = '#/apply/abc';
    openCompany('acme');
    expect(getRoute()).toEqual({ tab: 'apply', sub: 'company/acme', pillar: null, jobId: null });
    expect(window.location.hash).toBe('#/apply/company/acme');
  });
});
