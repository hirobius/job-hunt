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
    expect(parseHash('#/queue')).toEqual({ tab: 'queue', sub: null, pillar: null, jobId: null });
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
    expect(parseHash('#queue')).toEqual({ tab: 'queue', sub: null, pillar: null, jobId: null });
  });
});

describe('route — a sign-in callback is not a route', () => {
  it.each([
    '#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=magiclink',
    '#error=access_denied&error_code=otp_expired',
    '#code=abc',
  ])('%s', (hash) => expect(isAuthCallback(parseHash(hash))).toBe(true));

  it.each(['', '#/queue', '#/discover/ats?pillar=abc', '#/nope'])('%s is not one', (hash) =>
    expect(isAuthCallback(parseHash(hash))).toBe(false),
  );
});

describe('route — buildHash', () => {
  it('serializes tab only', () => {
    expect(buildHash({ tab: 'queue', sub: null, pillar: null, jobId: null })).toBe('#/queue');
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

// #127: a job has its own route, #/queue/<jobId>. The id is derived from the job's URL (Job has no
// id field), so it must be URL-safe and must not collide with Discover's sub-tab slot.
describe('route — job ids (#127)', () => {
  it('reads #/queue/<jobId> as a job, not a sub-tab', () => {
    expect(parseHash('#/queue/k3x9a1')).toEqual({
      tab: 'queue',
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
    const hash = buildHash({ tab: 'queue', sub: null, pillar: null, jobId: id });
    expect(hash).toBe(`#/queue/${id}`);
    expect(parseHash(hash).jobId).toBe(id);
  });
});

describe('route — navigate drops a stale job id (#127)', () => {
  it('a tab change without a job id clears it', async () => {
    const { navigate, getRoute } = await import('./route');
    window.location.hash = '#/queue/abc123';
    navigate({ tab: 'discover' });
    expect(getRoute()).toMatchObject({ tab: 'discover', jobId: null });
  });
});

describe('jobHash (#128)', () => {
  it('is the job route that parseHash reads back', () => {
    expect(jobHash('k3x9a1')).toBe('#/queue/k3x9a1');
    expect(parseHash(jobHash('k3x9a1')).jobId).toBe('k3x9a1');
  });
});

// Return paths (Adrian 2026-10-22): a page opened by a key action carries where it was opened
// from, so its Back can name that page and go there, and browser back/forward and reloads keep it.
describe('route — the origin a page was opened from', () => {
  it('reads and writes `from` as a hash path, round-tripping through parse and build', () => {
    const r = parseHash('#/company/acme?from=%2Fqueue%2Fk3x9a1');
    expect(r).toEqual({
      tab: 'company',
      sub: 'acme',
      pillar: null,
      jobId: null,
      from: '/queue/k3x9a1',
    });
    expect(buildHash(r)).toBe('#/company/acme?from=%2Fqueue%2Fk3x9a1');
  });

  it("round-trips an origin that has its own origin and a job page's section", () => {
    const r = {
      tab: 'queue',
      sub: null,
      pillar: null,
      jobId: 'k3x9a1',
      section: 'screening',
      from: '/company/acme?from=%2Fdiscover%2Fapply',
    };
    expect(parseHash(buildHash(r))).toEqual(r);
  });

  it('reads the job page section only on a job route', () => {
    expect(parseHash('#/queue/k3x9a1?section=interviews').section).toBe('interviews');
    expect(parseHash('#/queue?section=interviews').section).toBeUndefined();
  });

  it('leaves both out of a hash that has neither', () => {
    expect(buildHash(parseHash('#/queue/k3x9a1'))).toBe('#/queue/k3x9a1');
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
    expect(buildHash(withOrigin(company, at('#/queue/A?section=screening')))).toBe(
      '#/company/acme?from=%2Fqueue%2FA%3Fsection%3Dscreening',
    );
  });

  it("leaves it out when the origin is the page's own default way back", () => {
    // A job, Apply mode, a Company and Documents go back to the Pipeline list by default; an open
    // document goes back to the library; the legal pages to Companies.
    expect(buildHash(withOrigin({ tab: 'queue', jobId: 'A' }, at('#/queue')))).toBe('#/queue/A');
    expect(buildHash(withOrigin({ tab: 'copy-deck' }, at('#/queue')))).toBe('#/copy-deck');
    expect(buildHash(withOrigin({ tab: 'copy-deck', sub: 'd1' }, at('#/copy-deck')))).toBe(
      '#/copy-deck/d1',
    );
    expect(buildHash(withOrigin({ tab: 'legal', sub: 'privacy' }, at('#/discover')))).toBe(
      '#/legal/privacy',
    );
  });

  it("keeps one level of the origin's own origin, so two Backs still work", () => {
    const job = at('#/queue/A?from=%2Fdiscover%2Fapply');
    const onCompany = withOrigin(company, job);
    expect(originOf(onCompany)).toMatchObject({
      tab: 'queue',
      jobId: 'A',
      from: '/discover/apply',
    });
    // From the Company page on to another job: the job's own origin is dropped (one level kept).
    const next = withOrigin({ tab: 'queue', jobId: 'B' }, onCompany);
    expect(originOf(next)).toMatchObject({ tab: 'company', sub: 'acme', from: '/queue/A' });
    expect(originOf(originOf(next)!)?.from).toBeUndefined();
  });

  it("going back to the page the origin came from reuses that page's own origin (no loop)", () => {
    const onCompany = withOrigin(company, at('#/queue/A?from=%2Fdiscover%2Fapply'));
    expect(buildHash(withOrigin({ tab: 'queue', jobId: 'A' }, onCompany))).toBe(
      '#/queue/A?from=%2Fdiscover%2Fapply',
    );
    const plain = withOrigin(company, at('#/queue/A'));
    expect(buildHash(withOrigin({ tab: 'queue', jobId: 'A' }, plain))).toBe('#/queue/A');
  });

  it('a route with no origin has none to read', () => {
    expect(originOf(at('#/queue/A'))).toBeNull();
  });
});

// Back goes back: when the page to return to is an earlier entry in this tab's history, Back pops
// to it (so the browser's own Back doesn't bounce into the page just left); otherwise it replaces
// the current entry with it.
describe('route — goBackTo', () => {
  const settle = () => new Promise((r) => setTimeout(r, 30));

  it('pops back to an earlier entry for that page instead of pushing it again', async () => {
    window.location.hash = '#/queue';
    await settle();
    window.location.hash = '#/queue/back1';
    await settle();
    window.location.hash = '#/company/back1-co?from=%2Fqueue%2Fback1';
    await settle();
    const length = window.history.length;
    goBackTo(parseHash('#/queue'));
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
    expect(window.history.length).toBe(length);
    // The entries left behind are still forward, as after the browser's Back.
    window.history.forward();
    await waitFor(() => expect(window.location.hash).toBe('#/queue/back1'));
  });

  it('lands on the earlier entry as it was (its section and origin), matched by page', async () => {
    window.location.hash = '#/queue/back2?section=screening&from=%2Fdiscover%2Fapply';
    await settle();
    window.location.hash = '#/company/back2-co';
    await settle();
    goBackTo(parseHash('#/queue/back2'));
    await waitFor(() => expect(getRoute()).toMatchObject({ jobId: 'back2', section: 'screening' }));
  });

  // Review blockers (2026-10-22): a double click, or a click handler and a fallback effect in the
  // same tick, called goBackTo twice before the first pop landed, and the second pop overshot.
  it('is single-flight: a second call before the pop lands does not pop again', async () => {
    window.location.hash = '#/discover/apply';
    await settle();
    window.location.hash = '#/queue';
    await settle();
    window.location.hash = '#/queue/twice1';
    await settle();
    // jsdom lands two same-tick pops on one entry (Chromium overshoots): count the traversals.
    const go = vi.spyOn(window.history, 'go');
    goBackTo(parseHash('#/queue'));
    goBackTo(parseHash('#/queue'));
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
    await settle();
    const calls = go.mock.calls.length;
    go.mockRestore();
    expect(window.location.hash).toBe('#/queue');
    expect(calls).toBe(1);
  });

  it('a navigation asked for while a pop is in flight waits for it, and is a no-op onto the same page', async () => {
    window.location.hash = '#/discover/apply';
    await settle();
    window.location.hash = '#/queue';
    await settle();
    window.location.hash = '#/queue/twice2';
    await settle();
    const restored: string[] = [];
    const stop = subscribeScrollRestore((h) => restored.push(h));
    goBackTo(parseHash('#/queue'));
    // The job page's fallback (the job just went away): the Pipeline, in place.
    navigate({ tab: 'queue', jobId: null }, true);
    await waitFor(() => expect(window.location.hash).toBe('#/queue'));
    await settle();
    stop();
    expect(window.location.hash).toBe('#/queue');
    // A real revisit: the list's scroll is asked back, and the job's entry is still ahead.
    expect(restored).toContain('#/queue');
    window.history.forward();
    await waitFor(() => expect(window.location.hash).toBe('#/queue/twice2'));
  });

  it('a goBackTo to another page asked while a pop is in flight runs once it has landed', async () => {
    window.location.hash = '#/discover/ats';
    await settle();
    window.location.hash = '#/company/twice3-co';
    await settle();
    window.location.hash = '#/queue/twice3?from=%2Fcompany%2Ftwice3-co';
    await settle();
    goBackTo(parseHash('#/company/twice3-co'));
    expect(backInFlight()).toBe(true);
    // Asked again before the pop lands: once it has, the Company is behind no more, so this one
    // goes on to where it was then asked to go (the ATS search), exactly once.
    goBackTo(parseHash('#/discover/ats'));
    await waitFor(() => expect(window.location.hash).toBe('#/discover/ats'));
    await settle();
    expect(window.location.hash).toBe('#/discover/ats');
    expect(backInFlight()).toBe(false);
  });

  it('replaces the current entry when the page is not behind it (a cold load)', async () => {
    window.location.hash = '#/legal/terms?from=%2Fdiscover%2Fats';
    await settle();
    const length = window.history.length;
    goBackTo(parseHash('#/discover/ats'));
    await waitFor(() => expect(window.location.hash).toBe('#/discover/ats'));
    expect(window.history.length).toBe(length);
  });
});

describe('route — navigate keeps an origin with its page', () => {
  it('drops the origin and section when the page changes, unless they are named', () => {
    window.location.hash = '#/queue/nav1?section=interviews&from=%2Fcompany%2Fco';
    navigate({ jobId: 'nav2' });
    expect(getRoute()).toMatchObject({ jobId: 'nav2' });
    expect(getRoute().from).toBeFalsy();
    expect(getRoute().section).toBeFalsy();
    navigate({ jobId: 'nav3', from: '/company/co' });
    expect(getRoute().from).toBe('/company/co');
  });

  it('keeps them while the page stays the same', () => {
    window.location.hash = '#/queue/nav4?from=%2Fcompany%2Fco';
    navigate({ section: 'screening' }, true);
    expect(window.location.hash).toBe('#/queue/nav4?section=screening&from=%2Fcompany%2Fco');
  });
});
