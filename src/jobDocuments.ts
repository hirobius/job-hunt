// The job page's Documents (#228, epic #225): the read side of `documents.ts` for one Job. Which
// documents are the Job's (matched by dedupKey, like the job itself), grouped in the kinds' order,
// the one Sent Version per kind, the copy a Base document makes, and the words for a refused
// Mark as Sent. Pure, so the tab and the header share it and it is table-tested.
import { DOCUMENT_KINDS, type Document, type DocumentKind, type Version } from './documents';
import { dedupKey } from './store';

export const kindLabel = (kind: DocumentKind) =>
  DOCUMENT_KINDS.find((k) => k.kind === kind)?.label ?? kind;

export const latestVersion = (d: Document): Version => d.versions[d.versions.length - 1];

/** The Job's own documents (not Base documents, not company-only ones), oldest first. */
export function documentsForJob(docs: Document[], jobUrl: string): Document[] {
  const key = dedupKey(jobUrl);
  return docs.filter((d) => !d.base && d.jobUrl && dedupKey(d.jobUrl) === key);
}

export const baseDocuments = (docs: Document[]) => docs.filter((d) => d.base);

export interface KindGroup {
  kind: DocumentKind;
  label: string;
  docs: Document[];
}

/** Documents grouped by kind in DOCUMENT_KINDS order; kinds with none are left out. */
export function documentsByKind(docs: Document[]): KindGroup[] {
  return DOCUMENT_KINDS.map(({ kind, label }) => ({
    kind,
    label,
    docs: docs.filter((d) => d.kind === kind),
  })).filter((g) => g.docs.length > 0);
}

export interface SentVersion {
  doc: Document;
  version: Version;
  /** 1-based, as the history numbers it. */
  number: number;
}

/** The Sent Version of each kind among one Job's documents (at most one per kind). */
export function sentByKind(jobDocs: Document[]): Map<DocumentKind, SentVersion> {
  const out = new Map<DocumentKind, SentVersion>();
  for (const doc of jobDocs) {
    const i = doc.versions.findIndex((v) => v.sentAt);
    if (i >= 0 && !out.has(doc.kind))
      out.set(doc.kind, { doc, version: doc.versions[i], number: i + 1 });
  }
  return out;
}

/** "Résumé v1, Cover letter v2" for the job header; empty when nothing was sent. */
export function sentSummary(jobDocs: Document[]): string {
  const sent = sentByKind(jobDocs);
  return DOCUMENT_KINDS.filter(({ kind }) => sent.has(kind))
    .map(({ kind, label }) => `${label} v${sent.get(kind)!.number}`)
    .join(', ');
}

/** What createDocument takes to copy a Base document into a Job: its latest text, as a new and
 *  independent document (editing either never changes the other). */
export function copyBase(base: Document, job: { url: string; company?: string }) {
  return {
    kind: base.kind,
    title: base.title,
    text: latestVersion(base).text,
    jobUrl: job.url,
    ...(job.company?.trim() ? { company: job.company.trim() } : {}),
  };
}

/** What to tell the user after markSent; null when it worked. */
export function markSentMessage(
  result: 'sent' | 'refused' | 'missing',
  kind: DocumentKind,
): string | null {
  if (result === 'sent') return null;
  if (result === 'refused')
    return `This job already has a Sent ${kindLabel(kind)}. Only one can be sent per job.`;
  return 'That version is gone. It may have been removed on another device.';
}
