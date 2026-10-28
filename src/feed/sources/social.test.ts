import { describe, expect, it } from 'vitest';
import { isHiringPost, postTitle, termTag } from './social';

describe('isHiringPost', () => {
  it.each([
    "We're hiring a Senior Design Systems Engineer (remote, US)",
    'Design systems lead role open at Acme #hiring #designsystems',
    '[Hiring] Design system designer, contract',
    'Acme is looking for a design technologist to own our component library',
    'Join our team: Staff Designer, Design Systems. Apply here https://acme.dev/jobs',
    'Open role: design systems engineer #GetFediHired',
  ])('keeps an employer post: %s', (text) => {
    expect(isHiringPost(text)).toBe(true);
  });

  it.each([
    "I'm looking for work in design systems #OpenToWork #hiring",
    '[For Hire] Design systems consultant, 10 years',
    'Seeking a new role in design systems, DMs open #GetFediHired',
    'Our design system now ships dark mode',
    'Hire me: design systems engineer',
  ])('drops a seeker or a non-hiring post: %s', (text) => {
    expect(isHiringPost(text)).toBe(false);
  });
});

describe('postTitle', () => {
  it('takes the first line without trailing hashtags or links', () => {
    expect(postTitle("\nWe're hiring a Design Systems Lead https://x.co/a #hiring #ds\nMore")).toBe(
      "We're hiring a Design Systems Lead",
    );
  });
  it('cuts a long line on a word', () => {
    const t = postTitle(`${'word '.repeat(40)}end`);
    expect(t.length).toBeLessThanOrEqual(121);
    expect(t.endsWith('…')).toBe(true);
    expect(t).not.toMatch(/wor…$/);
  });
});

describe('termTag', () => {
  it('writes a term as its hashtag', () => {
    expect(termTag('design systems')).toBe('designsystems');
    expect(termTag('Design-Technologist')).toBe('designtechnologist');
  });
  it('gives nothing for long or letterless terms', () => {
    expect(termTag('a b c d')).toBeNull();
    expect(termTag('  ')).toBeNull();
    expect(termTag('++')).toBeNull();
  });
});
