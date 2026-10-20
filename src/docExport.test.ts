// #229: download a Document Version as PDF or Word, built in the browser with no dependency.
import { describe, expect, it } from 'vitest';
import { BRAND } from './brand';
import { crc32, documentFilename, toDocx, toPdf, toWinAnsi, wrapLines } from './docExport';
import type { Document } from './documents';
import type { Job } from './types';

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

const doc = (over: Partial<Document> = {}): Document => ({
  id: 'd1',
  kind: 'cover',
  title: 'Cover for Acme',
  createdAt: '2026-10-01T00:00:00.000Z',
  versions: [
    { id: 'v1', text: 'one', savedAt: '2026-10-01T00:00:00.000Z' },
    { id: 'v2', text: 'two', savedAt: '2026-10-02T00:00:00.000Z' },
  ],
  ...over,
});
const job = (over: Partial<Job> = {}): Job =>
  ({ url: 'https://x.test/1', label: 'Senior Designer', status: 'Saved', ...over }) as Job;

describe('documentFilename', () => {
  const S = BRAND.slug;
  it.each([
    [
      'company from the job',
      doc(),
      'v2',
      job({ company: 'Acme Corp' }),
      'pdf',
      `${S}-acme-corp-cover-letter-v2.pdf`,
    ],
    [
      'company on the document wins',
      doc({ company: 'Globex' }),
      'v1',
      job({ company: 'Acme' }),
      'docx',
      `${S}-globex-cover-letter-v1.docx`,
    ],
    [
      'no company: job title',
      doc({ kind: 'resume' }),
      'v2',
      job(),
      'pdf',
      `${S}-senior-designer-resume-v2.pdf`,
    ],
    ['no job, no company', doc({ kind: 'note' }), 'v1', undefined, 'pdf', `${S}-note-v1.pdf`],
    [
      'accents and symbols are slugged',
      doc({ company: 'Café & Søn, Inc.' }),
      'v2',
      undefined,
      'pdf',
      `${S}-cafe-son-inc-cover-letter-v2.pdf`,
    ],
    [
      'outreach kind',
      doc({ kind: 'outreach', company: '***' }),
      'v1',
      undefined,
      'docx',
      `${S}-outreach-message-v1.docx`,
    ],
    ['unknown version: latest number', doc(), 'nope', undefined, 'pdf', `${S}-cover-letter-v2.pdf`],
  ] as const)('%s', (_n, d, vid, j, fmt, want) => {
    expect(documentFilename(d, vid, j, fmt)).toBe(want);
  });

  it('keeps long names short', () => {
    const name = documentFilename(doc({ company: 'x'.repeat(200) }), 'v1', undefined, 'pdf');
    expect(name.length).toBeLessThan(100);
  });
});

describe('toWinAnsi', () => {
  it.each([
    ['A', [65]],
    ['é', [0xe9]],
    ['’', [0x92]],
    ['–', [0x96]],
    ['—', [0x97]],
    ['€', [0x80]],
    ['“”', [0x93, 0x94]],
    ['…', [0x85]],
    ['漢', [0x3f]],
    ['😀', [0x3f]],
  ])('%s', (s, bytes) => {
    expect(Array.from(toWinAnsi(s))).toEqual(bytes);
  });
});

describe('wrapLines', () => {
  it('keeps short lines and blank lines', () => {
    expect(wrapLines('a\n\nb', 11, 468)).toEqual(['a', '', 'b']);
  });
  it('wraps long paragraphs on spaces within the width', () => {
    const text = Array.from({ length: 80 }, () => 'word').join(' ');
    const out = wrapLines(text, 11, 200);
    expect(out.length).toBeGreaterThan(3);
    expect(out.join(' ')).toBe(text);
    out.forEach((l) => expect(l.length).toBeLessThan(45));
  });
  it('breaks a word longer than the line', () => {
    const out = wrapLines('x'.repeat(300), 11, 100);
    expect(out.length).toBeGreaterThan(1);
    expect(out.join('')).toBe('x'.repeat(300));
  });
  it('treats CRLF and tabs', () => {
    expect(wrapLines('a\r\nb\tc', 11, 468)).toEqual(['a', 'b    c']);
  });
});

