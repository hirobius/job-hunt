import { describe, expect, it } from 'vitest';
import { initialOf } from './initialOf';

describe('initialOf (an item card avatar letter)', () => {
  it('is the first letter or digit of the name, upper case', () => {
    expect(initialOf('larkspur Analytics')).toBe('L');
    expect(initialOf('  "Quiet" Co')).toBe('Q');
    expect(initialOf('37signals')).toBe('3');
    expect(initialOf('Élan')).toBe('É');
  });

  it('is empty when the name has no letter or digit', () => {
    expect(initialOf('')).toBe('');
    expect(initialOf('—')).toBe('');
  });
});
