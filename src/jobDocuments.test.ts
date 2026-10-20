// The job page's Documents (#228): which documents belong to a Job, grouped by kind, the Sent one
// per kind, a Base document's copy, and the words for a refused Mark as Sent. Pure: table tests.
import { describe, expect, it } from 'vitest';
import type { Document } from './documents';
import {
  baseDocuments,
  copyBase,
  documentsByKind,
  documentsForJob,
  kindLabel,
  latestVersion,
  markSentMessage,
  sentByKind,
  sentSummary,
} from './jobDocuments';

const JOB = 'https://acme.example/jobs/1';
const OTHER = 'https://bolt.example/jobs/2';

let n = 0;
const doc = (over: Partial<Document> = {}): Document => {
  n += 1;
  return {
    id: `d${n}`,
    kind: 'cover',
    title: 'Cover letter',
    createdAt: `2026-10-0${(n % 9) + 1}T00:00:00.000Z`,
    versions: [{ id: `v${n}`, text: 'Dear team', savedAt: '2026-10-01T00:00:00.000Z' }],
    ...over,
  };
};

describe('documentsForJob', () => {
  const mine = doc({ jobUrl: JOB });
  const sameJobOtherSpelling = doc({ jobUrl: 'https://acme.example/jobs/1/', kind: 'resume' });
  const theirs = doc({ jobUrl: OTHER });
  const base = doc({ base: true });
  const companyOnly = doc({ company: 'Acme' });
  it.each([
    ['its own documents, matched like the job (dedupKey)', [mine, sameJobOtherSpelling], 2],
    ['not another job’s', [mine, theirs], 1],
    ['not a Base document', [mine, base], 1],
    ['not one tied only to a company', [mine, companyOnly], 1],
    ['nothing when there are none', [], 0],
  ] as const)('%s', (_name, docs, count) => {
    expect(documentsForJob([...docs], JOB)).toHaveLength(count);
  });
});

describe('documentsByKind', () => {
  it('groups in the kinds’ order (Résumé, Cover letter, Note, Outreach), skipping empty kinds', () => {
    const a = doc({ kind: 'outreach', jobUrl: JOB });
    const b = doc({ kind: 'resume', jobUrl: JOB });
    const c = doc({ kind: 'resume', jobUrl: JOB });
    const groups = documentsByKind([a, b, c]);
    expect(groups.map((g) => [g.kind, g.label, g.docs.length])).toEqual([
      ['resume', 'Résumé', 2],
      ['outreach', 'Outreach message', 1],
    ]);
  });
});

describe('sentByKind and sentSummary', () => {
  it('finds the one Sent version per kind, and says which kinds went out', () => {
    const cover = doc({
      jobUrl: JOB,
      versions: [
        { id: 'a', text: 'one', savedAt: '2026-10-01T00:00:00.000Z' },
        {
          id: 'b',
          text: 'two',
          savedAt: '2026-10-02T00:00:00.000Z',
          sentAt: '2026-10-03T00:00:00.000Z',
        },
      ],
    });
    const resume = doc({ jobUrl: JOB, kind: 'resume' });
    const sent = sentByKind([cover, resume]);
    expect(sent.get('cover')?.version.id).toBe('b');
    expect(sent.get('cover')?.number).toBe(2);
    expect(sent.get('cover')?.doc.id).toBe(cover.id);
    expect(sent.has('resume')).toBe(false);
    expect(sentSummary([cover, resume])).toBe('Cover letter v2');
    expect(sentSummary([resume])).toBe('');
    const sentResume = doc({
      jobUrl: JOB,
      kind: 'resume',
      versions: [{ id: 'r', text: 'cv', savedAt: '1', sentAt: '2' }],
    });
    expect(sentSummary([cover, sentResume])).toBe('Résumé v1, Cover letter v2');
  });
});

describe('copyBase', () => {
  it('copies the latest text of a Base document into the job, keeping kind and title', () => {
    const base = doc({
      base: true,
      kind: 'resume',
      title: 'Main résumé',
      versions: [
        { id: 'a', text: 'old', savedAt: '2026-10-01T00:00:00.000Z' },
        { id: 'b', text: 'new', savedAt: '2026-10-02T00:00:00.000Z' },
      ],
    });
    expect(copyBase(base, { url: JOB, company: 'Acme' })).toEqual({
      kind: 'resume',
      title: 'Main résumé',
      text: 'new',
      jobUrl: JOB,
      company: 'Acme',
    });
    expect(copyBase(base, { url: JOB }).company).toBeUndefined();
  });
});

describe('small helpers', () => {
  it('baseDocuments lists only Base documents', () => {
    const b = doc({ base: true });
    expect(baseDocuments([b, doc({ jobUrl: JOB })])).toEqual([b]);
  });
  it('latestVersion is the last saved', () => {
    const d = doc({
      versions: [
        { id: 'a', text: 'x', savedAt: '1' },
        { id: 'b', text: 'y', savedAt: '2' },
      ],
    });
    expect(latestVersion(d).id).toBe('b');
  });
  it('kindLabel names each kind', () => {
    expect(kindLabel('cover')).toBe('Cover letter');
    expect(kindLabel('note')).toBe('Note');
  });
  it.each([
    ['sent', 'cover', null],
    ['refused', 'cover', 'This job already has a Sent Cover letter. Only one can be sent per job.'],
    ['missing', 'resume', 'That version is gone. It may have been removed on another device.'],
  ] as const)('markSentMessage(%s)', (result, kind, msg) => {
    expect(markSentMessage(result, kind)).toBe(msg);
  });
});
