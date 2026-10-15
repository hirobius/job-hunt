import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllPending, clearDelivered, getPending, markPending, settlePending } from './pending';

beforeEach(() => clearAllPending());

describe('pending track writes', () => {
  it('a write is pending until the cloud accepts it', () => {
    const v = markPending('categories', 'c1', 'upsert');
    expect(getPending()).toHaveLength(1);
    settlePending('categories', 'c1', v, true);
    expect(getPending()).toEqual([]);
  });

  it('a refused write stays, marked failed', () => {
    const v = markPending('categories', 'c1', 'delete');
    settlePending('categories', 'c1', v, false);
    expect(getPending()).toEqual([
      { table: 'categories', id: 'c1', op: 'delete', v, failed: true },
    ]);
  });

  it('an older write finishing never clears a newer one to the same row', () => {
    const v1 = markPending('tiles', 't1', 'upsert');
    const v2 = markPending('tiles', 't1', 'upsert');
    settlePending('tiles', 't1', v1, true);
    expect(getPending().map((p) => p.v)).toEqual([v2]);
    // …and a sync that delivered the older snapshot leaves the newer write pending too.
    clearDelivered([{ table: 'tiles', id: 't1', op: 'upsert', v: v1, failed: true }]);
    expect(getPending()).toHaveLength(1);
  });

  it('survives a reload (persisted)', () => {
    markPending('groups', 'g1', 'upsert');
    expect(localStorage.getItem('rjb_curation_pending')).toContain('groups:g1');
  });
});

describe('a damaged or shared journal (#168 re-review)', () => {
  it.each([
    ['null', 'null'],
    ['a string', '"x"'],
    ['a wrong shape', '{"a":1}'],
    ['not JSON', '{oops'],
  ])('a stored journal that is %s is dropped with a warning, not a crash', async (_n, raw) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('rjb_curation_pending', raw);
    vi.resetModules();
    const fresh = await import('./pending');
    expect(fresh.getPending()).toEqual([]);
    expect(() => fresh.markPending('categories', 'c1', 'upsert')).not.toThrow();
    expect(fresh.getPending().map((p) => p.id)).toEqual(['c1']);
    if (raw !== 'null') expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('keeps the good entries of a partly damaged journal', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(
      'rjb_curation_pending',
      JSON.stringify({
        'categories:c1': { table: 'categories', id: 'c1', op: 'upsert', v: 2, failed: true },
        junk: 7,
      }),
    );
    vi.resetModules();
    const fresh = await import('./pending');
    expect(fresh.getPending().map((p) => p.id)).toEqual(['c1']);
  });

  it('two tabs: a write here keeps the entry another tab wrote meanwhile', () => {
    markPending('categories', 'c1', 'upsert');
    // The other tab writes its own entry straight to storage.
    const other = JSON.parse(localStorage.getItem('rjb_curation_pending')!);
    other['groups:g9'] = { table: 'groups', id: 'g9', op: 'upsert', v: 1, failed: true };
    localStorage.setItem('rjb_curation_pending', JSON.stringify(other));
    markPending('tiles', 't1', 'upsert');
    expect(
      getPending()
        .map((p) => p.id)
        .sort(),
    ).toEqual(['c1', 'g9', 't1']);
    expect(Object.keys(JSON.parse(localStorage.getItem('rjb_curation_pending')!)).sort()).toEqual([
      'categories:c1',
      'groups:g9',
      'tiles:t1',
    ]);
  });

  it('two tabs: another tab clearing an entry is seen here (storage event)', () => {
    const v = markPending('categories', 'c1', 'upsert');
    localStorage.setItem('rjb_curation_pending', '{}');
    window.dispatchEvent(new StorageEvent('storage', { key: 'rjb_curation_pending' }));
    expect(getPending()).toEqual([]);
    // …and settling here afterwards doesn't bring it back.
    settlePending('categories', 'c1', v, false);
    expect(getPending()).toEqual([]);
  });
});

describe('the pending count follows other tabs (storage event)', () => {
  it('a hook re-renders when another tab changes the journal', async () => {
    const { renderHook, act } = await import('@testing-library/react');
    const { usePendingCount } = await import('./pending');
    const { result } = renderHook(() => usePendingCount());
    expect(result.current).toBe(0);
    // Another tab writes an entry straight to storage; only the event tells this tab.
    localStorage.setItem(
      'rjb_curation_pending',
      JSON.stringify({
        'groups:g9': { table: 'groups', id: 'g9', op: 'upsert', v: 1, failed: true },
      }),
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'rjb_curation_pending' }));
    });
    expect(result.current).toBe(1);
  });
});
