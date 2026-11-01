// The Search profile form's draft (#388): what onboarding and the Account menu's Search profile
// read from and write to the profile, so a Save with nothing touched changes nothing.
import { describe, expect, it } from 'vitest';
import { draftOf, fieldsOf, seedSources } from './searchDefaults';
import { sanitizeProfile, type Profile } from './profileModel';

const profile = (o: Partial<Profile>): Profile =>
  sanitizeProfile({ id: 'p', titles: ['Design Systems Lead'], ...o })!;

describe('the Search profile draft', () => {
  it('a Save with nothing touched keeps a hybrid or on-site mode and its place', () => {
    for (const mode of ['hybrid', 'onsite'] as const) {
      const p = profile({ mode, location: 'Spokane, WA' });
      expect(fieldsOf(draftOf(p))).toMatchObject({ mode, location: 'Spokane, WA' });
    }
    expect(fieldsOf(draftOf(profile({ mode: 'remote' })))).toMatchObject({ mode: 'remote' });
  });

  it('Remote only off on a remote profile reads as anywhere', () => {
    const d = { ...draftOf(profile({ mode: 'remote' })), remoteOnly: false };
    expect(fieldsOf(d).mode).toBe('any');
  });

  it('shows only the titles that are on; the switched-off ones are kept, and on again when typed back', () => {
    const p = profile({ titles: ['A', 'B', 'C'], titlesOff: ['B'] });
    const d = draftOf(p);
    expect(d.titles).toEqual(['A', 'C']);
    expect(fieldsOf(d)).toMatchObject({ titles: ['A', 'C', 'B'], titlesOff: ['B'] });
    expect(fieldsOf({ ...d, titles: ['A', 'C', 'b'] })).toMatchObject({
      titles: ['A', 'C', 'b'],
      titlesOff: [],
    });
  });

  it('saving from the form drops the v12 move’s fromTrack', () => {
    expect('fromTrack' in fieldsOf(draftOf(profile({ fromTrack: 'ds' })))).toBe(true);
    expect(fieldsOf(draftOf(profile({ fromTrack: 'ds' }))).fromTrack).toBeUndefined();
  });

  it('the starter companies are the design-systems boards', () => {
    const seed = seedSources();
    expect(seed.length).toBeGreaterThan(20);
    expect(seed.every((s) => s.kind !== 'company' && s.ref && s.label)).toBe(true);
  });
});
