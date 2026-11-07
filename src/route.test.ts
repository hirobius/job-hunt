import { describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import {
  parseHash,
  buildHash,
  jobHash,
  isAuthCallback,
  withOrigin,
  originOf,
  goBackTo,
  navigate,
  getRoute,
  subscribeScrollRestore,
  backInFlight,
  redirectOf,
  type Route,
} from './route';
import { jobIdOf } from './store';

describe('route — parseHash', () => {
  it('reads an empty hash as no route', () => {
    expect(parseHash('')).toEqual({ tab: '', sub: null, pillar: null, jobId: null });
    expect(parseHash('#')).toEqual({ tab: '', sub: null, pillar: null, jobId: null });
    expect(parseHash('#/')).toEqual({ tab: '', sub: null, pillar: null, jobId: null });
  });

  it('reads a top-level tab', () => {
    expect(parseHash('#/apply')).toEqual({ tab: 'apply', sub: null, pillar: null, jobId: null });
  });

  it('reads a nested sub-tab', () => {
    expect(parseHash('#/discover/titles')).toEqual({
      tab: 'discover',
      sub: 'titles',
      pillar: null,
      jobId: null,
    });
  });

  it('reads a template id as the sub under copy-deck (#132)', () => {
    expect(parseHash('#/copy-deck/tpl-cover')).toEqual({
      tab: 'copy-deck',
      sub: 'tpl-cover',
      pillar: null,
      jobId: null,
    });
    expect(buildHash(parseHash('#/copy-deck/tpl-cover'))).toBe('#/copy-deck/tpl-cover');
  });

  it('reads the pillar query param', () => {
    expect(parseHash('#/discover/ats?pillar=abc123')).toEqual({
      tab: 'discover',
      sub: 'ats',
      pillar: 'abc123',
      jobId: null,
    });
  });

  it('tolerates a missing leading slash', () => {
    expect(parseHash('#apply')).toEqual({ tab: 'apply', sub: null, pillar: null, jobId: null });
  });
});

describe('route — a sign-in callback is not a route', () => {
  it.each([
    '#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=magiclink',
    '#error=access_denied&error_code=otp_expired',
    '#code=abc',
  ])('%s', (hash) => expect(isAuthCallback(parseHash(hash))).toBe(true));

  it.each(['', '#/apply', '#/discover/ats?pillar=abc', '#/nope'])('%s is not one', (hash) =>
    expect(isAuthCallback(parseHash(hash))).toBe(false),
  );
});

describe('route — buildHash', () => {
  it('serializes tab only', () => {
    expect(buildHash({ tab: 'apply', sub: null, pillar: null, jobId: null })).toBe('#/apply');
  });

  it('serializes tab + sub', () => {
    expect(buildHash({ tab: 'discover', sub: 'titles', pillar: null, jobId: null })).toBe(
      '#/discover/titles',
    );
  });

  it('serializes the pillar param', () => {
    expect(buildHash({ tab: 'discover', sub: 'ats', pillar: 'abc', jobId: null })).toBe(
      '#/discover/ats?pillar=abc',
    );
  });

  it('round-trips through parse', () => {
    const r = { tab: 'discover', sub: 'titles', pillar: 'p1', jobId: null };
    expect(parseHash(buildHash(r))).toEqual(r);
  });
});

// #127: a job has its own route, #/apply/<jobId>. The id is derived from the job's URL (Job has no
// id field), so it must be URL-safe and must not collide with Discover's sub-tab slot.
describe('route — job ids (#127)', () => {
  it('reads #/apply/<jobId> as a job, not a sub-tab', () => {
    expect(parseHash('#/apply/k3x9a1')).toEqual({
      tab: 'apply',
      sub: null,
      pillar: null,
      jobId: 'k3x9a1',
    });
  });

  it('keeps Discover sub-tabs as sub-tabs', () => {
    expect(parseHash('#/discover/titles').jobId).toBeNull();
  });

  it('round-trips a job route built from a URL with a query string', () => {
    const id = jobIdOf('https://boards.greenhouse.io/acme/jobs/42?gh_jid=42&utm_source=x');
    const hash = buildHash({ tab: 'apply', sub: null, pillar: null, jobId: id });
    expect(hash).toBe(`#/apply/${id}`);
    expect(parseHash(hash).jobId).toBe(id);
  });
});

describe('route — navigate drops a stale job id (#127)', () => {
  it('a tab change without a job id clears it', async () => {
    const { navigate, getRoute } = await import('./route');
    window.location.hash = '#/apply/abc123';
    navigate({ tab: 'find' });
    expect(getRoute()).toMatchObject({ tab: 'find', jobId: null });
  });
});

describe('jobHash (#128)', () => {
  it('is the job route that parseHash reads back', () => {
    expect(jobHash('k3x9a1')).toBe('#/apply/k3x9a1');
    expect(parseHash(jobHash('k3x9a1')).jobId).toBe('k3x9a1');
  });
});

// Return paths (Adrian 2026-10-22): a page opened by a key action carries where it was opened
// from, so its Back can name that page and go there, and browser back/forward and reloads keep it.
describe('route — the origin a page was opened from', () => {
  it('reads and writes `from` as a hash path, round-tripping through parse and build', () => {
    const r = parseHash('#/company/acme?from=%2Fapply%2Fk3x9a1');
    expect(r).toEqual({
      tab: 'company',
      sub: 'acme',
      pillar: null,
      jobId: null,
      from: '/apply/k3x9a1',
    });
    expect(buildHash(r)).toBe('#/company/acme?from=%2Fapply%2Fk3x9a1');
  });

  it("round-trips an origin that has its own origin and a job page's section", () => {
    const r = {
      tab: 'apply',
      sub: null,
      pillar: null,
      jobId: 'k3x9a1',
      section: 'screening',
      from: '/company/acme?from=%2Ffind',
    };
    expect(parseHash(buildHash(r))).toEqual(r);
  });

  it('reads the job page section only on a job route', () => {
    expect(parseHash('#/apply/k3x9a1?section=interviews').section).toBe('interviews');
    expect(parseHash('#/apply?section=interviews').section).toBeUndefined();
  });

  it('leaves both out of a hash that has neither', () => {
    expect(buildHash(parseHash('#/apply/k3x9a1'))).toBe('#/apply/k3x9a1');
  });

  it('keeps every path segment after the tab as the sub (the New document editor)', () => {
    expect(parseHash('#/copy-deck/new/outreach').sub).toBe('new/outreach');
    expect(buildHash(parseHash('#/copy-deck/new/outreach?from=%2Fapply%2Fx'))).toBe(
      '#/copy-deck/new/outreach?from=%2Fapply%2Fx',
    );
  });
});

describe('route — withOrigin records where a jump came from', () => {
  const at = (hash: string) => parseHash(hash);
  const company: Partial<Route> & { tab: string } = { tab: 'company', sub: 'acme' };

  it('records the page it was opened on', () => {
    expect(buildHash(withOrigin(company, at('#/apply/A?section=screening')))).toBe(
      '#/company/acme?from=%2Fapply%2FA%3Fsection%3Dscreening',
    );
  });

  it("leaves it out when the origin is the page's own default way back", () => {
    // A job, a Company and Documents go back to the Apply list by default; an open document goes
    // back to the library; the legal pages to Find.
    expect(buildHash(withOrigin({ tab: 'apply', jobId: 'A' }, at('#/apply')))).toBe('#/apply/A');
    expect(buildHash(withOrigin({ tab: 'copy-deck' }, at('#/apply')))).toBe('#/copy-deck');
    expect(buildHash(withOrigin({ tab: 'copy-deck', sub: 'd1' }, at('#/copy-deck')))).toBe(
      '#/copy-deck/d1',
    );
    expect(buildHash(withOrigin({ tab: 'legal', sub: 'privacy' }, at('#/find')))).toBe(
      '#/legal/privacy',
    );
  });

  it("keeps one level of the origin's own origin, so two Backs still work", () => {
    const job = at('#/apply/A?from=%2Ffind');
    const onCompany = withOrigin(company, job);
    expect(originOf(onCompany)).toMatchObject({
      tab: 'apply',
      jobId: 'A',
      from: '/find',
    });
    // From the Company page on to another job: the job's own origin is dropped (one level kept).
    const next = withOrigin({ tab: 'apply', jobId: 'B' }, onCompany);
    // An origin on the old Company route reads as its new one (#471 slice 2).
    expect(originOf(next)).toMatchObject({ tab: 'apply', sub: 'company/acme', from: '/apply/A' });
    expect(originOf(originOf(next)!)?.from).toBeUndefined();
  });

  it("going back to the page the origin came from reuses that page's own origin (no loop)", () => {
    const onCompany = withOrigin(company, at('#/apply/A?from=%2Ffind'));
    expect(buildHash(withOrigin({ tab: 'apply', jobId: 'A' }, onCompany))).toBe(
      '#/apply/A?from=%2Ffind',
    );
    const plain = withOrigin(company, at('#/apply/A'));
    expect(buildHash(withOrigin({ tab: 'apply', jobId: 'A' }, plain))).toBe('#/apply/A');
  });

  it('a route with no origin has none to read', () => {
    expect(originOf(at('#/apply/A'))).toBeNull();
  });
});

// Back goes back: when the page to return to is an earlier entry in this tab's history, Back pops
// to it (so the browser's own Back doesn't bounce into the page just left); otherwise it replaces
// the current entry with it.
describe('route — goBackTo', () => {
  const settle = () => new Promise((r) => setTimeout(r, 30));

  it('pops back to an earlier entry for that page instead of pushing it again', async () => {
    window.location.hash = '#/apply';
    await settle();
    window.location.hash = '#/apply/back1';
    await settle();
    window.location.hash = '#/company/back1-co?from=%2Fapply%2Fback1';
    await settle();
    const length = window.history.length;
    goBackTo(parseHash('#/apply'));
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
    expect(window.history.length).toBe(length);
    // The entries left behind are still forward, as after the browser's Back.
    window.history.forward();
    await waitFor(() => expect(window.location.hash).toBe('#/apply/back1'));
  });

  it('lands on the earlier entry as it was (its section and origin), matched by page', async () => {
    window.location.hash = '#/apply/back2?section=screening&from=%2Ffind';
    await settle();
    window.location.hash = '#/company/back2-co';
    await settle();
    goBackTo(parseHash('#/apply/back2'));
    await waitFor(() => expect(getRoute()).toMatchObject({ jobId: 'back2', section: 'screening' }));
  });

  // Review blockers (2026-10-22): a double click, or a click handler and a fallback effect in the
  // same tick, called goBackTo twice before the first pop landed, and the second pop overshot.
  it('is single-flight: a second call before the pop lands does not pop again', async () => {
    window.location.hash = '#/discover/apply';
    await settle();
    window.location.hash = '#/apply';
    await settle();
    window.location.hash = '#/apply/twice1';
    await settle();
    // jsdom lands two same-tick pops on one entry (Chromium overshoots): count the traversals.
    const go = vi.spyOn(window.history, 'go');
    goBackTo(parseHash('#/apply'));
    goBackTo(parseHash('#/apply'));
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
    await settle();
    const calls = go.mock.calls.length;
    go.mockRestore();
    expect(window.location.hash).toBe('#/apply');
    expect(calls).toBe(1);
  });

  it('a navigation asked for while a pop is in flight waits for it, and is a no-op onto the same page', async () => {
    window.location.hash = '#/discover/apply';
    await settle();
    window.location.hash = '#/apply';
    await settle();
    window.location.hash = '#/apply/twice2';
    await settle();
    const restored: string[] = [];
    const stop = subscribeScrollRestore((h) => restored.push(h));
    goBackTo(parseHash('#/apply'));
    // The job page's fallback (the job just went away): the Pipeline, in place.
    navigate({ tab: 'apply', jobId: null }, true);
    await waitFor(() => expect(window.location.hash).toBe('#/apply'));
    await settle();
    stop();
    expect(window.location.hash).toBe('#/apply');
    // A real revisit: the list's scroll is asked back, and the job's entry is still ahead.
    expect(restored).toContain('#/apply');
    window.history.forward();
    await waitFor(() => expect(window.location.hash).toBe('#/apply/twice2'));
  });

  it('a goBackTo to another page asked while a pop is in flight runs once it has landed', async () => {
    window.location.hash = '#/copy-deck/d8';
    await settle();
    window.location.hash = '#/company/twice3-co';
    await settle();
    window.location.hash = '#/apply/twice3?from=%2Fcompany%2Ftwice3-co';
    await settle();
    goBackTo(parseHash('#/company/twice3-co'));
    expect(backInFlight()).toBe(true);
    // Asked again before the pop lands: once it has, the Company is behind no more, so this one
    // goes on to where it was then asked to go (a document), exactly once.
    goBackTo(parseHash('#/copy-deck/d8'));
    await waitFor(() => expect(window.location.hash).toBe('#/copy-deck/d8'));
    await settle();
    expect(window.location.hash).toBe('#/copy-deck/d8');
    expect(backInFlight()).toBe(false);
  });

  it('replaces the current entry when the page is not behind it (a cold load)', async () => {
    window.location.hash = '#/legal/terms?from=%2Fcopy-deck%2Fd9';
    await settle();
    const length = window.history.length;
    goBackTo(parseHash('#/copy-deck/d9'));
    await waitFor(() => expect(window.location.hash).toBe('#/copy-deck/d9'));
    expect(window.history.length).toBe(length);
  });
});

describe('route — navigate keeps an origin with its page', () => {
  it('drops the origin and section when the page changes, unless they are named', () => {
    window.location.hash = '#/apply/nav1?section=interviews&from=%2Fcompany%2Fco';
    navigate({ jobId: 'nav2' });
    expect(getRoute()).toMatchObject({ jobId: 'nav2' });
    expect(getRoute().from).toBeFalsy();
    expect(getRoute().section).toBeFalsy();
    navigate({ jobId: 'nav3', from: '/company/co' });
    expect(getRoute().from).toBe('/company/co');
  });

  it('keeps them while the page stays the same', () => {
    window.location.hash = '#/apply/nav4?from=%2Fcompany%2Fco';
    navigate({ section: 'screening' }, true);
    expect(window.location.hash).toBe('#/apply/nav4?section=screening&from=%2Fcompany%2Fco');
  });
});

describe('route — old routes redirect in place (simplify Q6, #471: two tabs, Find and Apply)', () => {
  const find = { tab: 'find', sub: null, pillar: null, jobId: null };
  it.each([
    ['#/discover', find],
    ['#/discover/live?from=%2Ftoday', find],
    ['#/discover/teams?pillar=abc', find],
    ['#/apprenticeships', find],
    ['#/today', find],
    ['#/queue', { tab: 'apply', sub: null, pillar: null, jobId: null }],
    ['#/queue/k3x9a1', { tab: 'apply', sub: null, pillar: null, jobId: 'k3x9a1' }],
    [
      '#/queue/k3x9a1?from=%2Ftoday',
      { tab: 'apply', sub: null, pillar: null, jobId: 'k3x9a1', from: '/today' },
    ],
    ['#/find', null],
    ['#/apply', null],
    ['#/apply/k3x9a1', null],
    ['#/company/acme', { tab: 'apply', sub: 'company/acme', pillar: null, jobId: null }],
    ['#/apply/company/acme', null],
    ['', null],
  ])('%s → %o', (hash, to) => {
    expect(redirectOf(parseHash(hash))).toEqual(to);
  });

  it('an old origin reads as its new route', () => {
    expect(originOf(parseHash('#/company/acme?from=%2Fqueue%2Fk3x9a1'))).toMatchObject({
      tab: 'apply',
      jobId: 'k3x9a1',
    });
    expect(originOf(parseHash('#/apply/A?from=%2Ftoday'))).toMatchObject({ tab: 'find' });
  });

  it('a link to an old route reads, and then shows, as its new one, in place', async () => {
    window.location.hash = '#/apply';
    await waitFor(() => expect(getRoute().tab).toBe('apply'));
    const steps = window.history.length;
    window.location.hash = '#/discover/live';
    expect(getRoute()).toMatchObject({ tab: 'find', sub: null });
    await waitFor(() => expect(window.location.hash).toBe('#/find'));
    // The old hash's entry became Find's: one step, as for any link.
    expect(window.history.length).toBe(steps + 1);
    window.location.hash = '#/queue/k3x9a1';
    expect(getRoute()).toMatchObject({ tab: 'apply', jobId: 'k3x9a1' });
    await waitFor(() => expect(window.location.hash).toBe('#/apply/k3x9a1'));
    window.location.hash = '#/today';
    await waitFor(() => expect(window.location.hash).toBe('#/find'));
  });

  it('navigate and goBackTo never write an old route', async () => {
    navigate({ tab: 'discover', sub: 'ats' });
    expect(window.location.hash).toBe('#/find');
    window.location.hash = '#/legal/terms';
    await waitFor(() => expect(getRoute().tab).toBe('legal'));
    goBackTo(parseHash('#/discover/ats'));
    await waitFor(() => expect(window.location.hash).toBe('#/find'));
    navigate({ tab: 'queue', sub: 'k3x9a1' });
    expect(window.location.hash).toBe('#/apply/k3x9a1');
  });
});
