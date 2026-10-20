// Download a Document Version as PDF or Word (#229, epic #225), built in the browser: no library,
// no server, no new CSP host. Both writers are deliberately minimal and plain text only.
//  - PDF: Letter pages, the standard Helvetica font with WinAnsiEncoding (so é ’ – € print; a
//    character outside Windows-1252 becomes "?"), word-wrapped on Helvetica's widths, a bold title
//    line on page one, paginated.
//  - Word: a store-only ZIP (CRC-32 below) of the three parts Word needs, one paragraph per line.
import { BRAND } from './brand';
import { download } from './download';
import { DOCUMENT_KINDS, type Document, type Version } from './documents';
import type { Job } from './types';

export type ExportFormat = 'pdf' | 'docx';

const MIME: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const kindLabel = (d: Document) =>
  DOCUMENT_KINDS.find((k) => k.kind === d.kind)?.label ?? 'Document';

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[øœæß]/g, (c) => ({ ø: 'o', œ: 'oe', æ: 'ae', ß: 'ss' })[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');

/** "<brand>-<company or job title>-<kind>-v<N>.<ext>", slugged. Only the company or the posting's
 *  title names it, never the document's own title (that may hold the person's name). */
export function documentFilename(
  doc: Document,
  versionId: string,
  job: Job | undefined,
  format: ExportFormat,
): string {
  const at = doc.versions.findIndex((v) => v.id === versionId);
  const n = at >= 0 ? at + 1 : doc.versions.length;
  // The job's company first: the document's copy goes stale when the job's company is renamed.
  const who = slug(job?.company ?? '') || slug(doc.company ?? '') || slug(job?.label ?? '');
  return [BRAND.slug, who, slug(kindLabel(doc)), `v${n}`].filter(Boolean).join('-') + '.' + format;
}

/** The PDF title line, and the Word document's first paragraph. */
const titleFor = (doc: Document) => doc.title.trim() || kindLabel(doc);

/** Save one Version as a file. */
export function downloadDocument(
  doc: Document,
  version: Version,
  job: Job | undefined,
  format: ExportFormat,
): void {
  const bytes =
    format === 'pdf' ? toPdf(titleFor(doc), version.text) : toDocx(titleFor(doc), version.text);
  download(documentFilename(doc, version.id, job, format), bytes, MIME[format]);
}

// ---------------------------------------------------------------- WinAnsi + Helvetica widths

/** Windows-1252's 0x80–0x9F block (the rest of 0xA0–0xFF is Latin-1 as is). */
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
}; // prettier-ignore

/** A string as WinAnsi bytes; anything it cannot hold becomes "?". */
export function toWinAnsi(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) out.push(c);
    else out.push(CP1252[c] ?? 0x3f);
  }
  return Uint8Array.from(out);
}

// Helvetica advance widths (AFM, 1/1000 em) for 0x20–0x7E.
// prettier-ignore
const ASCII_W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HIGH_W: Record<number, number> = {
  0x85: 1000,
  0x89: 1000,
  0x8c: 1000,
  0x9c: 944,
  0x91: 222,
  0x92: 222,
  0x93: 333,
  0x94: 333,
  0x95: 350,
  0x96: 556,
  0x97: 1000,
  0x99: 1000,
  0xa0: 278,
  0xc6: 1000,
  0xe6: 889,
};

function charWidth(byte: number): number {
  if (byte >= 0x20 && byte <= 0x7e) return ASCII_W[byte - 0x20];
  if (HIGH_W[byte]) return HIGH_W[byte];
  // An accented letter is as wide as its base letter.
  if (byte >= 0xc0) {
    const base = String.fromCharCode(byte).normalize('NFD').charCodeAt(0);
    if (base >= 0x20 && base <= 0x7e) return ASCII_W[base - 0x20];
  }
  return 556;
}

const widthOf = (s: string, size: number) =>
  (Array.from(toWinAnsi(s)).reduce((n, b) => n + charWidth(b), 0) * size) / 1000;

/** Split text into lines that fit `width` points at `size`: on spaces, a too-long word by
 *  characters. Blank lines stay; tabs are four spaces. */
