import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'rjb_copydeck_v1';
const load = async () => {
  vi.resetModules();
  return import('./copyDeckStore');
};

beforeEach(() => localStorage.clear());

describe('copyDeckStore defaults', () => {
  it('a first run starts with no snippets: starters are added only on request', async () => {
    const { getSnippets } = await load();
    expect(getSnippets()).toEqual([]);
  });

  it('a deck emptied by the user stays empty on the next load', async () => {
    localStorage.setItem(KEY, '[]');
    const { getSnippets } = await load();
    expect(getSnippets()).toEqual([]);
  });

  it('ships no personal info', async () => {
    const { STARTER_SNIPPETS } = await load();
    const all = STARTER_SNIPPETS;
    expect(all).toHaveLength(5);
    for (const s of all) {
      expect(`${s.label}\n${s.body}`).not.toMatch(
        /Spokane|Air Force|veteran|\d{3}-\d{3}-\d{4}|welding/i,
      );
    }
  });

  it('every default uses [Company] or [Role]', async () => {
    const { STARTER_SNIPPETS } = await load();
    for (const s of STARTER_SNIPPETS) expect(s.body).toMatch(/\[(Company|Role)\]/);
  });

  it('keeps an existing stored deck unchanged and appends no starter', async () => {
    const stored = [{ id: 'mine', label: 'Mine', body: 'hello' }];
    localStorage.setItem(KEY, JSON.stringify(stored));
    const { getSnippets } = await load();
    expect(getSnippets()).toEqual(stored);
  });

  it('ships one Intro call script for a hiring manager, with tokens', async () => {
    const { STARTER_SNIPPETS } = await load();
    const intro = STARTER_SNIPPETS.filter((x) => x.label === 'Intro call script');
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

describe('starter templates read cleanly', () => {
  it('spell résumé with its accents', async () => {
    const { STARTER_SNIPPETS } = await load();
    const body = (id: string) => STARTER_SNIPPETS.find((s) => s.id === id)!.body;
    for (const s of STARTER_SNIPPETS) expect(s.body).not.toMatch(/\bresume\b/i);
    expect(body('tpl-outreach')).toContain('résumé');
    expect(body('tpl-cover')).toContain('résumé');
  });
  it('leave no dangling [Angle] in the outreach note or the intro call script', async () => {
    const { STARTER_SNIPPETS } = await load();
    const body = (id: string) => STARTER_SNIPPETS.find((s) => s.id === id)!.body;
    expect(body('tpl-outreach')).not.toContain('[Angle]');
    expect(body('tpl-intro-call')).not.toContain('[Angle]');
    expect(body('tpl-intro-call')).not.toMatch(/\n{3,}/);
  });
});
