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
      'London or remote',
      'New York, NY or remote',
    ])
      expect(placeText(p)).toBe(p);
  });

  it('cuts the description out of a place (Surfshark on designsystems.jobs)', () => {
    expect(
      placeText(
        'Lithuania This role sits in the Experience Design team and owns the unified design system powering Incogni',
      ),
    ).toBe('Lithuania…');
    expect(placeText('Vilnius, Lithuania We are looking for a designer.')).toBe(
      'Vilnius, Lithuania…',
    );
    expect(placeText('Berlin, Germany. Join our team today')).toBe('Berlin, Germany…');
  });

  it('a cut place drops a trailing joiner and ends in an ellipsis (Adrian 2026-11-15)', () => {
    expect(placeText('San Francisco, CA, or remote work possible')).toBe('San Francisco, CA…');
    expect(placeText('Austin, TX and remote across the US')).toBe('Austin, TX…');
    expect(placeText('Paris & remote friendly team')).toBe('Paris…');
    expect(placeText('Remote, Lithuania This role sits in the team')).toBe('Remote, Lithuania…');
  });

  it('reads the first line only', () => {
    expect(placeText('London, UK\nAbout the role: you will…')).toBe('London, UK');
  });

  it('is empty for a sentence with no place', () => {
    expect(placeText('this role sits in the design team and owns the system')).toBe('');
  });
});
