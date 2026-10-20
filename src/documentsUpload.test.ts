// Final copies (#231): a PDF/Word file attached to a Job as a Document whose one Version carries
// the file (base64) instead of text. It lives in the synced blob, so the caps keep it small.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addFinalCopy,
  createDocument,
  finalFileBlob,
  formatBytes,
  getAllDocuments,
  isFinalCopy,
  markSent,
  readFinalFile,
  removeDocument,
  replaceDocuments,
  sanitizeDocuments,
  saveVersion,
  uploadedBytes,
  uploadError,
  UPLOAD_MAX_BYTES,
  UPLOAD_TOTAL_BYTES,
  type Document,
  type FinalFile,
} from './documents';

const JOB = 'https://acme.example/jobs/1';
const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const KB = 1024;

/** Base64 of n bytes of zeros ('AAAA' is 3 zero bytes). */
const b64 = (n: number) => {
  const pad = n % 3;
  const body = 'AAAA'.repeat(Math.floor(n / 3));
  return pad === 0 ? body : body + (pad === 1 ? 'AA==' : 'AAA=');
};
const file = (over: Partial<FinalFile> = {}): FinalFile => ({
  name: 'cover.pdf',
  type: PDF,
  size: 4,
  data: b64(4),
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  replaceDocuments([]);
});

describe('uploadError', () => {
  it.each([
    ['a PDF', { name: 'a.pdf', type: PDF, size: 10 * KB }, 0, null],
    ['a .docx', { name: 'cv.DOCX', type: DOCX, size: 10 * KB }, 0, null],
    ['a .doc', { name: 'cv.doc', type: 'application/msword', size: 10 * KB }, 0, null],
    ['a Word file with no type from the browser', { name: 'cv.docx', type: '', size: 1 }, 0, null],
    ['exactly 500 KB', { name: 'a.pdf', type: PDF, size: UPLOAD_MAX_BYTES }, 0, null],
    [
      'an image',
      { name: 'me.png', type: 'image/png', size: 10 },
      0,
      'Only PDF or Word files can be uploaded.',
    ],
    [
      'a PDF name with the wrong type',
      { name: 'a.pdf', type: 'text/html', size: 10 },
      0,
      'Only PDF or Word files can be uploaded.',
    ],
    [
      'a PDF type with the wrong name',
      { name: 'a.exe', type: PDF, size: 10 },
      0,
      'Only PDF or Word files can be uploaded.',
    ],
    ['an empty file', { name: 'a.pdf', type: PDF, size: 0 }, 0, 'That file is empty.'],
    [
      'a 1.2 MB file',
      { name: 'a.pdf', type: PDF, size: Math.round(1.2 * KB * KB) },
      0,
      'That file is 1.2 MB. Uploads can be up to 500 KB.',
    ],
    [
      'a 600 KB file',
      { name: 'a.pdf', type: PDF, size: 600 * KB },
      0,
      'That file is 600 KB. Uploads can be up to 500 KB.',
    ],
    [
      'one that would pass the 2 MB total',
      { name: 'a.pdf', type: PDF, size: 400 * KB },
      UPLOAD_TOTAL_BYTES - 100 * KB,
      'Uploads are full (2 MB). Remove one first.',
    ],
  ])('%s', (_name, f, used, want) => {
    expect(uploadError(f, used)).toBe(want);
  });
});

describe('formatBytes', () => {
  it.each([
    [500, '1 KB'],
    [500 * KB, '500 KB'],
    [2 * KB * KB, '2 MB'],
    [Math.round(1.25 * KB * KB), '1.3 MB'],
  ])('%d bytes is %s', (n, want) => expect(formatBytes(n)).toBe(want));
});

