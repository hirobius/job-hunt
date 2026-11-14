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

describe('a hostile body (security review 2026-10-28)', () => {
  it('drops scripts and styles, closed or not', () => {
    expect(htmlToText('a<script>x</script>b<STYLE x>y</style >c<script>z')).toBe('a b c');
  });

  it('many unclosed script tags stay fast', () => {
    const t = Date.now();
    htmlToText('<script>'.repeat(50_000));
    expect(Date.now() - t).toBeLessThan(200);
  });
});

// The fast paths (#perf: decode by `&`, whitespace runs only) must give exactly what the plain
// global replaces gave: these are those replaces, checked over awkward inputs.
describe('fast paths match the plain replaces', () => {
  const NAMED: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
    hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•',
  };
  const refDecode = (s: string) =>
    s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return NAMED[e.toLowerCase()] ?? m;
    });
  const refTidy = (s: string) =>
    s.replace(/[ \t\f\v ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
  const cases = [
    '', 'plain', '&', '&&amp;', '&amp;lt;p&amp;gt;', '&AMP; &Amp; &LT;', '&#0; &#x110000; &#65;&#X41;&#x41;',
    '&nope; &amp &amp;amp;', 'a&b&c;&d&gt;', '&#xZZ; &#; &x41;', '&lt;p&gt;Hi&nbsp;there&lt;/p&gt;',
    'a  b\t\tc   d\v\fe', ' \n  \n\t x \n', 'x\n\n\n y', ' ', ' a ', '\t', 'a \nb\n c',
  ];
  it('decodeEntities', () => {
    for (const c of cases) expect(decodeEntities(c)).toBe(refDecode(c));
  });
  it('htmlToText', () => {
    const ref = (h: string) =>
      refTidy(
        refDecode(
          h
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/?(p|div|li|ul|ol|h[1-6]|tr|section|article)\b[^>]*>/gi, '\n')
            .replace(/<[^>]+>/g, ''),
        ),
      );
    for (const c of cases) expect(htmlToText(c)).toBe(ref(c));
    for (const c of cases) expect(htmlToText(`<p>${c}</p><br/> <li> ${c}\t</li>`)).toBe(ref(`<p>${c}</p><br/> <li> ${c}\t</li>`));
  });
});
