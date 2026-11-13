// A posting's description as structure (the full-description fix, 2026-11-13): headings, paragraphs
// and lists, read from the source's HTML with an allow-list walk, never set as HTML. The output is a
// small tree that PostingDescription.tsx turns into React elements, so nothing the source sends can
// run: script, style, iframe, img and every other element are dropped (their text kept where it is
// text, dropped where it is code), and no attribute survives but an http(s) href (httpUrl).
// Plain text (HN, Remotive, a cut body) reads as paragraphs and bullet lists instead.
import { httpUrl } from '../httpUrl';

export type RichInline =
  | { t: 'text'; text: string }
  | { t: 'br' }
  | { t: 'strong' | 'em'; children: RichInline[] }
  | { t: 'a'; href: string; children: RichInline[] };

export type RichBlock =
  | { t: 'p'; children: RichInline[] }
  /** level 3 (the source's h1 / h2) or 4 (h3 to h6, and an all-caps line used as a heading):
   *  the page's h1 is the title and the Description panel's head is an h2. */
  | { t: 'h'; level: 3 | 4; text: string }
  | { t: 'ul' | 'ol'; items: RichBlock[][] };

/** Elements whose content is code or media, dropped with everything in them. */
const DROP = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'img',
  'svg',
  'math',
  'video',
  'audio',
  'canvas',
  'template',
  'noscript',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'head',
  'title',
  'meta',
  'link',
]);

const HEADING = /^h([1-6])$/;
const BLOCKISH = new Set([
  'p',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'blockquote',
  'pre',
  'table',
  'tbody',
  'tr',
  'td',
  'th',
]);

// ---- Sentence case for all-caps headings (CLAUDE.md: no ALL CAPS anywhere) ----

/** Kept as capitals when a heading is set in sentence case: short words people write in capitals. */
const ACRONYMS = new Set(
  'UX UI API APIS US USA UK EU EMEA APAC LATAM AI ML QA HR PTO CEO CTO CFO COO CPO VP SVP IPO SF NYC LA DC B2B B2C SAAS SQL CSS HTML JS TS IOS SDK SDKS CI CD AWS GCP KPI KPIS OKR OKRS R&D 401K FAQ ID DEI ADA EEO EEOC W2 PM PMS IC ICS'.split(
    ' ',
  ),
);

const isCaps = (s: string) => /[A-Z]/.test(s) && !/[a-z]/.test(s);

/** "ABOUT RAMP" → "About Ramp" when the company is Ramp, "WHAT YOU'LL DO" → "What you'll do",
 *  "UX AT RAMP" → "UX at Ramp". Only an all-caps line changes; anything with a lower-case letter is
 *  the author's own casing and stays. Acronyms: a word in ACRONYMS or with a digit stays in
 *  capitals; a word of the company's name (`keep`) takes its own casing. */
