// Documents (#226, epic #225): a Résumé, Cover letter, Note or Outreach message, optionally linked to
// a Job or a Company, or kept as a Base document to copy into jobs. Each save adds a Version, so
// earlier text stays readable. One Version per kind per Job can be marked Sent; a Sent Version is
// locked (it cannot be un-sent, moved or deleted). Persisted in `rjb_documents` and synced in the
// blob (v10, ADR 0008 addendum) like every store the user edits. Storage and the cloud are
// untrusted: everything goes through sanitizeDocuments.
//
// Final copies (#231): an uploaded PDF/Word file is a Document whose one Version carries `file`
// (base64) and no text. Storage choice: the file lives in this synced blob, not Supabase Storage
// (no storage bucket is set up, and settings are not ours to change). That reuses the Sent lock,
// sync, backup and drop-with-job, and keeps the file inside the user's RLS-protected row with no
// public link. The cost is size, so uploads are capped: 500 KB per file, 2 MB per account.
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

/** An uploaded final copy: a PDF or Word file, base64 in `data`. */
export interface FinalFile {
  name: string;
  /** MIME type, filled in from the name when the browser gave none. */
  type: string;
  /** Bytes, as decoded from `data`. */
  size: number;
  data: string;
}

export interface Version {
  id: string;
  /** '' on a final copy, whose content is `file`. */
  text: string;
  /** Set on a final copy (#231). */
  file?: FinalFile;
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

// --- Final copies (#231) ---

export const UPLOAD_MAX_BYTES = 500 * 1024;
export const UPLOAD_TOTAL_BYTES = 2 * 1024 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const MIMES = new Set(Object.values(MIME_BY_EXT));
const extOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? '';
/** The MIME type for an allowed file, or null. The name must be .pdf/.doc/.docx, and the browser's
 *  type (when it gave one) must be a PDF or Word type too. */
function allowedType(name: string, type: string): string | null {
  const fromExt = MIME_BY_EXT[extOf(name)];
  if (!fromExt) return null;
  if (!type) return fromExt;
  return MIMES.has(type) ? type : null;
}
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const decodedLength = (b64: string) =>
  (b64.length / 4) * 3 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/** "1.2 MB", "500 KB". */
export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

/** Why this file can't be uploaded, given the bytes already uploaded, or null when it can. */
export function uploadError(
  f: { name: string; type: string; size: number },
  usedBytes: number,
): string | null {
  if (!allowedType(f.name, f.type)) return 'Only PDF or Word files can be uploaded.';
  if (f.size <= 0) return 'That file is empty.';
  if (f.size > UPLOAD_MAX_BYTES)
    return `That file is ${formatBytes(f.size)}. Uploads can be up to ${formatBytes(UPLOAD_MAX_BYTES)}.`;
  if (usedBytes + f.size > UPLOAD_TOTAL_BYTES)
    return `Uploads are full (${formatBytes(UPLOAD_TOTAL_BYTES)}). Remove one first.`;
  return null;
}

/** Bytes of every uploaded file in these documents. */
export const uploadedBytes = (docs: Document[]) =>
  docs.reduce((n, d) => n + d.versions.reduce((m, v) => m + (v.file?.size ?? 0), 0), 0);

/** A final copy holds an uploaded file and takes no text Versions. */
export const isFinalCopy = (d: Document) => d.versions.some((v) => v.file);

function cleanFile(raw: unknown): FinalFile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const name = str(o.name).trim().slice(0, 255);
  const type = name ? allowedType(name, str(o.type)) : null;
  const data = str(o.data);
  if (!type || !data || !BASE64.test(data)) return null;
  const size = decodedLength(data);
  if (size <= 0 || size > UPLOAD_MAX_BYTES) return null;
  return { name, type, size, data };
}

/** Read a picked file into a FinalFile (no checks: run uploadError on the File first). */
export async function readFinalFile(f: File): Promise<FinalFile> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return {
    name: f.name,
    type: allowedType(f.name, f.type) ?? f.type,
    size: bytes.length,
    data: btoa(bin),
  };
}

/** The uploaded file as a Blob, to download it back. */
export function finalFileBlob(f: FinalFile): Blob {
  const bin = atob(f.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: f.type });
}

function cleanVersion(raw: unknown): Version | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!str(o.id) || typeof o.text !== 'string' || !str(o.savedAt)) return null;
  const v: Version = { id: str(o.id), text: o.text, savedAt: str(o.savedAt) };
  if (o.file !== undefined) {
    // A corrupt or oversized file drops its Version: an empty "final copy" would mislead.
    const file = cleanFile(o.file);
    if (!file) return null;
    v.text = '';
    v.file = file;
  }
  if (str(o.sentAt)) v.sentAt = str(o.sentAt);
  return v;
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
 *  the latest Version, no such document, or a final copy, which takes no text). */
export function saveVersion(id: string, text: string): string | null {
  const d = store.get().find((x) => x.id === id);
  if (!d || isFinalCopy(d) || d.versions[d.versions.length - 1].text === text) return null;
  const v: Version = { id: newId(), text, savedAt: new Date().toISOString() };
  update(id, (x) => ({ ...x, versions: [...x.versions, v] }));
  return v.id;
}

/** Attach an uploaded file to a Job as a final copy of a kind: a new Document (titled with the
 *  file name) whose one Version holds the file. The 2 MB total counts every upload already kept.
 *  The total is checked here, not in sanitizeDocuments, so a merge never silently drops a file. */
export function addFinalCopy(input: {
  kind: DocumentKind;
  jobUrl: string;
  file: FinalFile;
}): { ok: true; id: string; versionId: string } | { ok: false; error: string } {
  if (!httpUrl(input.jobUrl)) return { ok: false, error: 'A final copy needs a job.' };
  const error = uploadError(input.file, uploadedBytes(store.get()));
  if (error) return { ok: false, error };
  const file = cleanFile(input.file);
  if (!file) return { ok: false, error: 'That file could not be read. Try choosing it again.' };
  const now = new Date().toISOString();
  const d: Document = {
    id: newId(),
    kind: input.kind,
    title: file.name,
    jobUrl: input.jobUrl,
    createdAt: now,
    versions: [{ id: newId(), text: '', savedAt: now, file }],
  };
  replaceDocuments([...store.get(), d]);
  return { ok: true, id: d.id, versionId: d.versions[0].id };
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
