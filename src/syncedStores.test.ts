// The four user-edited stores that sync with the account (ADR 0008): each can be replaced from a
// pull / restore, notifies subscribers, merges by its key, and re-renders a hook.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAllTargets,
  mergeTargets,
  replaceTargets,
  saveTarget,
  useAllTargets,
  TARGETS_KEY,
  type Target,
} from './feed/targets';
import {
  getAllFilters,
  mergeFilters,
  replaceFilters,
  saveFilter,
  useFilters,
  type SavedFilter,
} from './feed/savedFilters';
import {
  EVIDENCE_MAX,
  mergeEvidence,
  readEvidence,
  replaceEvidence,
  useEvidence,
} from './radar/evidenceStore';
import {
  getAllModes,
  mergeModes,
  modeKey,
  readMode,
  replaceModes,
  useAllModes,
  writeMode,
} from './trackModes';

const tgt = (login: string, o: Partial<Target> = {}): Target => ({
  login,
  company: login,
  repo: `${login}/ds`,
  repoUrl: `https://github.com/${login}/ds`,
  stars: 1,
  savedAt: '2026-10-01T00:00:00.000Z',
  ...o,
});
const srch = (name: string, o: Partial<SavedFilter> = {}): SavedFilter => ({
  name,
  term: 't',
  where: '',
  mode: 'any',
  exclude: [],
  seniority: 'any',
  salaryOnly: false,
  contractOnly: false,
  ...o,
});

beforeEach(() => localStorage.clear());

describe('targets', () => {
  it('replaceTargets swaps the store, persists, and notifies a live hook', () => {
    saveTarget('t1', tgt('old'));
    const { result } = renderHook(() => useAllTargets());
    expect(Object.keys(result.current)).toEqual(['t1']);
    act(() => replaceTargets({ t2: [tgt('new')] }));
    expect(Object.keys(result.current)).toEqual(['t2']);
    expect(getAllTargets().t2[0].login).toBe('new');
    expect(localStorage.getItem(TARGETS_KEY)).toContain('new');
  });

  it('replaceTargets sanitizes what it is given', () => {
    replaceTargets({ t1: [{ nope: 1 } as unknown as Target, tgt('ok')] });
    expect(getAllTargets().t1.map((t) => t.login)).toEqual(['ok']);
  });

  it('merge: union by login ignoring case, cloud wins, local-only kept', () => {
    const out = mergeTargets(
      { a: [tgt('ACME', { stars: 9 })] },
      { a: [tgt('acme'), tgt('mine')], b: [tgt('x')] },
    );
    expect(out.a.map((t) => [t.login, t.stars])).toEqual([
      ['ACME', 9],
      ['mine', 1],
    ]);
    expect(out.b).toHaveLength(1);
  });
});

describe('saved searches', () => {
  it('replaceFilters notifies a live per-track hook; saving also notifies', () => {
    const { result } = renderHook(() => useFilters('t1'));
    expect(result.current).toEqual([]);
    act(() => replaceFilters({ t1: [srch('Cloud')] }));
    expect(result.current.map((f) => f.name)).toEqual(['Cloud']);
    act(() => void saveFilter('t1', srch('Local')));
    expect(result.current.map((f) => f.name)).toEqual(['Cloud', 'Local']);
    expect(getAllFilters().t1).toHaveLength(2);
  });

  it('merge: union by name ignoring case, cloud wins, capped at 12', () => {
    const out = mergeFilters(
      { a: [srch('austin', { term: 'cloud' })] },
      { a: [srch('Austin'), srch('Mine')] },
    );
    expect(out.a.map((f) => [f.name, f.term])).toEqual([
      ['austin', 'cloud'],
      ['Mine', 't'],
    ]);
    const many = Array.from({ length: 20 }, (_, i) => srch(`s${i}`));
    expect(mergeFilters({ a: many }, {}).a).toHaveLength(12);
  });
});

describe('evidence', () => {
  it('replaceEvidence persists and notifies a live hook', () => {
    const { result } = renderHook(() => useEvidence());
    act(() => replaceEvidence('Led a design system'));
    expect(result.current).toBe('Led a design system');
    expect(readEvidence()).toBe('Led a design system');
  });

  it.each([
    ['cloud text wins', 'c', 'l', 'c'],
    ['blank cloud keeps local', '  ', 'l', 'l'],
    ['both empty', '', '', ''],
  ])('merge: %s', (_n, c, l, want) => expect(mergeEvidence(c, l)).toBe(want));

  it('notifies subscribers on every write', () => {
    const spy = vi.fn();
    const { result } = renderHook(() => {
      const v = useEvidence();
      spy(v);
      return v;
    });
    act(() => replaceEvidence('a'));
    act(() => replaceEvidence('ab'));
    expect(result.current).toBe('ab');
  });
});

describe('evidence size cap', () => {
  it('writes are trimmed to EVIDENCE_MAX', () => {
    replaceEvidence('x'.repeat(EVIDENCE_MAX + 50));
    expect(readEvidence()).toHaveLength(EVIDENCE_MAX);
  });
});

describe('work mode per track', () => {
  it('getAllModes lists explicit choices (sorted); replaceModes swaps them and notifies', () => {
    writeMode('b', 'remote');
    writeMode('a', 'hybrid');
    expect(Object.keys(getAllModes())).toEqual(['a', 'b']);
    const { result } = renderHook(() => useAllModes());
    expect(result.current).toEqual({ a: 'hybrid', b: 'remote' });
    act(() => replaceModes({ c: 'onsite' }));
    expect(result.current).toEqual({ c: 'onsite' });
    expect(readMode('a')).toBe('any');
    expect(localStorage.getItem(modeKey('c'))).toBe('onsite');
  });

  it('replaceModes ignores malformed entries', () => {
    replaceModes({ a: 'sideways', b: 'remote' } as never);
    expect(getAllModes()).toEqual({ b: 'remote' });
  });

  it('merge: union by track, cloud wins', () => {
    expect(mergeModes({ a: 'remote' }, { a: 'hybrid', b: 'onsite' })).toEqual({
      a: 'remote',
      b: 'onsite',
    });
  });
});