export function sentenceCase(line: string, keep: string[] = []): string {
  if (!isCaps(line)) return line;
  const named = new Map<string, string>();
  for (const k of keep)
    for (const w of k.split(/\s+/)) if (w && !isCaps(w)) named.set(w.toUpperCase(), w);
  let first = true;
  return line.replace(/[A-Z0-9][A-Z0-9'’&.-]*/g, (w) => {
    const bare = w.replace(/[’'.]S?$|[.-]$/, '');
    let out: string;
    if (named.has(bare)) out = named.get(bare)! + w.slice(bare.length).toLowerCase();
    else if (ACRONYMS.has(bare) || /\d/.test(bare)) out = bare + w.slice(bare.length).toLowerCase();
    else out = first ? w[0] + w.slice(1).toLowerCase() : w.toLowerCase();
    first = false;
    return out;
  });
}

/** A line written as a heading: all caps, short, no sentence end. */
const looksLikeCapsHeading = (s: string) =>
  isCaps(s) &&
  /[A-Z]{2}/.test(s) &&
  s.length <= 80 &&
  !/[.!?,;]$/.test(s.trim()) &&
  s.trim().split(/\s+/).length <= 10;

// ---- HTML ----

const squash = (s: string) => s.replace(/[\s\u00a0]+/g, ' ');

function inlineText(nodes: RichInline[]): string {
  return nodes
    .map((n) =>
      n.t === 'text' ? n.text : n.t === 'br' ? ' ' : 'children' in n ? inlineText(n.children) : '',
    )
    .join('');
}

function trimInline(nodes: RichInline[]): RichInline[] {
  const out = [...nodes];
  while (out.length && (out[0].t === 'br' || (out[0].t === 'text' && !out[0].text.trim())))
    out.shift();
  while (out.length) {
    const last = out[out.length - 1];
    if (last.t === 'br' || (last.t === 'text' && !last.text.trim())) out.pop();
    else break;
  }
  if (out[0]?.t === 'text') out[0] = { t: 'text', text: out[0].text.replace(/^\s+/, '') };
  const l = out.length - 1;
  if (out[l]?.t === 'text')
    out[l] = { t: 'text', text: (out[l] as { text: string }).text.replace(/\s+$/, '') };
  return out;
}

class Walker {
  blocks: RichBlock[] = [];
  private line: RichInline[] = [];
  constructor(private keep: string[]) {}

  /** Closes the open paragraph; an all-caps one standing alone reads as a heading. */
  flush(into: RichBlock[] = this.blocks) {
    const children = trimInline(this.line);
    this.line = [];
    if (!children.length) return;
    const text = inlineText(children).trim();
    if (!text) return;
    if (looksLikeCapsHeading(text))
      into.push({ t: 'h', level: 4, text: sentenceCase(text, this.keep) });
    else into.push({ t: 'p', children });
  }

  inline(node: Node): RichInline[] {
    if (node.nodeType === 3) return [{ t: 'text', text: squash(node.textContent ?? '') }];
    if (node.nodeType !== 1) return [];
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP.has(tag)) return [];
    if (tag === 'br') return [{ t: 'br' }];
    const kids = [...el.childNodes].flatMap((c) => this.inline(c));
    if (tag === 'strong' || tag === 'b') return [{ t: 'strong', children: kids }];
    if (tag === 'em' || tag === 'i') return [{ t: 'em', children: kids }];
    if (tag === 'a') {
      const href = httpUrl(el.getAttribute('href')?.trim());
      return href ? [{ t: 'a', href, children: kids }] : kids;
    }
    return kids; // span, u, font, …: their text only
  }

  block(node: Node, into: RichBlock[]) {
    if (node.nodeType === 3) {
      this.line.push({ t: 'text', text: squash(node.textContent ?? '') });
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP.has(tag)) return;
    const h = HEADING.exec(tag);
    if (h) {
      this.flush(into);
      const text = squash(el.textContent ?? '').trim();
      if (text)
        into.push({
          t: 'h',
          level: Number(h[1]) <= 2 ? 3 : 4,
          text: sentenceCase(text, this.keep),
        });
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      this.flush(into);
      const items: RichBlock[][] = [];
      for (const c of el.childNodes) {
        const item: RichBlock[] = [];
        if (c.nodeType === 1 && (c as Element).tagName.toLowerCase() === 'li') {
          for (const g of c.childNodes) this.block(g, item);
        } else this.block(c, item);
        this.flush(item);
        if (item.length) items.push(item);
      }
      if (items.length) into.push({ t: tag, items });
      return;
    }
    if (tag === 'li' || BLOCKISH.has(tag)) {
      this.flush(into);
      for (const c of el.childNodes) this.block(c, into);
      this.flush(into);
      return;
    }
    if (tag === 'br') {
      // Two breaks in a row end a paragraph; one stays a line break.
      const last = this.line[this.line.length - 1];
      if (last?.t === 'br') {
        this.line.pop();
        this.flush(into);
      } else this.line.push({ t: 'br' });
      return;
    }
    // An inline element wrapping blocks (`<span><p>…</p></span>`) is a container.
    if (el.querySelector('p, div, ul, ol, li, h1, h2, h3, h4, h5, h6, section, table')) {
      for (const c of el.childNodes) this.block(c, into);
      return;
    }
    // An inline element: a bold line alone in its paragraph may still be a heading (flush decides).
    this.line.push(...this.inline(el));
  }
}

/** The source's HTML as blocks, through the allow-list. `keep`: words that keep their casing when an
 *  all-caps heading is set in sentence case (the company's name). Needs a DOMParser (browser, jsdom). */
export function htmlToBlocks(html: string, keep: string[] = []): RichBlock[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const w = new Walker(keep);
  for (const c of doc.body.childNodes) w.block(c, w.blocks);
  w.flush();
  return w.blocks;
}

// ---- Plain text ----

const BULLET = /^\s*(?:[-*•·–◦▪]|\d{1,2}[.)])\s+/;

/** Plain text as blocks: blank lines and single lines split paragraphs, lines starting with a
 *  bullet ("- ", "• ", "1.") form a list, a short all-caps line or one ending in ":" alone is a
 *  heading. */
export function textToBlocks(text: string, keep: string[] = []): RichBlock[] {
  const out: RichBlock[] = [];
  let list: { t: 'ul' | 'ol'; items: RichBlock[][] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[\s\u00a0]+/g, ' ').trim();
    if (!line) {
      list = null;
      continue;
    }
    if (BULLET.test(line)) {
      const kind = /^\s*\d/.test(line) ? 'ol' : 'ul';
      if (!list || list.t !== kind) {
        list = { t: kind, items: [] };
        out.push(list);
      }
      list.items.push([{ t: 'p', children: [{ t: 'text', text: line.replace(BULLET, '') }] }]);
      continue;
    }
    list = null;
    if (looksLikeCapsHeading(line)) out.push({ t: 'h', level: 4, text: sentenceCase(line, keep) });
    else out.push({ t: 'p', children: [{ t: 'text', text: line }] });
  }
  return out;
}

/** Whether a body looks like HTML (any tag we know). */
export const isHtml = (s: string) =>
  /<\/?(p|br|ul|ol|li|div|h[1-6]|strong|b|em|i|a|span)\b[^>]*>/i.test(s);
