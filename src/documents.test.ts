// Documents (#226): a Document has ordered Versions; every save adds one; one Sent Version per
// kind per Job, locked once sent. Storage and the cloud are untrusted (sanitizeDocuments).
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDocument,
  DOCUMENTS_KEY,
  dropDocumentsForJob,
  getAllDocuments,
  markSent,
  mergeDocuments,
  removeDocument,
  renameDocument,
  replaceDocuments,
  sanitizeDocuments,
  saveVersion,
  setDocumentPinned,
  setDocumentValues,
  type Document,
} from './documents';

const JOB = 'https://acme.example/jobs/1';
const OTHER = 'https://bolt.example/jobs/2';

const doc = (over: Partial<Document> = {}): Document => ({
  id: 'd1',
  kind: 'cover',
  title: 'Cover letter',
  createdAt: '2026-10-01T00:00:00.000Z',
  versions: [{ id: 'v1', text: 'Dear team', savedAt: '2026-10-01T00:00:00.000Z' }],
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  replaceDocuments([]);
});

describe('versions', () => {
  it('a new document starts with one version, and every save adds one; earlier ones stay', () => {
    const id = createDocument({ kind: 'cover', title: 'Cover letter', jobUrl: JOB, text: 'v1' });
    expect(saveVersion(id, 'v2')).toBeTruthy();
    expect(saveVersion(id, 'v3')).toBeTruthy();
    const d = getAllDocuments().find((x) => x.id === id)!;
    expect(d.versions.map((v) => v.text)).toEqual(['v1', 'v2', 'v3']);
    expect(d.jobUrl).toBe(JOB);
  });

  it('saving the same text as the latest version adds nothing', () => {
    const id = createDocument({ kind: 'note', title: 'Notes', text: 'same' });
    expect(saveVersion(id, 'same')).toBeNull();
    expect(getAllDocuments()[0].versions).toHaveLength(1);
  });

  it('saving to a missing document does nothing', () => {
    expect(saveVersion('nope', 'x')).toBeNull();
  });

  it('persists and reads back', () => {
    createDocument({ kind: 'resume', title: 'Résumé', base: true, text: 'cv' });
    expect(JSON.parse(localStorage.getItem(DOCUMENTS_KEY)!)[0]).toMatchObject({
      kind: 'resume',
      base: true,
    });
  });
});

describe('the Sent lock', () => {
  it('marks a version Sent, and refuses a second Sent of the same kind for the same job', () => {
    const a = createDocument({ kind: 'cover', title: 'A', jobUrl: JOB, text: 'one' });
    const b = createDocument({ kind: 'cover', title: 'B', jobUrl: JOB, text: 'two' });
    const va = getAllDocuments().find((d) => d.id === a)!.versions[0].id;
    const vb = getAllDocuments().find((d) => d.id === b)!.versions[0].id;
    expect(markSent(a, va)).toBe('sent');
    expect(markSent(b, vb)).toBe('refused');
    expect(markSent(a, va)).toBe('refused');
    expect(getAllDocuments().find((d) => d.id === a)!.versions[0].sentAt).toBeTruthy();
  });

  it('another kind, or another job, can still be sent', () => {
    const a = createDocument({ kind: 'cover', title: 'A', jobUrl: JOB, text: 'one' });
    const r = createDocument({ kind: 'resume', title: 'R', jobUrl: JOB, text: 'cv' });
    const o = createDocument({ kind: 'cover', title: 'O', jobUrl: OTHER, text: 'x' });
    const first = (id: string) => getAllDocuments().find((d) => d.id === id)!.versions[0].id;
    expect(markSent(a, first(a))).toBe('sent');
    expect(markSent(r, first(r))).toBe('sent');
    expect(markSent(o, first(o))).toBe('sent');
  });

  it('a Base document has no job, so it is never sent', () => {
    const b = createDocument({ kind: 'resume', title: 'Base', base: true, text: 'cv' });
    expect(markSent(b, getAllDocuments()[0].versions[0].id)).toBe('refused');
    expect(markSent('nope', 'v')).toBe('missing');
  });

  it('saving after Sent adds a new version and leaves the Sent one as it was', () => {
    const a = createDocument({ kind: 'cover', title: 'A', jobUrl: JOB, text: 'sent text' });
    markSent(a, getAllDocuments()[0].versions[0].id);
    saveVersion(a, 'later');
    const d = getAllDocuments()[0];
    expect(d.versions.map((v) => [v.text, !!v.sentAt])).toEqual([
      ['sent text', true],
      ['later', false],
    ]);
  });

  it('a document with a Sent version cannot be deleted; one without can', () => {
    const a = createDocument({ kind: 'cover', title: 'A', jobUrl: JOB, text: 'x' });
    const n = createDocument({ kind: 'note', title: 'N', jobUrl: JOB, text: 'y' });
    markSent(a, getAllDocuments().find((d) => d.id === a)!.versions[0].id);
    expect(removeDocument(a)).toBe(false);
    expect(removeDocument(n)).toBe(true);
    expect(getAllDocuments().map((d) => d.id)).toEqual([a]);
  });
});

