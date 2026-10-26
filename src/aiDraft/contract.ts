// AI drafting (#232, ADR 0009): what the browser and the one server function (`api/draft.ts`)
// agree on. The browser sends only the user's own text: the document's kind, its current text and
// what they asked for. Every failure has a named code, worded once here for the UI.
// Imports nothing that touches browser storage: the server function bundles this file.

export const DRAFT_PATH = '/api/draft';

/** Limits the server enforces (and the UI keeps to): long enough for a résumé, short enough that
 *  one draft stays a few cents. */
export const MAX_TEXT = 20_000;
export const MAX_INSTRUCTION = 2_000;
export const MAX_TITLE = 200;
/** Request bodies past this are refused before they are parsed. */
export const MAX_BODY_BYTES = 64 * 1024;

export type DraftMode = 'draft' | 'rewrite';

export interface DraftRequest {
  kind: DocumentKind;
  mode: DraftMode;
  title?: string;
  /** The document's current text ('' for a first draft). */
  text: string;
  /** What the user asked for ("Warmer, under 150 words"). */
  instruction: string;
}

export type DraftErrorCode =
  'not_set_up' | 'not_signed_in' | 'cap_reached' | 'provider_failed' | 'bad_input';

export type DraftResult =
  { ok: true; text: string } | { ok: false; code: DraftErrorCode; message: string };

/** The one wording per failure (the UI shows it as is). */
export const DRAFT_ERRORS: Record<DraftErrorCode, string> = {
  not_set_up: 'AI drafting is not set up.',
  not_signed_in: 'Sign in to draft with AI.',
  cap_reached: "This month's AI drafting budget is used up. It resets on the 1st.",
  provider_failed: "The AI couldn't write a draft just now. Try again in a minute.",
  bad_input: "That request can't be drafted.",
};

/** documents.ts DOCUMENT_KINDS, kept here so the server never loads the browser stores (a test
 *  pins the two lists together). */
export const DRAFT_KINDS = ['resume', 'cover', 'note', 'outreach'] as const;
export type DocumentKind = (typeof DRAFT_KINDS)[number];
const KINDS: readonly string[] = DRAFT_KINDS;

/** The request as sent, or the reason it is refused. Unknown keys are ignored. */
export function parseDraftRequest(raw: unknown): DraftRequest | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { error: 'Expected an object.' };
  const o = raw as Record<string, unknown>;
  if (typeof o.kind !== 'string' || !KINDS.includes(o.kind)) return { error: 'Unknown kind.' };
  if (o.mode !== 'draft' && o.mode !== 'rewrite') return { error: 'Unknown mode.' };
  const text = typeof o.text === 'string' ? o.text : '';
  const instruction = typeof o.instruction === 'string' ? o.instruction.trim() : '';
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  if (text.length > MAX_TEXT) return { error: `Text is over ${MAX_TEXT} characters.` };
  if (instruction.length > MAX_INSTRUCTION)
    return { error: `The request is over ${MAX_INSTRUCTION} characters.` };
  if (title.length > MAX_TITLE) return { error: 'Title is too long.' };
  if (o.mode === 'rewrite' && !text.trim()) return { error: 'There is no text to rewrite.' };
  if (o.mode === 'draft' && !instruction) return { error: 'Say what the draft should cover.' };
  return {
    kind: o.kind as DocumentKind,
    mode: o.mode,
    text,
    instruction,
    ...(title ? { title } : {}),
  };
}
