// Tile meta is still one "·"-separated string ("Metal fab · $18–22/hr · Spokane Valley · 509-…").
// Until it is migrated to structured fields (an open decision — spec docs/specs/discover.md, Q2),
// the tile card parses it at render: pay, place and contact become chips, everything else a note.
// Anything that doesn't parse stays in `notes` / `raw`, so no text is ever lost.

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
