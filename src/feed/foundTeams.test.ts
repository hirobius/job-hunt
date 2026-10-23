import { describe, expect, it } from 'vitest';
import { addFound, type FoundRow } from './foundTeams';

type Row = FoundRow & { company: string };
const acme: Row = {
  login: 'acme',
  company: 'Acme',
  board: { kind: 'lever', slug: 'acme' },
  openRoles: 3,
};
const quiet: Row = { login: 'quiet', company: 'Quiet Co' };
const run = (list: Row[], rows: Row[]) => rows.reduce(addFound, list);

describe('addFound', () => {
  it('adds a new row last and keeps every row already listed', () => {
    expect(run([acme], [quiet])).toEqual([acme, quiet]);
  });

  it('a re-run of the same rows changes nothing (idempotent)', () => {
    const once = run([], [acme, quiet]);
    expect(run(once, [acme, quiet])).toEqual(once);
    expect(run(once, [{ ...acme, login: 'ACME' }])).toHaveLength(2);
  });

  it('a repeat not looked up this time keeps what the list knew', () => {
    const unchecked: Row = { login: 'acme', company: 'acme', boardCheck: 'unchecked' };
    expect(run([acme], [unchecked])).toEqual([acme]);
  });

  it('a repeat whose board check got no answer keeps the board it had', () => {
    const unknown: Row = { login: 'acme', company: 'Acme', boardCheck: 'unknown' };
    expect(run([acme], [unknown])).toEqual([acme]);
  });

  it('a repeat that now has a board fills it in, in place', () => {
    const later: Row = { ...quiet, board: { kind: 'ashby', slug: 'quiet' }, openRoles: 1 };
    expect(run([quiet, acme], [later])).toEqual([later, acme]);
  });
});

import { beforeEach, afterEach } from 'vitest';
import { MAX_FOUND, capFound, clearFound, foundKey, loadFound, saveFound } from './foundTeams';
import { freezeTab, resetTabAccount, setTabAccount } from '../tabAccount';

const many = (n: number, from = 0): Row[] =>
  Array.from({ length: n }, (_, i) => ({ login: `t${from + i}`, company: `T${from + i}` }));

describe('found teams kept on the device', () => {
  beforeEach(() => localStorage.clear());
  afterEach(resetTabAccount);

  it('survives a reload (a fresh read of storage)', () => {
    saveFound('a', [acme, quiet]);
    expect(loadFound<Row>('a')).toEqual([acme, quiet]);
    expect(loadFound('b')).toEqual([]);
  });

  it('an empty or rate-limited re-run never shrinks it', () => {
    saveFound('a', [acme, quiet]);
    expect(saveFound('a', []).list).toEqual([acme, quiet]);
    expect(saveFound('a', [{ login: 'acme', company: 'Acme' }]).list).toHaveLength(2);
    expect(loadFound('a')).toHaveLength(2);
  });

  it('ignores unreadable storage', () => {
    localStorage.setItem(foundKey('a'), '{nope');
    expect(loadFound('a')).toEqual([]);
    localStorage.setItem(foundKey('a'), JSON.stringify([{ x: 1 }, 'q', acme]));
    expect(loadFound('a')).toEqual([acme]);
  });

  it('caps at the newest MAX_FOUND and says how many it dropped', () => {
    expect(capFound(many(MAX_FOUND))).toMatchObject({ dropped: 0 });
    const r = saveFound('a', many(MAX_FOUND + 3));
    expect(r.dropped).toBe(3);
    expect(r.list).toHaveLength(MAX_FOUND);
    expect(r.list[0].login).toBe('t3');
    expect(loadFound('a')[MAX_FOUND - 1].login).toBe(`t${MAX_FOUND + 2}`);
  });

  it('clearFound removes the key', () => {
    saveFound('a', [acme]);
    clearFound('a');
    expect(localStorage.getItem(foundKey('a'))).toBeNull();
  });

  it('a frozen tab does not write', () => {
    setTabAccount('u1');
    freezeTab('switched');
    saveFound('a', [acme]);
    expect(localStorage.getItem(foundKey('a'))).toBeNull();
  });
});
