import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TARGETS_KEY,
  readTargets,
  removeTarget,
  sanitizeTargets,
  saveTarget,
  type Target,
} from './targets';

const t = (login: string, extra: Partial<Target> = {}): Omit<Target, 'savedAt'> => ({
  login,
  company: login.toUpperCase(),
  repo: `${login}/ds`,
  repoUrl: `https://github.com/${login}/ds`,
  stars: 100,
  ...extra,
});

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('targets', () => {
  it('saves per track and reads back after a reload (it is just storage)', () => {
    saveTarget('trackA', t('acme', { openRoles: 3, board: { kind: 'lever', slug: 'acme' } }));
    saveTarget('trackB', t('other'));
    expect(readTargets('trackA').map((x) => x.login)).toEqual(['acme']);
    expect(readTargets('trackA')[0]).toMatchObject({
      company: 'ACME',
      openRoles: 3,
      board: { kind: 'lever', slug: 'acme' },
    });
    expect(readTargets('trackA')[0].savedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(readTargets('trackB')).toHaveLength(1);
    expect(readTargets('nope')).toEqual([]);
  });

  it('saving the same organisation again replaces it, ignoring case, and keeps the first save time', () => {
    saveTarget('a', t('Acme', { stars: 10 }));
    const first = readTargets('a')[0].savedAt;
    saveTarget('a', t('acme', { stars: 99 }));
    const list = readTargets('a');
    expect(list).toHaveLength(1);
    expect(list[0].stars).toBe(99);
    expect(list[0].savedAt).toBe(first);
  });

  it('removes one', () => {
    saveTarget('a', t('one'));
    saveTarget('a', t('two'));
    expect(removeTarget('a', 'ONE').map((x) => x.login)).toEqual(['two']);
    expect(readTargets('a').map((x) => x.login)).toEqual(['two']);
  });

  it('treats storage as untrusted', () => {
    localStorage.setItem(TARGETS_KEY, '{nope');
    expect(readTargets('a')).toEqual([]);
    expect(
      sanitizeTargets({
        a: [
          t('ok'),
          { login: 'no-repo' },
          'x',
          { ...t('badboard'), board: { kind: 'evil', slug: '../x' } },
          { ...t('web'), website: 'javascript:alert(1)' },
        ],
        b: 'nope',
      }),
    ).toEqual({
      a: [
        expect.objectContaining({ login: 'ok' }),
        expect.objectContaining({ login: 'badboard', board: undefined }),
        expect.objectContaining({ login: 'web', website: undefined }),
      ],
    });
  });

  it('does not throw when storage is blocked', () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    try {
      expect(() => saveTarget('a', t('x'))).not.toThrow();
    } finally {
      Storage.prototype.setItem = orig;
    }
  });
});
