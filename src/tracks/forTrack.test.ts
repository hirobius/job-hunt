import { describe, expect, it } from 'vitest';
import type { Posting } from '../feed/types';
import { keepForTrack, scoreAll, scorerFor, toNormalized } from './forTrack';
import { reasonsLine } from './scoreForTrack';

const post = (id: string, title: string, text = '', postedAt?: string): Posting => ({
  id,
  source: 'greenhouse',
  title,
  company: 'Acme',
  url: `https://boards.greenhouse.io/acme/jobs/${id}`,
  location: '',
  text,
  postedAt,
});
const DS = 'Own the design system, component library and design tokens.';

describe('the scorer on the client', () => {
  it('scores a track whose must include asks for design system(s), and no other', () => {
    expect(scorerFor({ terms: ['design system'] })?.slug).toBe('design-systems');
    expect(scorerFor({ terms: ['systems'] })).toBeNull();
    expect(scorerFor([])).toBeNull();
    expect(scorerFor(undefined)).toBeNull();
  });

  it('queues by score then newest, holds review apart, counts the rest', () => {
    const r = scoreAll(
      [
        post('a', 'Design Systems Designer', '', '2026-10-01'),
        post('b', 'Design Systems Designer', '', '2026-10-20'),
        post('c', 'Design Systems Engineer', DS),
        post('d', 'Staff Product Designer, Platform', 'Help our design system.'),
        post('e', 'Senior Software Engineer', DS),
        post('f', 'Design Systems Intern', DS),
      ],
      scorerFor({ terms: ['design systems'] })!,
    );
    expect(r.queue.map((p) => p.id)).toEqual(['c', 'b', 'a']);
    // Body evidence with no title signal (a plain software engineer) is review at best.
    expect(r.review.map((p) => p.id)).toEqual(['d', 'e']);
    expect(r.rejected).toBe(1); // the intern (fit rule)
    expect(reasonsLine(r.queue[0].trackScore)).toMatch(/^Queued because: title match: /);
    expect(reasonsLine(r.review[0].trackScore)).toMatch(/^Held for review because: /);
  });

  it('keepForTrack keeps the queue on a scored track, and the phrase rule elsewhere', () => {
    const rows = [post('a', 'Design Technologist', DS), post('b', 'Welder, Systems Lead')];
    expect(keepForTrack(rows, { terms: ['design system'] }).map((p) => p.id)).toEqual(['a']);
    expect(keepForTrack(rows, ['systems']).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('maps a posting for the scorer', () => {
    const n = toNormalized({ ...post('x', 'T', 'body'), source: 'workable', mode: 'remote' });
    expect(n).toMatchObject({
      source: 'manual',
      sourceId: 'x',
      descriptionText: 'body',
      remote: true,
    });
  });
});
