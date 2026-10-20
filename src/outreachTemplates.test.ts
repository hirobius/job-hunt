// Outreach messages as the templates the fill paths use (#227): the Base Outreach-message
// Documents, read as { id, label, body, pinned, values } with the latest Version's text, and the
// one-time move of the legacy snippets into the library.
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateSnippetStore, outreachTemplates, resolveDocumentId } from './outreachTemplates';
import {
  createDocument,
  getAllDocuments,
  removeDocument,
  replaceDocuments,
  saveVersion,
  type Document,
} from './documents';
import { getSnippets, replaceSnippets } from './copyDeckStore';

const NOW = '2026-10-20T00:00:00.000Z';
const d = (over: Partial<Document>): Document => ({
  id: 'x',
  kind: 'outreach',
  title: 'X',
  base: true,
  createdAt: NOW,
  versions: [{ id: 'v1', text: 'x', savedAt: NOW }],
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  replaceDocuments([]);
  replaceSnippets([]);
});

describe('outreachTemplates', () => {
  it('reads Base Outreach messages only, latest text, pinned first, else in saved order', () => {
    const out = outreachTemplates([
      d({ id: 'snippet-tpl-cover', title: 'Cover', values: { pet: 'Rex' } }),
      d({ id: 'u2', title: 'Second', pinned: true }),
      d({ id: 'cover', kind: 'cover', title: 'A cover letter' }),
      d({ id: 'job', base: undefined, jobUrl: 'https://a.example/1', title: 'Job copy' }),
      d({
        id: 'u3',
        title: 'Edited',
        versions: [
          { id: 'v1', text: 'old', savedAt: NOW },
          { id: 'v2', text: 'new', savedAt: '2026-10-21T00:00:00.000Z' },
        ],
      }),
    ]);
    expect(out.map((t) => t.label)).toEqual(['Second', 'Cover', 'Edited']);
    expect(out[2].body).toBe('new');
    expect(out[1].values).toEqual({ pet: 'Rex' });
  });

  it('the starter cover letter, filed as a Cover letter, is still a template (#260)', () => {
    const out = outreachTemplates([
      d({ id: 'snippet-tpl-cover', kind: 'cover', title: 'Cover letter' }),
      d({ id: 'snippet-mine', kind: 'cover', base: undefined, title: 'Job copy' }),
    ]);
    expect(out.map((t) => [t.id, t.label])).toEqual([['tpl-cover', 'Cover letter']]);
  });

  it('a migrated message keeps its snippet id (kit picks and the follow-up template find it)', () => {
    const [t] = outreachTemplates([d({ id: 'snippet-tpl-followup', title: 'Follow-up' })]);
    expect(t.id).toBe('tpl-followup');
    expect(t.documentId).toBe('snippet-tpl-followup');
  });
});

describe('resolveDocumentId', () => {
  const docs = [d({ id: 'snippet-tpl-cover' }), d({ id: 'abc' })];
  it.each([
    ['abc', 'abc'],
    ['snippet-tpl-cover', 'snippet-tpl-cover'],
    ['tpl-cover', 'snippet-tpl-cover'],
    ['nope', null],
  ])('%s → %s', (id, want) => expect(resolveDocumentId(id, docs)).toBe(want));
});

describe('migrateSnippetStore', () => {
  const snips = [
    { id: 'tpl-cover', label: 'Cover letter', body: 'Dear [Contact]' },
    { id: 'mine', label: 'Mine', body: 'Hi', pinned: true },
  ];

  it('moves each snippet into the library once and marks it moved', () => {
    replaceSnippets(snips);
    expect(migrateSnippetStore(NOW)).toBe(2);
    expect(getAllDocuments().map((x) => x.id)).toEqual(['snippet-tpl-cover', 'snippet-mine']);
    expect(getSnippets().every((s) => s.migrated)).toBe(true);
    expect(migrateSnippetStore(NOW)).toBe(0);
    expect(getAllDocuments()).toHaveLength(2);
  });

  it('a message deleted after the move never comes back', () => {
    replaceSnippets(snips);
    migrateSnippetStore(NOW);
    expect(removeDocument('snippet-mine')).toBe(true);
    migrateSnippetStore(NOW);
    expect(getAllDocuments().map((x) => x.id)).toEqual(['snippet-tpl-cover']);
  });

  it('a second device: snippets already moved elsewhere (synced with their mark) add nothing', () => {
    replaceSnippets(snips.map((s) => ({ ...s, migrated: true })));
    replaceDocuments([d({ id: 'snippet-tpl-cover', title: 'Cover letter' })]);
    expect(migrateSnippetStore(NOW)).toBe(0);
    expect(getAllDocuments()).toHaveLength(1);
  });

  it('never overwrites an edited message that is already there', () => {
    replaceSnippets(snips);
    replaceDocuments([d({ id: 'snippet-tpl-cover', title: 'Mine now' })]);
    saveVersion('snippet-tpl-cover', 'edited');
    migrateSnippetStore(NOW);
    const cover = getAllDocuments().find((x) => x.id === 'snippet-tpl-cover')!;
    expect(cover.title).toBe('Mine now');
    expect(cover.versions[cover.versions.length - 1].text).toBe('edited');
  });

  it('leaves other documents alone', () => {
    createDocument({ kind: 'resume', title: 'CV', base: true, text: 'r' });
    replaceSnippets(snips);
    migrateSnippetStore(NOW);
    expect(getAllDocuments().map((x) => x.kind)).toEqual(['resume', 'cover', 'outreach']);
  });

  it('files a starter cover letter already moved as an Outreach message under Cover letters, once', () => {
    replaceSnippets(snips.map((s) => ({ ...s, migrated: true })));
    replaceDocuments([d({ id: 'snippet-tpl-cover', title: 'Cover letter' })]);
    saveVersion('snippet-tpl-cover', 'edited');
    expect(migrateSnippetStore(NOW)).toBe(0);
    const [cover] = getAllDocuments();
    expect(getAllDocuments()).toHaveLength(1);
    expect(cover.kind).toBe('cover');
    expect(cover.versions[cover.versions.length - 1].text).toBe('edited');
    const after = getAllDocuments();
    migrateSnippetStore(NOW);
    expect(getAllDocuments()).toBe(after);
  });
});
