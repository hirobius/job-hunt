// Soft Delete of a Base document (#329): it goes at once, and Undo puts it back in its place with
// every Version, even when the same id came back meanwhile (Restore starter messages).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ undo: null as null | (() => void) }));
vi.mock('./saveNotice', () => ({
  notifyRemoved: (_t: string, undo: () => void) => (h.undo = undo),
  showNotice: () => {},
}));

import { getAllDocuments, replaceDocuments, type Document } from './documents';
import { removeDocumentWithUndo } from './documentRemove';

const v = (id: string, text: string) => ({ id, text, savedAt: `2026-10-0${id}T00:00:00.000Z` });
const doc = (id: string, versions = [v('1', 'a')]): Document => ({
  id,
  kind: 'outreach',
  title: id,
  base: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  versions,
});

beforeEach(() => {
  localStorage.clear();
  h.undo = null;
  replaceDocuments([doc('a'), doc('b', [v('1', 'one'), v('2', 'two')]), doc('c')]);
});

describe('removeDocumentWithUndo', () => {
  it('removes at once; Undo puts it back in its place with every Version', () => {
    expect(removeDocumentWithUndo(getAllDocuments()[1])).toBe(true);
    expect(getAllDocuments().map((d) => d.id)).toEqual(['a', 'c']);
    h.undo!();
    expect(getAllDocuments().map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(getAllDocuments()[1].versions.map((x) => x.text)).toEqual(['one', 'two']);
  });

  it('Undo brings back the user’s Versions over a stock copy restored meanwhile', () => {
    removeDocumentWithUndo(getAllDocuments()[1]);
    replaceDocuments([...getAllDocuments(), doc('b', [v('3', 'stock')])]);
    h.undo!();
    expect(getAllDocuments().filter((d) => d.id === 'b')).toHaveLength(1);
    expect(
      getAllDocuments()
        .find((d) => d.id === 'b')!
        .versions.map((x) => x.text),
    ).toEqual(['one', 'two']);
  });

  it('refuses a locked document (a Sent Version)', () => {
    // Only a job's own document can be Sent.
    const { base: _b, ...plain } = doc('d');
    const sent = {
      ...plain,
      jobUrl: 'https://acme.example/jobs/1',
      versions: [{ ...v('1', 'x'), sentAt: '2026-10-02T00:00:00.000Z' }],
    };
    replaceDocuments([...getAllDocuments(), sent]);
    expect(getAllDocuments().find((d) => d.id === 'd')!.versions[0].sentAt).toBeTruthy();
    expect(removeDocumentWithUndo(sent)).toBe(false);
    expect(h.undo).toBeNull();
  });
});
