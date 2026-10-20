// Snippets become Outreach messages (#227, epic #225). Each Copy Deck snippet maps to one Base
// Outreach-message Document, except the starter cover letter, which is a Base Cover letter (#260). The document id is derived from the snippet id (`snippet-<id>`), so
// the mapping is traceable and running it again never duplicates or overwrites one already there,
// edited or not. Text, title, variable values and the pin carry over; `open` (UI state) and
// `pillars` (retired pillar scoping) are dropped. Pure: nothing here reads or writes a store, and
// nothing calls it at startup yet; the caller decides when (and should mark it done, so a message
// the user deletes afterwards is not brought back by a later run).
import type { Document } from './documents';
import { STARTER_SNIPPETS, type Snippet } from './copyDeckStore';

const PREFIX = 'snippet-';
/** The starter snippet that is a cover letter, not a message. */
const STARTER_COVER = 'tpl-cover';

/** The kind of Document a snippet moves into. */
export const kindForSnippet = (snippetId: string): 'cover' | 'outreach' =>
  snippetId === STARTER_COVER ? 'cover' : 'outreach';

export const documentIdForSnippet = (snippetId: string) => `${PREFIX}${snippetId}`;

/** The snippet a migrated document came from, or null for any other document. */
export const snippetIdOf = (documentId: string): string | null =>
  documentId.startsWith(PREFIX) && documentId.length > PREFIX.length
    ? documentId.slice(PREFIX.length)
    : null;

/** One snippet as a Base Outreach message (the starter cover letter: a Base Cover letter) with a
 *  single Version saved at `now`. */
export function snippetToDocument(s: Snippet, now: string): Document {
  const id = documentIdForSnippet(s.id);
  const d: Document = {
    id,
    kind: kindForSnippet(s.id),
    title: s.label?.trim() || 'Untitled message',
    base: true,
    createdAt: now,
    versions: [{ id: `${id}-v1`, text: typeof s.body === 'string' ? s.body : '', savedAt: now }],
  };
  if (s.pinned) d.pinned = true;
  const values = Object.entries(s.values ?? {}).filter(([, v]) => typeof v === 'string');
  if (values.length) d.values = Object.fromEntries(values);
  return d;
}

/** Existing documents plus one Outreach message for each snippet not migrated yet. Returns the
 *  same array when there is nothing to add. */
export function migrateSnippets(
  snippets: readonly Snippet[],
  docs: Document[],
  now: string,
): Document[] {
  const have = new Set(docs.map((d) => d.id));
  const added: Document[] = [];
  for (const s of snippets) {
    if (!s?.id) continue;
    const id = documentIdForSnippet(s.id);
    if (have.has(id)) continue;
    have.add(id);
    added.push(snippetToDocument(s, now));
  }
  return added.length ? [...docs, ...added] : docs;
}

/** Re-add any starter (`tpl-*`) that is missing, each as its own kind (only those of `kind` when
 *  given); never touches one that is there. */
export const restoreStarterOutreach = (docs: Document[], now: string, kind?: string): Document[] =>
  migrateSnippets(
    kind ? STARTER_SNIPPETS.filter((s) => kindForSnippet(s.id) === kind) : STARTER_SNIPPETS,
    docs,
    now,
  );

/** The starter cover letter moved before #260 was filed as an Outreach message: file it as a
 *  Cover letter, same id, title and Versions. Returns the same array when there is nothing to move.
 *  No kind is ever changed back, so this moves it once. */
export function fileStarterCover(docs: Document[]): Document[] {
  const id = documentIdForSnippet(STARTER_COVER);
  const i = docs.findIndex((d) => d.id === id && d.base && d.kind === 'outreach');
  if (i < 0) return docs;
  const next = [...docs];
  next[i] = { ...docs[i], kind: 'cover' };
  return next;
}