describe('dropped with its job', () => {
  it('drops every document linked to the job (matching the job, not the exact url text)', () => {
    createDocument({ kind: 'cover', title: 'A', jobUrl: JOB, text: 'x' });
    createDocument({ kind: 'note', title: 'B', jobUrl: OTHER, text: 'y' });
    createDocument({ kind: 'resume', title: 'Base', base: true, text: 'cv' });
    dropDocumentsForJob(`${JOB}/`);
    expect(
      getAllDocuments()
        .map((d) => d.title)
        .sort(),
    ).toEqual(['B', 'Base']);
  });
});

describe('sanitizeDocuments', () => {
  it.each([
    ['not an array', { x: 1 }, []],
    ['an unknown kind', [doc({ kind: 'memo' as never })], []],
    ['no versions', [doc({ versions: [] })], []],
    ['a version without text', [doc({ versions: [{ id: 'v', savedAt: 'x' } as never] })], []],
    ['no id', [doc({ id: '' })], []],
    ['a non-http job link', [doc({ jobUrl: 'javascript:alert(1)' })], [doc()]],
  ])('drops or cleans %s', (_name, raw, want) => {
    expect(sanitizeDocuments(raw)).toEqual(want);
  });

  it('keeps one document per id and versions in save order', () => {
    const v = (id: string, savedAt: string) => ({ id, text: id, savedAt });
    const out = sanitizeDocuments([
      doc({ versions: [v('b', '2026-10-02T00:00:00Z'), v('a', '2026-10-01T00:00:00Z')] }),
      doc({ title: 'dup' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].versions.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('keeps only the earliest Sent per kind per job', () => {
    const sent = (id: string, at: string) => ({
      id,
      kind: 'cover' as const,
      title: id,
      jobUrl: JOB,
      createdAt: at,
      versions: [{ id: `${id}v`, text: id, savedAt: at, sentAt: at }],
    });
    const out = sanitizeDocuments([
      sent('late', '2026-10-05T00:00:00Z'),
      sent('early', '2026-10-01T00:00:00Z'),
    ]);
    expect(out.find((d) => d.id === 'early')!.versions[0].sentAt).toBeTruthy();
    expect(out.find((d) => d.id === 'late')!.versions[0].sentAt).toBeUndefined();
  });
});

describe('mergeDocuments', () => {
  it('unions documents by id and versions by id; a document on one side only is kept', () => {
    const v = (id: string, savedAt: string) => ({ id, text: id, savedAt });
    const cloud = [
      doc({ versions: [v('v1', '2026-10-01T00:00:00Z'), v('c2', '2026-10-03T00:00:00Z')] }),
    ];
    const local = [
      doc({ versions: [v('v1', '2026-10-01T00:00:00Z'), v('l2', '2026-10-02T00:00:00Z')] }),
      doc({ id: 'local-only', title: 'Mine' }),
    ];
    const out = mergeDocuments(cloud, local);
    expect(out.find((d) => d.id === 'd1')!.versions.map((x) => x.id)).toEqual(['v1', 'l2', 'c2']);
    expect(out.some((d) => d.id === 'local-only')).toBe(true);
  });

  it('a Sent mark on either side survives the merge', () => {
    const at = '2026-10-01T00:00:00.000Z';
    const sentLocal = [
      doc({ jobUrl: JOB, versions: [{ id: 'v1', text: 'Dear team', savedAt: at, sentAt: at }] }),
    ];
    const out = mergeDocuments([doc({ jobUrl: JOB })], sentLocal);
    expect(out[0].versions[0].sentAt).toBe(at);
  });
});

describe('values, pin and title (#227)', () => {
  it('keeps string variable values and a pin; drops anything else', () => {
    const [d] = sanitizeDocuments([
      doc({
        values: { company: 'Acme', bad: 3 as unknown as string },
        pinned: 'yes' as unknown as true,
      }),
    ]);
    expect(d.values).toEqual({ company: 'Acme' });
    expect(d).not.toHaveProperty('pinned');
    expect(sanitizeDocuments([doc({ pinned: true, values: {} })])[0]).toMatchObject({
      pinned: true,
    });
    expect(sanitizeDocuments([doc({ values: {} })])[0]).not.toHaveProperty('values');
  });

  it('renames, pins and sets values without adding a version', () => {
    const id = createDocument({ kind: 'outreach', title: 'Hi', base: true, text: 't' });
    renameDocument(id, '  Hello  ');
    setDocumentPinned(id, true);
    setDocumentValues(id, { company: 'Acme' });
    const d = getAllDocuments().find((x) => x.id === id)!;
    expect(d).toMatchObject({ title: 'Hello', pinned: true, values: { company: 'Acme' } });
    expect(d.versions).toHaveLength(1);
    setDocumentPinned(id, false);
    expect(getAllDocuments()[0]).not.toHaveProperty('pinned');
  });
});
