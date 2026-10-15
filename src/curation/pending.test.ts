import { beforeEach, describe, expect, it } from 'vitest';
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
