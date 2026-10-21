// Editing helpers for the Templates editor (#132, #221). The body is stored as plain text with
// `[Variable]` tokens; the editor shows each token as one chip and edits through these helpers, so
// a chip is inserted, stepped over and deleted as a unit and can never be half-edited.

/** The five tokens the editor offers: the four a job fills, and the user's own name. */
export const TOKEN_CHIPS = [
  { token: '[Company]', hint: "Fills from the job's company" },
  { token: '[Role]', hint: "Fills from the job's title" },
  { token: '[Contact]', hint: "Fills from the job's contact" },
  { token: '[Angle]', hint: "Fills from the job's angle (why you fit)" },
  { token: '[Your name]', hint: 'Fills from your Application kit name, or set it here' },
] as const;

/** Put `text` at the caret (or over the selection); with no caret it goes on the end. */
export function insertAt(
  value: string,
  start: number | null,
  end: number | null,
  text: string,
): { value: string; caret: number } {
  const from = start ?? value.length;
  const to = end ?? from;
  return { value: value.slice(0, from) + text + value.slice(to), caret: from + text.length };
}

// A chip's neighbours that need a space between them and it: a word, a closing chip, or (before it)
// the end of a sentence clause; an opening chip after it. A line edge or a space needs none.
const SPACE_BEFORE = /[\p{L}\p{N}\],.;:!?]/u;
const SPACE_AFTER = /[\p{L}\p{N}[]/u;

/** Put a variable token at the caret like `insertAt`, with a space on any side where it would
 *  otherwise touch a word, so a chip at the start of a line never reads "[Company]Hi" (#207). The
 *  caret lands after what was put in. */
export function insertToken(
  value: string,
  start: number | null,
  end: number | null,
  token: string,
): { value: string; caret: number } {
  const from = start ?? value.length;
  const to = end ?? from;
  const before = from > 0 && SPACE_BEFORE.test(value[from - 1]) ? ' ' : '';
  const after = to < value.length && SPACE_AFTER.test(value[to]) ? ' ' : '';
  return insertAt(value, from, to, before + token + after);
}

export type Segment = { kind: 'text'; text: string } | { kind: 'var'; token: string; name: string };

// A variable is any short bracketed name on one line: `[Company]`, `[Hiring manager]`.
const VARIABLE = /\[([^[\]\n]{1,40})\]/g;

/** The body as text runs and variable chips; joining them back gives the body exactly. */
export function splitVariables(value: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of value.matchAll(VARIABLE)) {
    const name = m[1].trim();
    if (!name) continue;
    if (m.index > last) out.push({ kind: 'text', text: value.slice(last, m.index) });
    out.push({ kind: 'var', token: m[0], name });
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push({ kind: 'text', text: value.slice(last) });
  return out;
}

const CANONICAL = new Map<string, string>(
  TOKEN_CHIPS.map((c) => [c.token.slice(1, -1).toLowerCase(), c.token.slice(1, -1)]),
);

/** Each variable the body uses, once, in order (matched without case; known names keep their case). */
export function templateVariables(value: string): string[] {
  const seen = new Map<string, string>();
  for (const s of splitVariables(value)) {
    if (s.kind !== 'var') continue;
    const key = s.name.toLowerCase();
    if (!seen.has(key)) seen.set(key, CANONICAL.get(key) ?? s.name);
  }
  return [...seen.values()];
}

/** Where each chip sits in the body, as [start, end) offsets. */
function chipSpans(value: string): [number, number][] {
  const spans: [number, number][] = [];
  let at = 0;
  for (const s of splitVariables(value)) {
    const len = s.kind === 'text' ? s.text.length : s.token.length;
    if (s.kind === 'var') spans.push([at, at + len]);
    at += len;
  }
  return spans;
}

/** Backspace just after (or Delete just before) a chip removes the whole chip; else null. */
export function removeChipAt(
  value: string,
  caret: number,
  dir: 'back' | 'forward',
): { value: string; caret: number } | null {
  const span = chipSpans(value).find(([a, b]) => (dir === 'back' ? b === caret : a === caret));
  if (!span) return null;
  return { value: value.slice(0, span[0]) + value.slice(span[1]), caret: span[0] };
}

/** An arrow key beside a chip moves past all of it; else null. */
export function stepOver(value: string, caret: number, dir: 'back' | 'forward'): number | null {
  const span = chipSpans(value).find(([a, b]) => (dir === 'back' ? b === caret : a === caret));
  return span ? (dir === 'back' ? span[0] : span[1]) : null;
}

/** A caret can't sit inside a chip: one that lands there moves to the chip's end. */
export function snapOutOfChip(value: string, caret: number): number {
  const span = chipSpans(value).find(([a, b]) => caret > a && caret < b);
  return span ? span[1] : caret;
}
