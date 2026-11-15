// The career preferences preview (ADR 0011, proposed): the category data and the rule that the
// preview never changes the profile in use.
import { describe, expect, it } from 'vitest';
import { MAX_CATEGORIES, MAX_PROFILES, sanitizeProfile, type Profile } from '../profileModel';
import {
  CAREER_CATEGORIES,
  NEW_PREFS,
  PREVIEW_PROFILE_ID,
  fieldsOfPrefs,
  parsePay,
  prefsOf,
  titleChoices,
  toggleCategory,
  toggleValue,
  withPreview,
} from './careers';
import { careersPreviewOn, CAREERS_FLAG_KEY } from './careersFlag';

const profile = (id: string): Profile =>
  sanitizeProfile({
    id,
    titles: ['Design Systems Lead'],
    mode: 'remote',
    scorer: 'design-systems',
  })!;
const NOW = '2026-11-15T00:00:00.000Z';
const prefs = { ...NEW_PREFS, categories: ['data'], titles: ['Data Analyst'], skills: ['SQL'] };

describe('career categories', () => {
  it('have unique ids and enough titles and skills to offer', () => {
    const ids = CAREER_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CAREER_CATEGORIES) {
      expect(c.titles.length, c.id).toBeGreaterThanOrEqual(5);
      expect(c.skills.length, c.id).toBeGreaterThanOrEqual(5);
    }
  });

  it('pick at most the limit, and a second tap removes one', () => {
    let picked: string[] = [];
    for (const c of CAREER_CATEGORIES) picked = toggleCategory(picked, c.id);
    expect(picked).toHaveLength(MAX_CATEGORIES);
    expect(toggleCategory(picked, picked[0])).toHaveLength(MAX_CATEGORIES - 1);
    expect(toggleCategory([], 'not-a-category')).toEqual([]);
  });

  it('offer the picked categories’ titles, then the person’s own', () => {
    const list = titleChoices(['data'], ['Quant Researcher', 'data analyst']);
    expect(list[0]).toBe('Data Analyst');
    expect(list.at(-1)).toBe('Quant Researcher');
    expect(list.filter((t) => t.toLowerCase() === 'data analyst')).toHaveLength(1);
    expect(toggleValue(['SQL'], 'sql')).toEqual([]);
  });
});

describe('pay', () => {
  it('reads dollars a year', () => {
    expect(parsePay('120,000')).toBe(120000);
    expect(parsePay('$95k')).toBe(95000);
    expect(parsePay('lots')).toBe(0);
    expect(parsePay('')).toBe(0);
  });
});

describe('the preview profile', () => {
  it('is off unless this device turns it on', () => {
    localStorage.removeItem(CAREERS_FLAG_KEY);
    expect(careersPreviewOn()).toBe(false);
    localStorage.setItem(CAREERS_FLAG_KEY, '1');
    expect(careersPreviewOn()).toBe(true);
    localStorage.removeItem(CAREERS_FLAG_KEY);
  });

  it('is saved behind the profile in use, which stays as it was', () => {
    const mine = profile('profile-mine');
    const next = withPreview([mine], prefs, NOW);
    expect(next[0]).toBe(mine);
    expect(next[1].id).toBe(PREVIEW_PROFILE_ID);
    expect(next[1].scorer).toBeUndefined();
    // A second save replaces the preview, keeps its date and adds no third profile.
    const again = withPreview(
      next,
      { ...prefs, titles: ['Data Engineer'] },
      '2027-01-01T00:00:00Z',
    );
    expect(again.map((p) => p.id)).toEqual(['profile-mine', PREVIEW_PROFILE_ID]);
    expect(again[1].titles).toEqual(['Data Engineer']);
    expect(again[1].createdAt).toBe(NOW);
  });

  it('never takes the first place and never pushes a profile out', () => {
    expect(withPreview([], prefs, NOW)).toEqual([]);
    const full = Array.from({ length: MAX_PROFILES }, (_, i) => profile(`p${i}`));
    expect(withPreview(full, prefs, NOW)).toEqual(full);
  });

  it('survives the sanitizer and reads back into the form', () => {
    const fields = fieldsOfPrefs({
      ...prefs,
      mode: 'hybrid',
      location: ' Lisbon ',
      pay: '90k',
      payOnly: true,
    });
    const stored = sanitizeProfile({ ...fields, createdAt: NOW })!;
    expect(stored.categories).toEqual(['data']);
    expect(stored.skills).toEqual(['SQL']);
    expect(stored.payFloor).toBe(90000);
    expect(prefsOf(stored)).toMatchObject({
      categories: ['data'],
      titles: ['Data Analyst'],
      mode: 'hybrid',
      location: 'Lisbon',
      pay: '90000',
      payOnly: true,
    });
  });

  it('leaves a profile without the new fields exactly as it was', () => {
    const p = profile('profile-mine');
    expect('categories' in p).toBe(false);
    expect('skills' in p).toBe(false);
  });
});
