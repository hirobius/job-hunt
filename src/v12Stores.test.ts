// The three v12 stores (sources, profile, decided): sanitize, merge, the small API the Feed uses,
// and the sync base's three-way rule for them.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addSources,
  getSources,
  mergeSources,
  muteSource,
  replaceSources,
  sanitizeSources,
  sourceBoard,
  sourceKey,
  starSource,
  useSources,
  type Source,
} from './sources';
import {
  getProfile,
  mergeProfiles,
  profileTitles,
  replaceProfiles,
  sanitizeProfiles,
  updateProfile,
  useProfile,
  type Profile,
} from './profile';
import { decided, getDecided, mergeDecided, postingFingerprint, replaceDecided } from './decided';
import { emptyBlob, mergeBlob, type SyncData } from './syncBlob';
import { hashesOf, keysOf } from './syncBase';

const src = (kind: Source['kind'], ref: string, o: Partial<Source> = {}): Source => ({
  kind,
  ref,
  label: ref,
  ...o,
});
const prof = (o: Partial<Profile> = {}): Profile => ({
  id: 'main',
  label: 'Design Systems',
  titles: ['Design Systems Designer', 'UI Engineer'],
  titlesOff: ['UI Engineer'],
  atsRoles: [],
  atsOff: [],
  include: { terms: ['design system'] },
  leaveOut: [],
  level: 'any',
  location: '',
  mode: 'any',
  createdAt: '2026-10-28T00:00:00.000Z',
  ...o,
});

beforeEach(() => {
  localStorage.clear();
  replaceSources([]);
  replaceProfiles([]);
  replaceDecided([]);
});

describe('sources', () => {
  it('sanitizes: bad kinds, slugs and feeds drop; one per key ignoring case', () => {
    const out = sanitizeSources([
      src('greenhouse', 'figma'),
      src('greenhouse', 'Figma', { star: true }),
      { kind: 'workday', ref: 'x', label: 'x' },
      src('lever', 'bad slug!'),
      src('feed', 'nope'),
      src('feed', 'hn'),
      { kind: 'company', ref: 'acme', label: 'Acme', website: 'javascript:alert(1)' },
    ]);
    expect(out.map(sourceKey)).toEqual(['greenhouse:figma', 'feed:hn', 'company:acme']);
    expect(out[2].website).toBeUndefined();
  });

  it('a board Source reads back as its Board (EU host kept)', () => {
    expect(sourceBoard(src('lever', 'spotify', { eu: true }))).toEqual({
      kind: 'lever',
      slug: 'spotify',
      eu: true,
    });
    expect(sourceBoard(src('company', 'acme'))).toBeNull();
  });

  it('merge: union, cloud wins on star/mute, nothing known is lost', () => {
    const out = mergeSources(
      [src('ashby', 'ramp', { muted: true, addedAt: '2026-10-02' })],
      [
        src('ashby', 'ramp', { website: 'https://ramp.com/', addedAt: '2026-10-01' }),
        src('feed', 'hn'),
      ],
    );
    expect(out).toEqual([
      src('ashby', 'ramp', { muted: true, website: 'https://ramp.com/', addedAt: '2026-10-01' }),
      src('feed', 'hn'),
    ]);
  });

  it('add / star / mute through the store, live', () => {
    const { result } = renderHook(() => useSources());
    act(() => void addSources([src('greenhouse', 'figma'), src('greenhouse', 'FIGMA')]));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].addedAt).toBeTruthy();
    act(() => void starSource('greenhouse:figma', true));
    act(() => void muteSource('greenhouse:figma', true));
    expect(result.current[0]).toMatchObject({ star: true, muted: true });
    act(() => void muteSource('greenhouse:figma', false));
    expect(getSources()[0].muted).toBeUndefined();
    expect(addSources([src('greenhouse', 'figma', { star: true })])).toBe(0);
  });
});

