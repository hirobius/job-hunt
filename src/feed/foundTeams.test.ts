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
