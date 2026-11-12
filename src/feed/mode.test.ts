import { describe, expect, it } from 'vitest';
import { inferMode, remoteVerdict } from './mode';

describe('a line that rules remote out (#624)', () => {
  it('is never read as remote', () => {
    for (const s of ['No remote', 'Not remote', 'Non-remote', 'remote not available'])
      // #576 item 10: a line that only rules remote out now reads as on-site (was unstated).
      expect(inferMode(s), s).toBe('onsite');
    expect(inferMode('Onsite - No remote')).toBe('onsite');
    expect(remoteVerdict(undefined, 'Berlin, Germany (No remote)')).toBe('drop');
  });
  it('keeps the lines that offer remote', () => {
    expect(inferMode('Remote - US')).toBe('remote');
    expect(inferMode('Onsite or remote')).toBeUndefined(); // two modes: says nothing on its own
    expect(inferMode('Hybrid - Remote')).toBeUndefined();
  });
});
