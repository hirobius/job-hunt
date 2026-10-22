// Tile meta is still one "·"-separated string ("Metal fab · $18–22/hr · Spokane Valley · 509-…").
// Until it is migrated to structured fields (an open decision — spec docs/specs/discover.md, Q2),
// the tile card parses it at render: pay, place and contact become chips, everything else a note.
// Anything that doesn't parse stays in `notes` / `raw`, so no text is ever lost.

import { parseBoardUrl } from './feed/sources/ats';
import { SOURCE_LABEL } from './feed/types';

export interface MetaChip {
  kind: 'pay' | 'place' | 'contact';
  text: string;
}

export interface ParsedMeta {
  chips: MetaChip[];
  /** Every phone number found, in the order written (digits and dashes). */
  phones: string[];
  emails: string[];
  /** The segments that are neither pay, place nor contact. */
  notes: string[];
  raw: string;
}

const PHONE = /\b\d{3}-\d{3}-\d{4}\b/g;
const EMAIL = /[^\s@·]+@[^\s@·]+\.[a-z]{2,}/gi;
const PAY = /\$\s?\d|\/\s?(hr|hour|yr|year)\b/i;
// A segment counts as a place only when it IS one ("Spokane Valley", "Boise, ID"), not a sentence
// that mentions one ("Spokane Valley contractor").
const TOWN =
  "(?:Spokane(?: Valley)?|Liberty Lake|Cheney|Coeur d'Alene|Post Falls|Hayden|Mead|Airway Heights|Deer Park)";
const PLACE = new RegExp(
  `^${TOWN}(?: area)?(?: / ${TOWN})?(?:, (?:WA|ID))?$|^[A-Z][a-z]+(?: [A-Z][a-z]+)?, (?:WA|ID|OR)$`,
);

export function parseMeta(meta: string): ParsedMeta {
  const raw = (meta ?? '').trim();
  const out: ParsedMeta = { chips: [], phones: [], emails: [], notes: [], raw };
  if (!raw) return out;
  const segments = raw
    .split(/\s+·\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const seg of segments) {
    const phones = seg.match(PHONE);
    const emails = seg.match(EMAIL);
    if (phones || emails) {
      for (const p of phones ?? []) {
        out.phones.push(p);
        out.chips.push({ kind: 'contact', text: p });
      }
      for (const e of emails ?? []) {
        out.emails.push(e);
        out.chips.push({ kind: 'contact', text: e });
      }
      // A segment like "apply via Inland Empire Electrical 509-…" keeps its words as a note.
      const rest = seg
        .replace(PHONE, '')
        .replace(EMAIL, '')
        .replace(/[\s~,;]+$/g, '')
        .trim();
      if (rest.length > 3 && /[a-z]{3}/i.test(rest)) out.notes.push(rest);
    } else if (PAY.test(seg)) out.chips.push({ kind: 'pay', text: seg });
    else if (PLACE.test(seg)) out.chips.push({ kind: 'place', text: seg });
    else out.notes.push(seg);
  }
  return out;
}

const hostname = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

// A trailing "(Remote)" / "(Spokane)" in a tile's name is where it searches; the card's facts row
// carries it now (rev-3 H), so the title drops it.
const TRAILING_PLACE = new RegExp(
  `\\s+\\((Remote|Hybrid|On-?site|${TOWN}(?: area)?(?:, (?:WA|ID))?)\\)$`,
  'i',
);

/** "LinkedIn · Implementation Consultant (Remote)" → the source label, the title and the place it
 *  named (rev-3 H). A name with no source prefix is the company's own page: its domain is the
 *  source. */
export function splitTileName(
  name: string,
  url: string,
): { source: string; title: string; place?: string } {
  const m = /^([^·]{1,24}?)\s+·\s+(.+)$/.exec(name);
  // A company board (a watched company) is named by its hiring system ("Greenhouse"), the same
  // names Live postings uses; any other link by its host.
  const board = m ? null : parseBoardUrl(url);
  const source = m
    ? m[1].trim()
    : board
      ? SOURCE_LABEL[board.kind]
      : hostname(url).replace(/^www\./, '');
  const full = m ? m[2].trim() : name;
  const p = TRAILING_PLACE.exec(full);
  return p
    ? { source, title: full.slice(0, p.index).trim(), place: p[1] }
    : { source, title: full };
}

const DAY = 86400;
const windowLabel = (days: number): string =>
  days <= 1
    ? 'Past day'
    : days === 7
      ? 'Past week'
      : days >= 28 && days <= 31
        ? 'Past month'
        : `Past ${days} days`;

/** How recent the postings behind a search link are, read from the link itself (rev-3 H Calendar
 *  fact): LinkedIn's f_TPR=r<seconds>, Indeed's fromage=<days>, Google's tbs=qdr:<d|w|m>. A link
 *  that sets none of them shows "Any time". */
export function postedWindow(url: string): string {
  let q: URLSearchParams;
  try {
    q = new URL(url).searchParams;
  } catch {
    return 'Any time';
  }
  const tpr = /^r(\d+)$/.exec(q.get('f_TPR') ?? '');
  if (tpr) return windowLabel(Math.max(1, Math.round(Number(tpr[1]) / DAY)));
  const age = Number(q.get('fromage'));
  if (age > 0) return windowLabel(age);
  const qdr = /qdr:([dwmy])/.exec(q.get('tbs') ?? '');
  if (qdr) return { d: 'Past day', w: 'Past week', m: 'Past month', y: 'Past year' }[qdr[1]]!;
  return 'Any time';
}
