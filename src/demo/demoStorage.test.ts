// The demo's storage (#835 review): in a demo tab, the app's data lives in memory only. The real
// store is never read for data and never written, so a demo can't touch what the visitor made.
import { afterEach, describe, expect, it } from 'vitest';
import { demoStorageOver, demoWanted, DEMO_FLAG } from './demoStorage';

const real = () => {
  const m = new Map<string, string>();
  const s: Storage = {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
  return { s, m };
};

afterEach(() => sessionStorage.removeItem(DEMO_FLAG));

describe('demoStorageOver', () => {
  it('hides the visitor’s data and keeps every write in memory', () => {
    const { s, m } = real();
    m.set('rjb_shortlist', '[{"url":"https://mine.example/1"}]');
    const demo = demoStorageOver(s);
    expect(demo.getItem('rjb_shortlist')).toBeNull();
    demo.setItem('rjb_shortlist', '[{"url":"https://demo.example/1"}]');
    expect(demo.getItem('rjb_shortlist')).toBe('[{"url":"https://demo.example/1"}]');
    // The real store still holds exactly what the visitor made.
    expect(m.get('rjb_shortlist')).toBe('[{"url":"https://mine.example/1"}]');
    demo.removeItem('rjb_shortlist');
    demo.clear();
    expect(m.get('rjb_shortlist')).toBe('[{"url":"https://mine.example/1"}]');
  });

  it('keeps the visitor’s display choices (colour mode, paused motion), read only', () => {
    const { s, m } = real();
    m.set('rjb_color_mode', 'dark');
    m.set('rjb_ui_pause_motion', '1');
    const demo = demoStorageOver(s);
    expect(demo.getItem('rjb_color_mode')).toBe('dark');
    expect(demo.getItem('rjb_ui_pause_motion')).toBe('1');
    demo.setItem('rjb_color_mode', 'light');
    expect(demo.getItem('rjb_color_mode')).toBe('light');
    expect(m.get('rjb_color_mode')).toBe('dark');
  });

  it('lists only its own keys', () => {
    const { s, m } = real();
    m.set('rjb_shortlist', '[]');
    const demo = demoStorageOver(s);
    demo.setItem('rjb_documents', '[]');
    const keys = Array.from({ length: demo.length }, (_, i) => demo.key(i));
    expect(keys).toEqual(['rjb_documents']);
  });
});

describe('demoWanted', () => {
  it('is on for a ?demo=1 link or a demo tab, and never with a stored session', () => {
    const { s, m } = real();
    expect(demoWanted('#/review', s)).toBe(false);
    expect(demoWanted('#/review?demo=1', s)).toBe(true);
    sessionStorage.setItem(DEMO_FLAG, '1');
    expect(demoWanted('#/apply', s)).toBe(true);
    m.set('sb-abc-auth-token', '{}');
    expect(demoWanted('#/review?demo=1', s)).toBe(false);
  });
});
