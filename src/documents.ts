// Documents (#226, epic #225): a Résumé, Cover letter, Note or Outreach message, optionally linked to
// a Job or a Company, or kept as a Base document to copy into jobs. Each save adds a Version, so
// earlier text stays readable. One Version per kind per Job can be marked Sent; a Sent Version is
// locked (it cannot be un-sent, moved or deleted). Persisted in `rjb_documents` and synced in the
// blob (v10, ADR 0008 addendum) like every store the user edits. Storage and the cloud are
// untrusted: everything goes through sanitizeDocuments.
import { createStore } from './createStore';
import { loadPersisted, savePersisted } from './persisted';
import { dedupKey } from './store';
import { isSample } from './demo/isSample';
import type { Job } from './types';

export const DOCUMENTS_KEY = 'rjb_documents';

export const DOCUMENT_KINDS = [
  { kind: 'resume', label: 'Résumé' },
  { kind: 'cover', label: 'Cover letter' },
  { kind: 'note', label: 'Note' },
  { kind: 'outreach', label: 'Outreach message' },
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]['kind'];

export interface Version {
  id: string;
  text: string;
  /** ISO time of the save. */
  savedAt: string;
  /** ISO time it was marked Sent; a Sent Version is locked. */
  sentAt?: string;
}

export interface Document {
  id: string;
  kind: DocumentKind;
  title: string;
  /** The Job it belongs to, by its stored url (matched by dedupKey). */
  jobUrl?: string;
  /** The Company it belongs to, by name. */
  company?: string;
  /** A Base document: copied into a Job, never sent itself. */
  base?: true;
  /** Shown first in the library (#227; a snippet's pin carries over). */
  pinned?: true;
  /** Variable values set on an Outreach message (#227, from `Snippet.values`), keyed by lower-case
   *  name; the text keeps its `[Token]`s. */
  values?: Record<string, string>;
  createdAt: string;
  /** Oldest first. Never empty. */
  versions: Version[];
}

const KINDS = DOCUMENT_KINDS.map((k) => k.kind) as string[];
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const httpUrl = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  try {
    const p = new URL(v).protocol;
    return p === 'http:' || p === 'https:' ? v : undefined;
  } catch {
    return undefined;
  }
};
const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
const byTime = (a: { savedAt: string }, b: { savedAt: string }) =>
  a.savedAt.localeCompare(b.savedAt);
const jobKey = (d: Document) => (d.jobUrl ? dedupKey(d.jobUrl) : '');

function cleanVersion(raw: unknown): Version | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!str(o.id) || typeof o.text !== 'string' || !str(o.savedAt)) return null;
  const v: Version = { id: str(o.id), text: o.text, savedAt: str(o.savedAt) };
  if (str(o.sentAt)) v.sentAt = str(o.sentAt);
  return v;
}

/** Own string values only (a key like `__proto__` stays a plain key); none → undefined. */
function cleanValues(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const entries = Object.entries(raw as Record<string, unknown>).filter(
    (e): e is [string, string] => typeof e[1] === 'string',
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function cleanDocument(raw: unknown): Document | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!str(o.id) || !KINDS.includes(str(o.kind))) return null;
  const seen = new Set<string>();
  const versions = (Array.isArray(o.versions) ? o.versions : [])
    .map(cleanVersion)
    .filter((v): v is Version => !!v && !seen.has(v.id) && !!seen.add(v.id))
    .sort(byTime);
  if (!versions.length) return null;
  const d: Document = {
    id: str(o.id),
    kind: str(o.kind) as DocumentKind,
    title: str(o.title),
    createdAt: str(o.createdAt) || versions[0].savedAt,
    versions,
  };
  const jobUrl = httpUrl(o.jobUrl);
  if (jobUrl) d.jobUrl = jobUrl;
  if (str(o.company).trim()) d.company = str(o.company).trim();
  if (o.base === true) d.base = true;
  if (o.pinned === true) d.pinned = true;
  const values = cleanValues(o.values);
  if (values) d.values = values;
  // A Base document is never sent, and only a job's document can be.
  if (d.base || !d.jobUrl) d.versions = versions.map(({ sentAt: _sent, ...v }) => v);
  return d;
}

/** Well-formed documents, one per id, versions oldest first, and at most one Sent Version per
 *  kind per Job (the earliest sent keeps it). */
export function sanitizeDocuments(raw: unknown): Document[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const docs = raw
    .map(cleanDocument)
    .filter((d): d is Document => !!d && !ids.has(d.id) && !!ids.add(d.id));
  const winner = new Map<string, string>(); // "<job>|<kind>" → version id
  docs
    .flatMap((d) => d.versions.filter((v) => v.sentAt).map((v) => ({ d, v })))
    .sort((a, b) => a.v.sentAt!.localeCompare(b.v.sentAt!))
    .forEach(({ d, v }) => {
      const k = `${jobKey(d)}|${d.kind}`;
      if (!winner.has(k)) winner.set(k, v.id);
    });
  return docs.map((d) => {
    const keep = winner.get(`${jobKey(d)}|${d.kind}`);
    if (!d.versions.some((v) => v.sentAt && v.id !== keep)) return d;
    return {
      ...d,
      versions: d.versions.map((v) => {
        if (!v.sentAt || v.id === keep) return v;
        const { sentAt: _sent, ...rest } = v;
        return rest;
      }),
    };
  });
}

