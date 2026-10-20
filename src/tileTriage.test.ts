import { afterEach, describe, expect, it, vi } from 'vitest';
import { toggleDismiss, getTileTriage, replaceTriage, mergeTriage } from './tileTriage';

afterEach(() => replaceTriage({ dismissed: [] }));

describe('tile triage', () => {
  it('sets aside and restores a tile', () => {
    toggleDismiss('https://x.com/b');
    expect(getTileTriage().dismissed).toContain('https://x.com/b');
    toggleDismiss('https://x.com/b');
    expect(getTileTriage().dismissed).not.toContain('https://x.com/b');
  });

  it('holds set-aside only: old pin data is dropped on replace and merge (#19)', () => {
    replaceTriage({ pinned: ['p'], dismissed: ['d'] } as never);
    expect(getTileTriage()).toEqual({ dismissed: ['d'] });
    expect(mergeTriage({ dismissed: ['a'] }, { dismissed: ['b', 'a'] })).toEqual({
      dismissed: ['b', 'a'],
    });
  });

  it('removes the retired pin key from this device on load (#19)', async () => {
    localStorage.setItem('rjb_tile_pinned', JSON.stringify(['p']));
    localStorage.setItem('rjb_tile_dismissed', JSON.stringify(['d']));
    vi.resetModules();
    const fresh = await import('./tileTriage');
    expect(fresh.getTileTriage()).toEqual({ dismissed: ['d'] });
    expect(localStorage.getItem('rjb_tile_pinned')).toBeNull();
  });
});
