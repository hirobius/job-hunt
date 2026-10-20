// Snippets become Outreach messages (#227, epic #225). Each Copy Deck snippet maps to one Base
// Outreach-message Document. The document id is derived from the snippet id (`snippet-<id>`), so
// the mapping is traceable and running it again never duplicates or overwrites one already there,
// edited or not. Text, title, variable values and the pin carry over; `open` (UI state) and
// `pillars` (retired pillar scoping) are dropped. Pure: nothing here reads or writes a store, and
// nothing calls it at startup yet; the caller decides when (and should mark it done, so a message
// the user deletes afterwards is not brought back by a later run).
import type { Document } from './documents';
import { STARTER_SNIPPETS, type Snippet } from './copyDeckStore';

const PREFIX = 'snippet-';

export const documentIdForSnippet = (snippetId: string) => `${PREFIX}${snippetId}`;

/** The snippet a migrated document came from, or null for any other document. */
export const snippetIdOf = (documentId: string): string | null =>
  documentId.startsWith(PREFIX) && documentId.length > PREFIX.length
    ? documentId.slice(PREFIX.length)
    : null;

/** One snippet as a Base Outreach message with a single Version saved at `now`. */
export function snippetToDocument(s: Snippet, now: string): Document {
  const id = documentIdForSnippet(s.id);
  const d: Document = {
    id,
    kind: 'outreach',
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

/** Re-add any starter Outreach message (`tpl-*`) that is missing; never touches one that is there. */
export const restoreStarterOutreach = (docs: Document[], now: string): Document[] =>
  migrateSnippets(STARTER_SNIPPETS, docs, now);
