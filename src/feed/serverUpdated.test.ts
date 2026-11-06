import { describe, expect, it } from 'vitest';
import { serverUpdatedLine } from './serverUpdated';

const now = Date.parse('2026-11-06T12:00:00Z');
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

describe('serverUpdatedLine (#448)', () => {
  it.each([
    [ago(0.5), 'Updated just now'],
    [ago(4), 'Updated 4 min ago'],
    [ago(59), 'Updated 59 min ago'],
    [ago(125), 'Updated 2 h ago'],
  ])('%s → %s', (at, want) => expect(serverUpdatedLine(at, now)).toBe(want));

  it('a day or more says the date', () => {
    expect(serverUpdatedLine(ago(60 * 30), now)).toMatch(/^Updated \D+ \d+$|^Updated \d+ \D+$/);
  });

  it('nothing before the first run, or for a bad time', () => {
    expect(serverUpdatedLine(null, now)).toBeNull();
    expect(serverUpdatedLine('not a date', now)).toBeNull();
  });

  it('a clock a little ahead never says minus', () => {
    expect(serverUpdatedLine(ago(-2), now)).toBe('Updated just now');
  });
});