describe('profile', () => {
  it('sanitizes: off lists only name entries of their list; bad fields default', () => {
    const [p] = sanitizeProfiles([
      {
        ...prof(),
        titlesOff: ['UI Engineer', 'Not a title'],
        mode: 'moon',
        level: 'x',
        scorer: 'y',
      },
    ]);
    expect(p.titlesOff).toEqual(['UI Engineer']);
    expect(p.mode).toBe('any');
    expect(p.level).toBe('any');
    expect(p.scorer).toBeUndefined();
    expect(profileTitles(p)).toEqual(['Design Systems Designer']);
  });

  it("merge: cloud wins on the same id and the cloud's first profile stays first", () => {
    const out = mergeProfiles(
      [prof({ location: 'Remote' })],
      [prof({ id: 'second' }), prof({ location: 'Spokane' })],
    );
    expect(out.map((p) => [p.id, p.location])).toEqual([
      ['main', 'Remote'],
      ['second', ''],
    ]);
  });

  it('useProfile / updateProfile', () => {
    const { result } = renderHook(() => useProfile());
    expect(result.current).toBeNull();
    expect(updateProfile({ location: 'x' })).toBe(false);
    act(() => replaceProfiles([prof()]));
    act(() => void updateProfile({ location: 'Remote', mode: 'remote' }));
    expect(result.current).toMatchObject({ id: 'main', location: 'Remote', mode: 'remote' });
    expect(getProfile()?.createdAt).toBe('2026-10-28T00:00:00.000Z');
  });
});

describe('decided', () => {
  const fp = postingFingerprint({ company: 'Stripe', title: 'Senior Design Systems Engineer' });

  it('keys by posting, not company: seniority words do not split a posting', () => {
    expect(fp).toBe(postingFingerprint({ company: 'Stripe', title: 'Design Systems Engineer' }));
    expect(fp).not.toBe(postingFingerprint({ company: 'Stripe', title: 'Product Designer' }));
  });

  it('set / get / has / undo, live', () => {
    const { result } = renderHook(() => decided.use());
    let prev: ReturnType<typeof decided.set> = null;
    act(() => void (prev = decided.set(fp, 'skipped', '2026-10-01T00:00:00.000Z')));
    expect(decided.has(fp)).toBe(true);
    expect(result.current.get(fp)?.verdict).toBe('skipped');
    act(() => void decided.set(fp, 'saved', '2026-10-02T00:00:00.000Z'));
    expect(decided.get(fp)?.verdict).toBe('saved');
    act(() => decided.undo(fp, prev));
    expect(decided.get(fp)?.verdict).toBe('skipped');
    act(() => decided.undo(fp));
    expect(decided.has(fp)).toBe(false);
    expect(getDecided()).toEqual([]);
  });

  it('merge: the later decision wins', () => {
    const a = { fingerprint: 'x', verdict: 'skipped' as const, at: '2026-10-02' };
    const b = { fingerprint: 'x', verdict: 'saved' as const, at: '2026-10-01' };
    expect(mergeDecided([b], [a])).toEqual([a]);
    expect(mergeDecided([a], [b])).toEqual([a]);
  });
});

describe('sync base (#219) for the v12 fields', () => {
  const blob = (o: Partial<SyncData>): SyncData => ({ ...emptyBlob(), sourceV: 12, ...o });

  it('a Source or decision removed on one device stays removed after a sign-in merge', () => {
    const was = blob({
      sources: [src('feed', 'hn'), src('greenhouse', 'figma')],
      decided: [{ fingerprint: 'x', verdict: 'skipped', at: '2026-10-01' }],
    });
    const base = keysOf(was);
    const local = blob({ sources: [src('feed', 'hn')], decided: [] }); // removed here
    const out = mergeBlob(was, local, true, base, hashesOf(was));
    expect(out.sources.map(sourceKey)).toEqual(['feed:hn']);
    expect(out.decided).toEqual([]);
  });

  it("a star set here is not undone by the cloud's unchanged copy", () => {
    const was = blob({ sources: [src('greenhouse', 'figma')] });
    const local = blob({ sources: [src('greenhouse', 'figma', { star: true })] });
    const out = mergeBlob(was, local, true, keysOf(was), hashesOf(was));
    expect(out.sources[0].star).toBe(true);
  });
});
