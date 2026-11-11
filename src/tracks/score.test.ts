import { describe, expect, it } from 'vitest';
import { dedupe, fingerprint, scorePosting, type NormalizedPosting } from './score';
import { designSystemsTrack } from './track-config';

const p = (title: string, descriptionText = '', company = 'Acme'): NormalizedPosting => ({
  source: 'greenhouse',
  sourceId: '1',
  title,
  company,
  url: 'https://example.com/job',
  descriptionText,
});

const DS_BODY =
  'You will own our design system and component library. Build design tokens, maintain our Figma variables and Storybook docs, and run the token pipeline governance.';

const verdict = (title: string, body = '', company = 'Acme') =>
  scorePosting(p(title, body, company), designSystemsTrack).verdict;

describe('scorePosting — design systems track', () => {
  it('queues a design systems product designer (Stripe)', () => {
    expect(verdict('Product Designer, Design Systems', DS_BODY, 'Stripe')).toBe('queue');
  });

  it('queues a design systems design manager (Datadog)', () => {
    expect(verdict('Senior Design Manager - Design Systems', '', 'Datadog')).toBe('queue');
  });

  it('rejects the Stripe mechanical title even with a design-system body', () => {
    expect(verdict('Senior Mechanical and Industrial Design Engineer', DS_BODY, 'Stripe')).toBe(
      'reject',
    );
  });

  it('rejects IT systems titles', () => {
    expect(verdict('IT Systems Engineer', DS_BODY)).toBe('reject');
    expect(verdict('Systems Administrator')).toBe('reject');
  });

  it('promotes an adjacent title only with body evidence', () => {
    expect(verdict('Creative Technologist', DS_BODY)).toBe('queue');
    expect(verdict('Creative Technologist', 'General product work.')).toBe('reject');
  });

  it('holds an adjacent title with one signal for review', () => {
    expect(verdict('Staff Product Designer, Platform', 'Contribute to our design system.')).toBe(
      'review',
    );
  });

  it('does not queue a brand designer', () => {
    expect(verdict('Brand Designer, Web', DS_BODY, 'Figma')).not.toBe('queue');
  });

  it('always says why', () => {
    const r = scorePosting(p('Product Designer, Design Systems', DS_BODY), designSystemsTrack);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.matchedSignals).toContain('design tokens');
  });
});

describe('dedupe', () => {
  it('fingerprints ignore seniority words', () => {
    expect(fingerprint({ company: 'Stripe', title: 'Senior Design Systems Engineer' })).toBe(
      fingerprint({ company: 'Stripe', title: 'Design Systems Engineer' }),
    );
  });

  it('keeps the ATS original over an aggregator copy', () => {
    const original = p('Design Systems Engineer', '', 'Stripe');
    const copy: NormalizedPosting = { ...original, source: 'jsearch', sourceId: 'j1' };
    const out = dedupe([copy, original]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('greenhouse');
  });
});
