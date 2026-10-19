import { describe, expect, it } from 'vitest';
import { memoryKv } from './fetchFeed';
import {
  CORE_PER_HOUR,
  GH_BUDGET_KEY,
  SEARCH_PER_MINUTE,
  createGithubBudget,
} from './githubBudget';

const setup = () => {
  const kv = memoryKv();
  let t = 1_000_000;
  const mk = () => createGithubBudget({ kv, now: () => t });
  return { kv, mk, tick: (ms: number) => (t += ms), at: () => t };
};

describe('github budget', () => {
  it('allows 8 searches a minute, then says when the next one is free', () => {
    const { mk, tick, at } = setup();
    const b = mk();
    const start = at();
    for (let i = 0; i < SEARCH_PER_MINUTE; i++) {
      expect(b.reserve('search')).toEqual({ ok: true });
      tick(1000);
    }
    expect(b.reserve('search')).toEqual({ ok: false, until: start + 60_000 });
    tick(60_000 - 8000 + 1);
    expect(b.reserve('search')).toEqual({ ok: true });
  });

  it('allows 40 core calls an hour, separately from searches', () => {
    const { mk, tick } = setup();
    const b = mk();
    for (let i = 0; i < CORE_PER_HOUR; i++) expect(b.reserve('core').ok).toBe(true);
    expect(b.reserve('core').ok).toBe(false);
    expect(b.reserve('search').ok).toBe(true);
    tick(3_600_001);
    expect(b.reserve('core').ok).toBe(true);
  });

  it('survives a reload: a new instance sees what the last one spent', () => {
    const { mk } = setup();
    const a = mk();
    for (let i = 0; i < SEARCH_PER_MINUTE; i++) a.reserve('search');
    expect(mk().reserve('search').ok).toBe(false);
  });

  it('holds everything back until a time GitHub asked for, then lets go', () => {
    const { mk, tick, at } = setup();
    const b = mk();
    b.blockUntil(at() + 90_000);
    expect(b.blockedUntil()).toBe(at() + 90_000);
    expect(b.reserve('core')).toEqual({ ok: false, until: at() + 90_000 });
    expect(mk().reserve('search').ok).toBe(false); // persisted
    tick(90_001);
    expect(b.blockedUntil()).toBeUndefined();
    expect(b.reserve('core').ok).toBe(true);
  });

  it('treats a corrupt record as empty', () => {
    const { kv, mk } = setup();
    kv.set(GH_BUDGET_KEY, '{nope');
    expect(mk().reserve('search').ok).toBe(true);
  });
});
