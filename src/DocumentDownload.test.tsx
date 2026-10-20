// #229: the Download menu on a Document Version saves a PDF or a Word file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BRAND } from './brand';
import { DocumentDownload } from './DocumentDownload';
import type { Document } from './documents';
import type { Job } from './types';

let downloads: { name: string; blob: Blob }[] = [];

beforeEach(() => {
  downloads = [];
  let pending: Blob;
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
    pending = b as Blob;
    return 'blob:test';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ name: this.download, blob: pending });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const doc: Document = {
  id: 'd1',
  kind: 'cover',
  title: 'Cover',
  createdAt: '2026-10-01T00:00:00.000Z',
  versions: [
    { id: 'v1', text: 'First', savedAt: '2026-10-01T00:00:00.000Z' },
    { id: 'v2', text: 'Second (draft)', savedAt: '2026-10-02T00:00:00.000Z' },
  ],
};
const job = { url: 'https://x.test/1', label: 'Designer', status: 'Saved', company: 'Acme' } as Job;

const bytes = async (b: Blob) =>
  new Uint8Array(
    await new Promise<ArrayBuffer>((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as ArrayBuffer);
      r.readAsArrayBuffer(b);
    }),
  );

async function choose(name: string) {
  await userEvent.click(screen.getByRole('button', { name: /Download/ }));
  const menu = await screen.findByRole('menu');
  await userEvent.click(within(menu).getByRole('menuitem', { name }));
}

describe('DocumentDownload', () => {
  it('saves the chosen version as a PDF', async () => {
    render(<DocumentDownload doc={doc} version={doc.versions[1]} job={job} />);
    await choose('Download PDF');
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe(`${BRAND.slug}-acme-cover-letter-v2.pdf`);
    expect(downloads[0].blob.type).toBe('application/pdf');
    const text = String.fromCharCode(...(await bytes(downloads[0].blob)));
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('Second \\(draft\\)');
  });

  it('saves a Word file', async () => {
    render(<DocumentDownload doc={doc} version={doc.versions[0]} />);
    await choose('Download Word');
    expect(downloads[0].name).toBe(`${BRAND.slug}-cover-letter-v1.docx`);
    expect(downloads[0].blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const b = await bytes(downloads[0].blob);
    expect([b[0], b[1], b[2], b[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('names the version on its trigger', () => {
    render(<DocumentDownload doc={doc} version={doc.versions[1]} />);
    expect(screen.getByRole('button', { name: 'Download version 2' })).toBeInTheDocument();
  });
});
