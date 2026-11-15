import { describe, expect, it } from 'vitest';
import { placeText } from './placeText';

describe('placeText', () => {
  it('keeps a short place as given', () => {
    for (const p of [
      'Vilnius, Lithuania',
      'Remote within Canada',
      'Portland, OR, or Remote within Canada',
      'Remote (US only)',
      'Isle of Man',
      'Hybrid, France',
      'Remote within the European Union and the United Kingdom or Switzerland',
    ])
      expect(placeText(p)).toBe(p);
  });

  it('cuts the description out of a place (Surfshark on designsystems.jobs)', () => {
    expect(
      placeText(
        'Lithuania This role sits in the Experience Design team and owns the unified design system powering Incogni',
      ),
    ).toBe('Lithuania');
    expect(placeText('Vilnius, Lithuania We are looking for a designer.')).toBe(
      'Vilnius, Lithuania',
    );
    expect(placeText('Berlin, Germany. Join our team today')).toBe('Berlin, Germany');
  });

  it('reads the first line only', () => {
    expect(placeText('London, UK\nAbout the role: you will…')).toBe('London, UK');
  });

  it('is empty for a sentence with no place', () => {
    expect(placeText('this role sits in the design team and owns the system')).toBe('');
  });
});
