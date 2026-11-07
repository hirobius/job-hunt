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
import { documentsHash } from './route';
import {
  getAllDocuments,
  isFinalCopy,
  replaceDocuments,
  useDocuments,
  type Document,
} from './documents';
import {
  documentIdForSnippet,
  fileStarterCover,
  migrateSnippets,
  snippetIdOf,
} from './snippetMigration';

export interface OutreachTemplate extends Pick<Snippet, 'id' | 'label' | 'body' | 'values'> {
  pinned?: boolean;
  /** The Document it reads, for links into the library. */
  documentId: string;
}

// The starter cover letter is a Cover letter (#260) but the kit's letters and the Apply sheet fill
// it, so a Base Cover letter moved from a snippet stays a template; other cover letters do not.
const isTemplate = (d: Document) =>
  !!d.base &&
  !d.versions.some((v) => v.file) &&
  (d.kind === 'outreach' || (d.kind === 'cover' && snippetIdOf(d.id) !== null));

/** Base Outreach messages (and the moved starter cover letter) as templates: latest Version's text, pinned first, else saved order. */
export function outreachTemplates(docs: readonly Document[]): OutreachTemplate[] {
  const list = docs.filter(isTemplate).map((d): OutreachTemplate => ({
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
export const documentHref = (id: string) => documentsHash(id);

/** A document the library's editor can open: a Base one with text (a final copy takes none). */
const editable = (d: Document) => !!d.base && !isFinalCopy(d);

/** The document a `#/copy-deck/<id>` route names: the id itself, or the message an old snippet
 *  link's snippet became. Null when there is none (yet), or when it is not a Base document with
 *  text (#328: a job's own document or a final copy lives on its job page). */
export function resolveDocumentId(id: string, docs: readonly Document[]): string | null {
  const has = (x: string) => docs.some((d) => d.id === x && editable(d));
  if (has(id)) return id;
  const moved = documentIdForSnippet(id);
  return has(moved) ? moved : null;
}

/** The job a `#/copy-deck/<id>` route's document belongs to, when it is a job's own document or
 *  final copy (#328): the link opens that job's page instead. */
export function documentJobUrl(id: string, docs: readonly Document[]): string | null {
  const d = docs.find((x) => x.id === id);
  return d && !editable(d) && d.jobUrl ? d.jobUrl : null;
}

/** Move every snippet not moved yet into the library and mark it. Returns how many messages were
 *  added. Run once sync has settled, so the cloud's marks (and messages) are already here. */
export function migrateSnippetStore(now: string = new Date().toISOString()): number {
  const filed = fileStarterCover(getAllDocuments());
  if (filed !== getAllDocuments()) replaceDocuments(filed);
  const snippets = getSnippets();
  const pending = snippets.filter((s) => s?.id && !s.migrated);
  if (!pending.length) return 0;
  const docs = getAllDocuments();
  const next = migrateSnippets(pending, docs, now);
  if (next !== docs) replaceDocuments(next);
  replaceSnippets(snippets.map((s) => (s.migrated ? s : { ...s, migrated: true })));
  return next.length - docs.length;
}
