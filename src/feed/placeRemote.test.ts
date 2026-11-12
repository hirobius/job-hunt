import { describe, expect, it } from 'vitest';
import { placeSaysRemote } from './placeRemote';

describe('placeSaysRemote: the mode line hides when the place says remote (2026-11-12)', () => {
  it.each(['Remote (US)', 'Remote - EMEA', 'Anywhere', 'New York or Remote'])('%s hides it', (p) =>
    expect(placeSaysRemote(p)).toBe(true),
  );
  it('a city alone keeps the mode line', () => expect(placeSaysRemote('New York')).toBe(false));
});
