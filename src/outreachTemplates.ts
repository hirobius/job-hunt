// Outreach messages are the templates (#227, epic #225). The fill paths (Use template, the
// follow-up dialog, the Apply sheet and the Application kit's letters) read the Base Outreach-
// message Documents through this adapter, so an edit saved in the Documents library is what they
// fill. A message moved from a snippet keeps the snippet's id here (`snippet-tpl-followup` reads as
// `tpl-followup`), so the follow-up template and the kit's saved picks still find it.
//
// The move itself runs once per snippet: each snippet is marked `migrated` in the (still synced)
// legacy store when its message is made, so a message deleted afterwards is never made again, and a
// second device whose snippets arrive already marked adds nothing. The document id is derived from
// the snippet id, so a run that races another device never duplicates one either.
import { useMemo } from 'react';
import { getSnippets, replaceSnippets, type Snippet } from './copyDeckStore';
import { getAllDocuments, replaceDocuments, useDocuments, type Document } from './documents';
import { documentIdForSnippet, migrateSnippets, snippetIdOf } from './snippetMigration';

export interface OutreachTemplate extends Pick<Snippet, 'id' | 'label' | 'body' | 'values'> {
  pinned?: boolean;
  /** The Document it reads, for links into the library. */
  documentId: string;
}

const isOutreachBase = (d: Document) =>
  d.kind === 'outreach' && !!d.base && !d.versions.some((v) => v.file);

/** Base Outreach messages as templates: latest Version's text, pinned first, else saved order. */
export function outreachTemplates(docs: readonly Document[]): OutreachTemplate[] {
  const list = docs.filter(isOutreachBase).map((d): OutreachTemplate => ({
    id: snippetIdOf(d.id) ?? d.id,
    documentId: d.id,
    label: d.title,
    body: d.versions[d.versions.length - 1].text,
    ...(d.pinned ? { pinned: true } : {}),
    ...(d.values ? { values: d.values } : {}),
  }));
  return [...list.filter((t) => t.pinned), ...list.filter((t) => !t.pinned)];
}

/** The templates, live (re-renders when a document changes). */
export function useOutreachTemplates(): OutreachTemplate[] {
  const docs = useDocuments();
  return useMemo(() => outreachTemplates(docs), [docs]);
}

/** The library link for a template or document. */
export const documentHref = (id: string) => `#/copy-deck/${encodeURIComponent(id)}`;

/** The document a `#/copy-deck/<id>` route names: the id itself, or the message an old snippet
 *  link's snippet became. Null when there is none (yet). */
export function resolveDocumentId(id: string, docs: readonly Document[]): string | null {
  if (docs.some((d) => d.id === id)) return id;
  const moved = documentIdForSnippet(id);
  return docs.some((d) => d.id === moved) ? moved : null;
}

/** Move every snippet not moved yet into the library and mark it. Returns how many messages were
 *  added. Run once sync has settled, so the cloud's marks (and messages) are already here. */
export function migrateSnippetStore(now: string = new Date().toISOString()): number {
  const snippets = getSnippets();
  const pending = snippets.filter((s) => s?.id && !s.migrated);
  if (!pending.length) return 0;
  const docs = getAllDocuments();
  const next = migrateSnippets(pending, docs, now);
  if (next !== docs) replaceDocuments(next);
  replaceSnippets(snippets.map((s) => (s.migrated ? s : { ...s, migrated: true })));
  return next.length - docs.length;
}
