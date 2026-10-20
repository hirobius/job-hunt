// Snippets become Outreach messages (#227): every Copy Deck snippet maps to one Base Outreach-message
// Document whose id traces back to the snippet, so running the migration again never duplicates.
// Text, title, variable values and the pin carry over; starter templates stay restorable.
import { describe, expect, it } from 'vitest';
import {
  documentIdForSnippet,
  migrateSnippets,
  restoreStarterOutreach,
  snippetIdOf,
  snippetToDocument,
} from './snippetMigration';
import { sanitizeDocuments, type Document } from './documents';
import { STARTER_SNIPPETS, type Snippet } from './copyDeckStore';

const NOW = '2026-10-20T00:00:00.000Z';
const s = (over: Partial<Snippet> = {}): Snippet => ({
  id: 'a1',
  label: 'Hello note',
  body: 'Hi [Contact], [Role] at [Company]',
  ...over,
});
const userDoc: Document = {
  id: 'u1',
  kind: 'cover',
  title: 'Mine',
  createdAt: NOW,
  versions: [{ id: 'uv1', text: 'x', savedAt: NOW }],
};

describe('snippetToDocument', () => {
  it.each<[string, Partial<Snippet>, Partial<Document>]>([
    ['text, title and a traceable id', {}, { title: 'Hello note', kind: 'outreach', base: true }],
    [
      'values kept',
      { values: { company: 'Acme', 'your name': 'Ada' } },
      { values: { company: 'Acme', 'your name': 'Ada' } },
    ],
    ['pin kept', { pinned: true }, { pinned: true }],
    ['blank label gets a title', { label: '  ' }, { title: 'Untitled message' }],
  ])('%s', (_n, over, want) => {
    const d = snippetToDocument(s(over), NOW);
    expect(d).toMatchObject({ id: documentIdForSnippet('a1'), createdAt: NOW, ...want });
    expect(d.versions).toEqual([
      { id: `${documentIdForSnippet('a1')}-v1`, text: s(over).body, savedAt: NOW },
    ]);
    expect(d.jobUrl).toBeUndefined();
    // survives the store's sanitizer unchanged
    expect(sanitizeDocuments([d])).toEqual([d]);
  });

  it('drops per-snippet UI state and retired pillar tags, never the text', () => {
    const d = snippetToDocument(s({ open: true, pillars: ['p1'], body: '' }), NOW);
    expect(d).not.toHaveProperty('open');
    expect(d).not.toHaveProperty('pillars');
    expect(d.versions[0].text).toBe('');
  });

  it('round-trips the id', () => {
    expect(snippetIdOf(documentIdForSnippet('tpl-cover'))).toBe('tpl-cover');
    expect(snippetIdOf('u1')).toBeNull();
  });
});

describe('migrateSnippets', () => {
  it('adds one Outreach message per snippet after the existing documents', () => {
    const out = migrateSnippets([s(), s({ id: 'b2', label: 'Two' })], [userDoc], NOW);
    expect(out.map((d) => d.id)).toEqual([
      'u1',
      documentIdForSnippet('a1'),
      documentIdForSnippet('b2'),
    ]);
  });

  it('is idempotent: a second run adds nothing and never overwrites an edited message', () => {
    const once = migrateSnippets([s()], [], NOW);
    const edited = once.map((d) => ({
      ...d,
      versions: [...d.versions, { id: 'v2', text: 'edited', savedAt: '2026-10-21T00:00:00.000Z' }],
    }));
    expect(migrateSnippets([s({ body: 'changed in old deck' })], edited, NOW)).toBe(edited);
    expect(migrateSnippets([s()], once, NOW)).toBe(once);
  });

  it('skips a snippet without an id, and a duplicate id', () => {
    const out = migrateSnippets([s({ id: '' }), s(), s({ label: 'dupe' })], [], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Hello note');
  });

  it('every starter snippet survives the migration (no data loss)', () => {
    const out = migrateSnippets(STARTER_SNIPPETS, [], NOW);
    expect(out.map((d) => [d.title, d.versions[0].text])).toEqual(
      STARTER_SNIPPETS.map((x) => [x.label, x.body]),
    );
  });
});

describe('restoreStarterOutreach', () => {
  it('re-adds only the missing starter messages', () => {
    const all = migrateSnippets(STARTER_SNIPPETS, [], NOW);
    const without = all.filter((d) => d.id !== documentIdForSnippet('tpl-cover'));
    const back = restoreStarterOutreach(without, NOW);
    expect(back.map((d) => d.id).sort()).toEqual(all.map((d) => d.id).sort());
    expect(restoreStarterOutreach(all, NOW)).toBe(all);
  });
});
