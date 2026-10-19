import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'rjb_copydeck_v1';
const load = async () => {
  vi.resetModules();
  return import('./copyDeckStore');
};

beforeEach(() => localStorage.clear());

describe('copyDeckStore defaults', () => {
  it('ships no personal info', async () => {
    const { getSnippets } = await load();
    const all = getSnippets();
    expect(all).toHaveLength(4);
    for (const s of all) {
      expect(`${s.label}\n${s.body}`).not.toMatch(/Spokane|Air Force|veteran|\d{3}-\d{3}-\d{4}|welding/i);
    }
  });

  it('every default uses [Company] or [Role]', async () => {
    const { getSnippets } = await load();
    for (const s of getSnippets()) expect(s.body).toMatch(/\[(Company|Role)\]/);
  });

  it('keeps an existing stored deck unchanged and appends no call sheet', async () => {
    const stored = [{ id: 'mine', label: 'Mine', body: 'hello' }];
    localStorage.setItem(KEY, JSON.stringify(stored));
    const { getSnippets } = await load();
    expect(getSnippets()).toEqual(stored);
    expect(localStorage.getItem('rjb_deck_callsheet')).toBeNull();
  });
});