const store = createStore<Document[]>(
  sanitizeDocuments(loadPersisted<unknown>(DOCUMENTS_KEY, [])),
  { onSet: (next) => savePersisted(DOCUMENTS_KEY, next) },
);

export const useDocuments = store.use;
export const getAllDocuments = store.get;
export const replaceDocuments = (next: Document[]) => store.set(sanitizeDocuments(next));

/** First sign-in (and a backup merge): documents union by id; a shared document keeps the
 *  versions of both sides (union by id, oldest first), and a Sent mark on either side stays. */
export function mergeDocuments(cloud: Document[] | null, local: Document[]): Document[] {
  const out = new Map<string, Document>();
  for (const d of local) out.set(d.id, d);
  for (const c of cloud ?? []) {
    const l = out.get(c.id);
    if (!l) {
      out.set(c.id, c);
      continue;
    }
    const versions = new Map(l.versions.map((v) => [v.id, v]));
    for (const v of c.versions) {
      const sentAt = v.sentAt ?? versions.get(v.id)?.sentAt;
      versions.set(v.id, sentAt ? { ...v, sentAt } : v);
    }
    out.set(c.id, { ...c, versions: [...versions.values()].sort(byTime) });
  }
  return sanitizeDocuments([...out.values()]);
}

const update = (id: string, fn: (d: Document) => Document) =>
  store.set(store.get().map((d) => (d.id === id ? fn(d) : d)));

/** Make a document with its first Version. Returns its id. */
export function createDocument(input: {
  kind: DocumentKind;
  title: string;
  text?: string;
  jobUrl?: string;
  company?: string;
  base?: boolean;
}): string {
  const now = new Date().toISOString();
  const d: Document = {
    id: newId(),
    kind: input.kind,
    title: input.title.trim(),
    createdAt: now,
    versions: [{ id: newId(), text: input.text ?? '', savedAt: now }],
  };
  if (input.base) d.base = true;
  else if (input.jobUrl) d.jobUrl = input.jobUrl;
  if (input.company?.trim()) d.company = input.company.trim();
  replaceDocuments([...store.get(), d]);
  return d.id;
}

/** Save new text as a new Version. Returns its id, or null when nothing changed (same text as
 *  the latest Version, or no such document). */
export function saveVersion(id: string, text: string): string | null {
  const d = store.get().find((x) => x.id === id);
  if (!d || d.versions[d.versions.length - 1].text === text) return null;
  const v: Version = { id: newId(), text, savedAt: new Date().toISOString() };
  update(id, (x) => ({ ...x, versions: [...x.versions, v] }));
  return v.id;
}

/** Rename a document. Not a save: the title has no Versions. */
export function renameDocument(id: string, title: string) {
  update(id, (x) => ({ ...x, title: title.trim() }));
}

/** Pin or unpin a document in the library. */
export function setDocumentPinned(id: string, pinned: boolean) {
  update(id, ({ pinned: _p, ...x }) => (pinned ? { ...x, pinned: true } : x));
}

/** Set an Outreach message's variable values (keyed by lower-case name); empty ones are dropped. */
export function setDocumentValues(id: string, values: Record<string, string>) {
  const clean = cleanValues(Object.fromEntries(Object.entries(values).filter(([, v]) => v)));
  update(id, ({ values: _v, ...x }) => (clean ? { ...x, values: clean } : x));
}

/** Mark one Version Sent. Refused for a Base or unlinked document, or when this Job already has a
 *  Sent document of this kind (this one included). */
export function markSent(id: string, versionId: string): 'sent' | 'refused' | 'missing' {
  const all = store.get();
  const d = all.find((x) => x.id === id);
  if (!d || !d.versions.some((v) => v.id === versionId)) return 'missing';
  if (d.base || !d.jobUrl) return 'refused';
  const taken = all.some(
    (x) => x.kind === d.kind && jobKey(x) === jobKey(d) && x.versions.some((v) => v.sentAt),
  );
  if (taken) return 'refused';
  const sentAt = new Date().toISOString();
  update(id, (x) => ({
    ...x,
    versions: x.versions.map((v) => (v.id === versionId ? { ...v, sentAt } : v)),
  }));
  return 'sent';
}

/** Delete a document. A document holding a Sent Version is locked: refused (false). */
export function removeDocument(id: string): boolean {
  const d = store.get().find((x) => x.id === id);
  if (!d || d.versions.some((v) => v.sentAt)) return false;
  store.set(store.get().filter((x) => x.id !== id));
  return true;
}

/** A Job deleted for good takes its documents with it (Sent ones too). */
export function dropDocumentsForJob(url: string) {
  const key = dedupKey(url);
  const next = store.get().filter((d) => jobKey(d) !== key);
  if (next.length !== store.get().length) store.set(next);
}

/** A sample job's documents stay on this device, like the job itself (never synced or backed up). */
export function withoutSampleDocuments(docs: Document[], jobs: Job[]): Document[] {
  const sample = new Set(jobs.filter(isSample).map((j) => dedupKey(j.url)));
  return docs.filter((d) => !d.jobUrl || !sample.has(dedupKey(d.jobUrl)));
}
