import { describe, expect, it } from 'vitest';
import { capsToSentence } from './capsCase';

describe('capsToSentence (display only, 2026-11-12)', () => {
  it('title-cases an all-caps run', () => {
    expect(capsToSentence('ABOUT RAMP We build cards.')).toBe('About Ramp We build cards.');
    expect(capsToSentence('RESPONSIBILITIES: own the system')).toBe(
      'Responsibilities: own the system',
    );
  });
  it('keeps lone short acronyms and mixed case', () => {
    expect(capsToSentence('Own the UX of our API in the US.')).toBe(
      'Own the UX of our API in the US.',
    );
    expect(capsToSentence('Design Systems Lead')).toBe('Design Systems Lead');
  });
});