describe('addFinalCopy', () => {
  it('makes a document for the job with one Version that holds the file and no text', () => {
    const r = addFinalCopy({ kind: 'cover', jobUrl: JOB, file: file() });
    expect(r.ok).toBe(true);
    const d = getAllDocuments()[0];
    expect(d).toMatchObject({ kind: 'cover', title: 'cover.pdf', jobUrl: JOB });
    expect(d.versions).toHaveLength(1);
    expect(d.versions[0]).toMatchObject({ text: '', file: file() });
    expect(isFinalCopy(d)).toBe(true);
  });

  it('refuses with the named error and saves nothing', () => {
    const r = addFinalCopy({ kind: 'cover', jobUrl: JOB, file: file({ name: 'x.png' }) });
    expect(r).toEqual({ ok: false, error: 'Only PDF or Word files can be uploaded.' });
    expect(getAllDocuments()).toEqual([]);
  });

  it('needs a job', () => {
    const r = addFinalCopy({ kind: 'cover', jobUrl: '', file: file() });
    expect(r.ok).toBe(false);
  });

  it('counts what is already uploaded against the 2 MB total', () => {
    const big = (n: string) => file({ name: n, size: 500 * KB, data: b64(500 * KB) });
    for (const n of ['1.pdf', '2.pdf', '3.pdf', '4.pdf'])
      expect(addFinalCopy({ kind: 'note', jobUrl: JOB, file: big(n) }).ok).toBe(true);
    expect(uploadedBytes(getAllDocuments())).toBe(2000 * KB);
    expect(addFinalCopy({ kind: 'note', jobUrl: JOB, file: big('5.pdf') })).toEqual({
      ok: false,
      error: 'Uploads are full (2 MB). Remove one first.',
    });
  });

  it('can be marked Sent, and is then locked against removal', () => {
    const r = addFinalCopy({ kind: 'resume', jobUrl: JOB, file: file() });
    if (!r.ok) throw new Error(r.error);
    expect(markSent(r.id, r.versionId)).toBe('sent');
    expect(removeDocument(r.id)).toBe(false);
  });

  it('a final copy takes no new text Versions', () => {
    const r = addFinalCopy({ kind: 'cover', jobUrl: JOB, file: file() });
    if (!r.ok) throw new Error(r.error);
    expect(saveVersion(r.id, 'typed text')).toBeNull();
    expect(getAllDocuments()[0].versions).toHaveLength(1);
  });

  it('a text document is not a final copy and counts nothing toward uploads', () => {
    createDocument({ kind: 'note', title: 'N', jobUrl: JOB, text: 'hello' });
    expect(isFinalCopy(getAllDocuments()[0])).toBe(false);
    expect(uploadedBytes(getAllDocuments())).toBe(0);
  });
});

describe('sanitizeDocuments with files', () => {
  const withFile = (f: unknown, text = ''): Document =>
    ({
      id: 'd1',
      kind: 'cover',
      title: 'cover.pdf',
      jobUrl: JOB,
      createdAt: '2026-10-01T00:00:00.000Z',
      versions: [{ id: 'v1', text, savedAt: '2026-10-01T00:00:00.000Z', file: f }],
    }) as Document;

  it('keeps a well-formed file', () => {
    expect(sanitizeDocuments([withFile(file())])[0].versions[0].file).toEqual(file());
  });

  it('an older blob without files loads unchanged', () => {
    const old = { ...withFile(undefined, 'Dear team') };
    old.versions = [{ id: 'v1', text: 'Dear team', savedAt: '2026-10-01T00:00:00.000Z' }];
    expect(sanitizeDocuments([old])).toEqual([old]);
  });

  it('takes the size from the data, not the claim', () => {
    expect(sanitizeDocuments([withFile(file({ size: 999 }))])[0].versions[0].file!.size).toBe(4);
  });

  it('a file Version holds no text', () => {
    expect(sanitizeDocuments([withFile(file(), 'stray')])[0].versions[0].text).toBe('');
  });

  it.each([
    ['not an object', 'cover.pdf'],
    ['no name', file({ name: '' })],
    ['a disallowed type', file({ name: 'a.html', type: 'text/html' })],
    ['data that is not base64', file({ data: 'not base64!!' })],
    ['empty data', file({ data: '', size: 0 })],
    ['data over 500 KB', file({ data: b64(UPLOAD_MAX_BYTES + 3), size: 1 })],
  ])('drops the Version (and so the document) for %s', (_name, f) => {
    expect(sanitizeDocuments([withFile(f)])).toEqual([]);
  });
});

describe('reading and writing files', () => {
  it('reads a picked File into a FinalFile, and turns it back into the same bytes', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 0, 255]);
    const picked = new File([bytes], 'cv.pdf', { type: PDF });
    const f = await readFinalFile(picked);
    expect(f).toEqual({ name: 'cv.pdf', type: PDF, size: 6, data: 'JVBERgD/' });
    const blob = finalFileBlob(f);
    expect(blob.type).toBe(PDF);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it('fills in the type from the name when the browser gives none', async () => {
    const f = await readFinalFile(new File([new Uint8Array([1])], 'cv.docx'));
    expect(f.type).toBe(DOCX);
  });
});
