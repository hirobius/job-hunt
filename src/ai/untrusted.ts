// The posting is untrusted text written by whoever controls the job ad. Before it goes near a
// model it is normalised, stripped of everything a person can't see (control characters,
// zero-width and bidi marks, Unicode tag characters used to smuggle hidden instructions) and cut
// to a size cap. The same plain-text cleaner runs over every string the model sends back.

/** Characters sent per posting. A real job ad fits; a padded one is cut, never sent whole. */
export const MAX_POSTING_CHARS = 12_000;

// C0/C1 controls except tab and newline; DEL.
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
// Zero-width, joiners, word joiner and invisible operators, bidi embeddings/overrides/isolates,
// soft hyphen, Mongolian vowel separator, BOM.
const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;
// Unicode tag characters (U+E0000–U+E007F) and variation selectors: invisible carriers.
// eslint-disable-next-line no-misleading-character-class -- these are the invisible carriers we strip
const TAGS = /[\u{E0000}-\u{E007F}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]/gu;

export function stripInvisible(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(INVISIBLE, '')
    .replace(TAGS, '');
}

export interface CleanPosting {
  text: string;
  /** True when the posting was longer than the cap and was cut. */
  truncated: boolean;
}

export function cleanPosting(raw: string): CleanPosting {
  const text = stripInvisible(raw)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= MAX_POSTING_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_POSTING_CHARS), truncated: true };
}

// Anything that could become a link, an image or markup if some renderer ever treated the text
// as more than text: URLs of any scheme, bare domains with a path, markdown link/image syntax,
// HTML-ish brackets, backticks.
const URLISH = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S*/gi;
const SCHEMES = /\b(?:javascript|data|vbscript|file|mailto|tel):\S*/gi;
const DOMAIN_PATH = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*/gi;
const MD_IMAGE = /!\[[^\]\n]*\]\([^)\n]*\)?/g;
const MD_LINK = /\[([^\]\n]*)\]\([^)\n]*\)?/g;
const HTML_TAG = /<\/?[a-z!][^>]*>?/gi;
const MARKUP = /[<>`[\]{}|\\*_#~]/g;

/** One plain-text line from model output: no links, no markup, no hidden characters. */
export function plainText(raw: string, max: number): string {
  return stripInvisible(raw)
    .replace(MD_IMAGE, '')
    .replace(MD_LINK, '$1')
    .replace(HTML_TAG, '')
    .replace(URLISH, '')
    .replace(SCHEMES, '')
    .replace(DOMAIN_PATH, '')
    .replace(MARKUP, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}
