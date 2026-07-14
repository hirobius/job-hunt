import { describe, it, expect, beforeEach, vi } from 'vitest';

const KEY = 'rjb_copydeck_v1';
const hasCallSheet = (arr: { label?: string }[]) =>
  arr.some((s) => /call sheet/i.test(s.label || ''));
const hasScript = (arr: { label?: string }[]) =>
  arr.some((s) => /cold-call|voicemail/i.test(s.label || ''));

describe('copyDeckStore seeding', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('seeds the trades snippets on first load (no IT/cyber persona leak)', async () => {
    const { getSnippets } = await import('./copyDeckStore');
    const snippets = getSnippets();
    expect(hasCallSheet(snippets)).toBe(true);
    expect(hasScript(snippets)).toBe(true);
    // The pre-pivot IT/cyber/design seeds are gone.
    const bodies = snippets.map((s) => s.body).join('\n');
    expect(bodies).not.toMatch(
      /Secret clearance|Microsoft and T-Mobile|Azure AI-102|design technologist/i,
    );
    expect(bodies).toMatch(/Air Force veteran/);
  });

  it('persists the seeded set on first load so a refresh keeps the call sheet + script', async () => {
    // First load seeds + must persist KEY (createStore does not persist its initial value).
    await import('./copyDeckStore');
    expect(localStorage.getItem(KEY)).toBeTruthy();

    // Simulate a browser refresh: the one-time seed flag is now set. Without the persisted
    // KEY, load() would fall back to DEFAULTS and drop the flag-guarded call sheet/script.
    vi.resetModules();
    const { getSnippets } = await import('./copyDeckStore');
    const afterReload = getSnippets();
    expect(hasCallSheet(afterReload)).toBe(true);
    expect(hasScript(afterReload)).toBe(true);
  });
});
