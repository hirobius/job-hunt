import { describe, expect, it } from 'vitest';
import { MAX_ANGLE_CHARS, MAX_BLOCKER_CHARS, MAX_BLOCKERS, parseScreen } from './result';

const good = {
  verdict: 'stretch',
  blockers: ['5+ years required'],
  angle: 'Lead with tokens.',
  mode: 'hybrid',
};

describe('parseScreen', () => {
  it('accepts the exact shape', () => {
    expect(parseScreen(JSON.stringify(good))).toEqual({ ok: true, screen: good });
  });

  it('tolerates one json fence and a missing mode', () => {
    const { mode: _m, ...noMode } = good;
    const r = parseScreen('```json\n' + JSON.stringify(noMode) + '\n```');
    expect(r).toEqual({ ok: true, screen: noMode });
  });

  it.each([
    ['not JSON', 'Sure! Here is the screen.'],
    ['an array', '[]'],
    ['an extra key', JSON.stringify({ ...good, action: 'delete_all' })],
    ['a verdict off the enum', JSON.stringify({ ...good, verdict: 'perfect' })],
    ['a mode off the enum', JSON.stringify({ ...good, mode: 'moon' })],
    ['blockers not strings', JSON.stringify({ ...good, blockers: [{ x: 1 }] })],
    ['missing angle', JSON.stringify({ verdict: 'match', blockers: [] })],
    ['empty', ''],
    ['huge', JSON.stringify({ ...good, angle: 'a'.repeat(9000) })],
    ['not a string', 42],
  ])('refuses %s with a plain error', (_name, reply) => {
    const r = parseScreen(reply);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/expected shape/);
  });

  it('clamps counts and lengths and cleans text', () => {
    const r = parseScreen(
      JSON.stringify({
        verdict: 'reach',
        blockers: [...Array(9)].map((_, i) => `B${i} ${'x'.repeat(200)}`),
        angle: `[link](http://evil) ${'y'.repeat(400)}`,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.screen.blockers).toHaveLength(MAX_BLOCKERS);
    r.screen.blockers.forEach((b) => expect(b.length).toBeLessThanOrEqual(MAX_BLOCKER_CHARS));
    expect(r.screen.angle.length).toBeLessThanOrEqual(MAX_ANGLE_CHARS);
    expect(r.screen.angle).not.toMatch(/http|\[|\]|\(/);
  });
});
