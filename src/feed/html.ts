// HTML → plain text without a DOM (sources hand us HTML bodies; the matcher wants text, and these
// helpers must run in tests and in the browser alike). Not a sanitizer — output is only ever rendered
// as React text, never as HTML.

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  bull: '•',
};

const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/iy;

function decodeEntity(m: string, e: string): string {
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
  }
  return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m;
}

/** Board bodies arrive entity-encoded (Greenhouse's `&lt;p&gt;`), so a feed read decodes millions of
 *  characters: this walks the string by `&` and only runs the pattern where one is, and the common
 *  lower-case names skip `toLowerCase` (the same output as one global replace, about 3x faster). */
export function decodeEntities(s: string): string {
  let at = s.indexOf('&');
  if (at < 0) return s;
  let out = '';
  let from = 0;
  while (at >= 0) {
    ENTITY.lastIndex = at;
    const m = ENTITY.exec(s);
    if (m) {
      out += s.slice(from, at) + decodeEntity(m[0], m[1]);
      from = at + m[0].length;
      at = s.indexOf('&', from);
    } else at = s.indexOf('&', at + 1);
  }
  return out + s.slice(from);
}

/** Drops script and style elements in one pass (a lazy regex over many unclosed `<script` tags
 *  took time quadratic in the body: a hostile posting froze the tab). An unclosed one runs to the
 *  end. */
function dropScripts(html: string): string {
  const lower = html.toLowerCase();
  const open = /<(script|style)\b/g;
  let out = '';
  let from = 0;
  for (let m = open.exec(lower); m; m = open.exec(lower)) {
    out += html.slice(from, m.index) + ' ';
    const end = lower.indexOf(`</${m[1]}`, open.lastIndex);
    if (end < 0) return out;
    const close = lower.indexOf('>', end);
    from = close < 0 ? html.length : close + 1;
    open.lastIndex = from;
  }
  return out + html.slice(from);
}

/** Strip tags, keeping block boundaries as newlines; decode entities; tidy whitespace. */
export function htmlToText(html: string): string {
  return decodeEntities(
    dropScripts(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|li|ul|ol|h[1-6]|tr|section|article)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    // Only runs that change: a lone space stays (matching every space doubled the cost).
    .replace(/(?: [ \t\f\v\u00a0]|[\t\f\v\u00a0])[ \t\f\v\u00a0]*/g, ' ')
    .replace(/ +\n *|\n +/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
