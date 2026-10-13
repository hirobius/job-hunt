import { describe, expect, it } from 'vitest';
import { monogram } from './monogram';

describe('monogram', () => {
  it('uses the first letters of a two-word company', () => {
    expect(monogram('Acme Robotics')).toBe('AR');
  });
  it('uses two letters of a one-word company', () => {
    expect(monogram('Stripe')).toBe('ST');
  });
  it('falls back to the host, then the title', () => {
    expect(monogram('', 'boards.greenhouse.io')).toBe('BO');
    expect(monogram(undefined, 'www.lever.co')).toBe('LE');
    expect(monogram('', '', 'Design Systems Lead')).toBe('DS');
    expect(monogram()).toBe('?');
  });
});
