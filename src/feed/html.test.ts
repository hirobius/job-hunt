import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText } from './html';

describe('decodeEntities', () => {
  it.each([
    ['https:&#x2F;&#x2F;acme.dev', 'https://acme.dev'],
    ['We&#x27;re hiring', "We're hiring"],
    ['R&amp;D &lt;3', 'R&D <3'],
    ['&#8212; and &mdash;', '— and —'],
    ['&bogus; stays', '&bogus; stays'],
  ])('%s → %s', (raw, out) => expect(decodeEntities(raw)).toBe(out));
});

describe('htmlToText', () => {
  it('keeps paragraph and list boundaries as newlines', () => {
    expect(
      htmlToText('Acme | Engineer<p>We build tools.<ul><li>React</li><li>Figma</li></ul>'),
    ).toBe('Acme | Engineer\nWe build tools.\nReact\nFigma');
  });
  it('drops tags and their attributes, keeps link text', () => {
    expect(htmlToText('See <a href="https://x.dev" rel="nofollow">x.dev</a> now')).toBe(
      'See x.dev now',
    );
  });
  it('handles double-escaped HTML (Greenhouse content) after one decode', () => {
    expect(htmlToText(decodeEntities('&lt;p&gt;Own the design system&lt;/p&gt;'))).toBe(
      'Own the design system',
    );
  });
  it('drops script and style bodies', () => {
    expect(htmlToText('a<style>.x{}</style>b<script>alert(1)</script>c')).toBe('a b c');
  });
});
