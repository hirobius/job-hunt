import { describe, expect, it } from 'vitest';
import { aiScreeningOn } from './flagRule';
import { AI_SCREENING } from './flag';

describe('AI screening flag', () => {
  it('is off on Vercel production and on in previews, dev and local builds', () => {
    expect(aiScreeningOn({ VERCEL_ENV: 'production' })).toBe(false);
    expect(aiScreeningOn({ VERCEL_ENV: 'preview' })).toBe(true);
    expect(aiScreeningOn({ VERCEL_ENV: 'development' })).toBe(true);
    expect(aiScreeningOn({})).toBe(true);
  });

  it('can be forced either way', () => {
    expect(aiScreeningOn({ VERCEL_ENV: 'production', RF_AI_SCREENING: 'on' })).toBe(true);
    expect(aiScreeningOn({ VERCEL_ENV: 'preview', RF_AI_SCREENING: 'off' })).toBe(false);
  });

  it('is on in the test build', () => {
    expect(AI_SCREENING).toBe(true);
  });
});