/** Every xref entry points at "N 0 obj", and startxref points at "xref". */
function checkXref(pdf: string) {
  const start = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(pdf)![1]);
  expect(pdf.slice(start, start + 4)).toBe('xref');
  const head = /xref\n0 (\d+)\n/.exec(pdf.slice(start))!;
  const count = Number(head[1]);
  const body = pdf.slice(start + head[0].length);
  for (let i = 0; i < count; i++) {
    const entry = body.slice(i * 20, i * 20 + 20);
    expect(entry).toMatch(/^\d{10} \d{5} [nf] \n$/);
    if (i === 0) continue;
    const off = Number(entry.slice(0, 10));
    expect(pdf.slice(off, off + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
  }
  expect(pdf).toContain(`/Size ${count}`);
  return count;
}

describe('toPdf', () => {
  it('is a structurally valid PDF with the text escaped', () => {
    const pdf = latin1(toPdf('My (title)', 'Hello (world) \\ back\nCafé – it’s'));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    checkXref(pdf);
    expect(pdf).toContain('/BaseFont /Helvetica');
    expect(pdf).toContain('/Encoding /WinAnsiEncoding');
    expect(pdf).toContain('Hello \\(world\\) \\\\ back');
    expect(pdf).toContain('My \\(title\\)');
    // é – ’ go as octal WinAnsi codes.
    expect(pdf).toContain('Caf\\351 \\226 it\\222s');
    expect(pdf).toContain('/MediaBox [0 0 612 792]');
  });

  it('stream lengths match their content', () => {
    const pdf = latin1(toPdf('T', 'line'));
    const re = /<< \/Length (\d+) >>\nstream\n/g;
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = re.exec(pdf))) {
      const from = m.index + m[0].length;
      expect(pdf.slice(from + Number(m[1]), from + Number(m[1]) + 10)).toBe('\nendstream');
      n++;
    }
    expect(n).toBe(1);
  });

  it('paginates long text', () => {
    const text = Array.from({ length: 200 }, (_, i) => `Line ${i}`).join('\n');
    const pdf = latin1(toPdf('T', text));
    checkXref(pdf);
    const pages = Number(/\/Count (\d+)/.exec(pdf)![1]);
    expect(pages).toBeGreaterThanOrEqual(4);
    expect((pdf.match(/\/Type \/Page\b/g) ?? []).length).toBe(pages);
    expect(pdf).toContain('(Line 0)');
    expect(pdf).toContain('(Line 199)');
  });

  it('an empty version is one page', () => {
    const pdf = latin1(toPdf('T', ''));
    expect(/\/Count (\d+)/.exec(pdf)![1]).toBe('1');
  });
});

interface Entry {
  name: string;
  data: Uint8Array;
  crc: number;
}
/** Read a store-only zip through its central directory, checking each local header. */
function unzip(b: Uint8Array): Entry[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const eocd = b.length - 22;
  expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  let p = dv.getUint32(eocd + 16, true);
  expect(p + cdSize).toBe(eocd);
  const dec = new TextDecoder();
  const out: Entry[] = [];
  for (let i = 0; i < count; i++) {
    expect(dv.getUint32(p, true)).toBe(0x02014b50);
    expect(dv.getUint16(p + 10, true)).toBe(0); // stored
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 20, true);
    expect(dv.getUint32(p + 24, true)).toBe(size);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    expect(dv.getUint32(local, true)).toBe(0x04034b50);
    expect(dv.getUint32(local + 14, true)).toBe(crc);
    const lnlen = dv.getUint16(local + 26, true);
    const lelen = dv.getUint16(local + 28, true);
    expect(dec.decode(b.subarray(local + 30, local + 30 + lnlen))).toBe(name);
    const start = local + 30 + lnlen + lelen;
    out.push({ name, data: b.subarray(start, start + size), crc });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

describe('crc32', () => {
  it.each([
    ['', 0],
    ['a', 0xe8b7be43],
    ['123456789', 0xcbf43926],
    ['The quick brown fox jumps over the lazy dog', 0x414fa339],
  ])('%j', (s, want) => {
    expect(crc32(new TextEncoder().encode(s))).toBe(want);
  });
});

describe('toDocx', () => {
  const text = 'Dear <team> & co,\n\n"Quoted" it’s – café\tend';
  const entries = unzip(toDocx('A & B', text));
  const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
  const xml = new TextDecoder().decode(byName['word/document.xml'].data);

  it('holds the three parts Word needs, with right CRCs', () => {
    expect(entries.map((e) => e.name).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
    ]);
    entries.forEach((e) => expect(crc32(e.data)).toBe(e.crc));
    const types = new TextDecoder().decode(byName['[Content_Types].xml'].data);
    expect(types).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    );
    const rels = new TextDecoder().decode(byName['_rels/.rels'].data);
    expect(rels).toContain('Target="word/document.xml"');
  });

  it('writes one escaped paragraph per line, title first', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);
    expect(xml).toContain('A &amp; B');
    expect(xml).toContain('Dear &lt;team&gt; &amp; co,');
    expect(xml).toContain('&quot;Quoted&quot; it’s – café');
    expect(xml).toContain('<w:tab/>');
    expect((xml.match(/<w:p>|<w:p\/>/g) ?? []).length).toBe(4); // title + 3 lines
    expect(xml).not.toMatch(/<team>/);
  });

  it('drops characters XML cannot hold', () => {
    const e = unzip(toDocx('T', 'a\u0001b\u000bc'));
    const x = new TextDecoder().decode(e.find((f) => f.name === 'word/document.xml')!.data);
    expect(x).toContain('>abc<');
  });
});