export function wrapLines(text: string, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    if (widthOf(para, size) <= width) {
      out.push(para);
      continue;
    }
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (widthOf(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      let rest = word;
      while (widthOf(rest, size) > width) {
        let cut = 1;
        const chars = Array.from(rest);
        while (cut < chars.length && widthOf(chars.slice(0, cut + 1).join(''), size) <= width)
          cut++;
        out.push(chars.slice(0, cut).join(''));
        rest = chars.slice(cut).join('');
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------- PDF

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72;
const SIZE = 11;
const LEADING = 15;
const TITLE_SIZE = 14;

/** A PDF literal string body: WinAnsi bytes, ( ) \ escaped, anything outside printable ASCII as
 *  an octal escape. Returned as a "binary" string (one char per byte). */
function pdfString(s: string): string {
  let out = '';
  for (const b of toWinAnsi(s)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += '\\' + String.fromCharCode(b);
    else if (b < 0x20 || b > 0x7e) out += '\\' + b.toString(8).padStart(3, '0');
    else out += String.fromCharCode(b);
  }
  return out;
}

/** A Letter-size PDF of `text` under a bold `title` line. Bytes, ready for a Blob. */
export function toPdf(title: string, text: string): Uint8Array<ArrayBuffer> {
  const width = PAGE_W - 2 * MARGIN;
  const lines = wrapLines(text, SIZE, width);
  const top = PAGE_H - MARGIN;
  const perPage = Math.floor((PAGE_H - 2 * MARGIN) / LEADING);
  const titleRows = 2; // the title line plus a gap, page one only
  const pages: string[][] = [];
  let rest = lines;
  do {
    const room = pages.length === 0 ? perPage - titleRows : perPage;
    pages.push(rest.slice(0, room));
    rest = rest.slice(room);
  } while (rest.length);

  const streams = pages.map((pageLines, i) => {
    let s = 'BT\n';
    const y = top - SIZE;
    if (i === 0) {
      s += `/F2 ${TITLE_SIZE} Tf\n${MARGIN} ${y} Td\n(${pdfString(title)}) Tj\n`;
      s += `/F1 ${SIZE} Tf\n${LEADING} TL\n0 ${-LEADING * titleRows} Td\n`;
    } else {
      s += `/F1 ${SIZE} Tf\n${LEADING} TL\n${MARGIN} ${y} Td\n`;
    }
    pageLines.forEach((l, k) => {
      if (k) s += 'T*\n';
      if (l) s += `(${pdfString(l)}) Tj\n`;
    });
    return s + 'ET';
  });

  // Objects: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, then a page + its content each.
  const font = (name: string) =>
    `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
  const pageId = (i: number) => 5 + 2 * i;
  const objs: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    font('Helvetica'),
    font('Helvetica-Bold'),
  ];
  streams.forEach((s, i) => {
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId(i) + 1} 0 R >>`,
    );
    objs.push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
  });

  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = objs.map((body, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Every char is one byte (content went through WinAnsi + escapes).
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------- Word (.docx)

let CRC_TABLE: Uint32Array | null = null;
/** CRC-32 (IEEE, as ZIP uses it). */
export function crc32(data: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A store-only (no compression) ZIP of the given files. */
function zip(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const DOS_DATE = (1 << 5) | 1; // 1980-01-01, so the same text makes the same file
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, f.data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(14, DOS_DATE, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

const xmlText = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex -- strip what XML 1.0 cannot hold
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function paragraph(line: string, bold = false): string {
  if (!line) return '<w:p/>';
  const rPr = bold ? '<w:rPr><w:b/><w:sz w:val="28"/></w:rPr>' : '';
  const runs = line
    .split('\t')
    .map((part, i) => (i ? '<w:tab/>' : '') + `<w:t xml:space="preserve">${xmlText(part)}</w:t>`)
    .join('');
  return `<w:p><w:r>${rPr}${runs}</w:r></w:p>`;
}

/** A .docx of `text` (one paragraph per line) under a bold `title` paragraph. */
export function toDocx(title: string, text: string): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const body = [paragraph(title, true)]
    .concat(
      text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((l) => paragraph(l)),
    )
    .join('');
  const document =
    XML_HEAD + `<w:document xmlns:w="${W_NS}"><w:body>${body}<w:sectPr>` +
    '<w:pgSz w:w="12240" w:h="15840"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
    '</w:sectPr></w:body></w:document>'; // prettier-ignore
  const types =
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';
  const rels =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';
  return zip([
    { name: '[Content_Types].xml', data: enc.encode(types) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: 'word/document.xml', data: enc.encode(document) },
  ]);
}
