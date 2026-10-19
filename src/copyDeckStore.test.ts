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
    expect(all).toHaveLength(5);
    for (const s of all) {
      expect(`${s.label}\n${s.body}`).not.toMatch(
        /Spokane|Air Force|veteran|\d{3}-\d{3}-\d{4}|welding/i,
      );
    }
  });

  it('every default uses [Company] or [Role]', async () => {
    const { getSnippets } = await load();
    for (const s of getSnippets()) expect(s.body).toMatch(/\[(Company|Role)\]/);
  });

  it('keeps an existing stored deck unchanged and appends no starter', async () => {
    const stored = [{ id: 'mine', label: 'Mine', body: 'hello' }];
    localStorage.setItem(KEY, JSON.stringify(stored));
    const { getSnippets } = await load();
    expect(getSnippets()).toEqual(stored);
  });

  it('ships one Intro call script for a hiring manager, with tokens', async () => {
    const { getSnippets } = await load();
    const intro = getSnippets().filter((x) => x.label === 'Intro call script');
    expect(intro).toHaveLength(1);
    expect(intro[0].body).toMatch(/\[Contact\]/);
    expect(intro[0].body).toMatch(/design system/i);
  });
});

describe('restoreStarterSnippets', () => {
  it('adds the Intro call script to an older deck and leaves existing snippets alone', async () => {
    const stored = [
      { id: 'tpl-outreach', label: 'My outreach', body: 'edited' },
      { id: 'mine', label: 'Mine', body: 'hello' },
    ];
    localStorage.setItem(KEY, JSON.stringify(stored));
    const { getSnippets, restoreStarterSnippets } = await load();
    restoreStarterSnippets();
    const all = getSnippets();
    expect(all.slice(0, 2)).toEqual(stored);
    expect(all.some((x) => x.id === 'tpl-intro-call')).toBe(true);
    restoreStarterSnippets();
    expect(getSnippets()).toHaveLength(all.length);
  });
});
