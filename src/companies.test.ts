// Companies (#230): derived on read from Jobs' company names (and company-level Documents), never
// created by hand. Table tests for the name match, derivation, lookup by slug and the rename rule.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addCompanyNote,
  companyBySlug,
  companyKey,
  companySlug,
  deriveCompanies,
  relinkCompanyNotes,
} from './companies';
import { getAllDocuments, replaceDocuments, type Document } from './documents';
import type { Job } from './types';

const job = (url: string, company?: string, over: Partial<Job> = {}): Job => ({
  url,
  label: 'Role',
  status: 'Saved',
  ...(company !== undefined ? { company } : {}),
  ...over,
});

const doc = (over: Partial<Document>): Document => ({
  id: 'd1',
  kind: 'note',
  title: 'Note',
  createdAt: '2026-10-01T00:00:00.000Z',
  versions: [{ id: 'v1', text: 'hi', savedAt: '2026-10-01T00:00:00.000Z' }],
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  replaceDocuments([]);
});

describe('companyKey — the normalized match', () => {
  it.each([
    ['Acme', 'acme'],
    ['  Acme  ', 'acme'],
    ['ACME', 'acme'],
    ['Acme, Inc.', 'acme'],
    ['Acme Inc', 'acme'],
    ['Acme LLC', 'acme'],
    ['Acme L.L.C.', 'acme'],
    ['Acme Corp.', 'acme'],
    ['Acme Corporation', 'acme'],
    ['Acme Ltd', 'acme'],
    ['Acme Co.', 'acme'],
    ['Acme GmbH', 'acme'],
    ['Acme Inc. LLC', 'acme'],
    ['Acme Widgets', 'acme widgets'],
    ['Acme   Widgets, Inc.', 'acme widgets'],
    ['Acme-Widgets', 'acme widgets'],
    ['AT&T', 'at t'],
    ['Café Ltd', 'cafe'],
    ['Inc', 'inc'], // a name that is only a suffix keeps it
    ['', ''],
    ['   ', ''],
    ['...', ''],
  ])('%j → %j', (name, key) => {
    expect(companyKey(name)).toBe(key);
  });

  it('a slug is the key with hyphens', () => {
    expect(companySlug('Acme Widgets, Inc.')).toBe('acme-widgets');
    expect(companySlug('')).toBe('');
  });
});

describe('deriveCompanies', () => {
  it('one company per normalized name, no duplicates, sorted by name', () => {
    const jobs = [
      job('https://a.example/1', 'Acme, Inc.'),
      job('https://a.example/2', 'acme'),
      job('https://b.example/1', 'Bolt'),
      job('https://c.example/1'),
      job('https://c.example/2', '   '),
    ];
    const cs = deriveCompanies(jobs, []);
    expect(cs.map((c) => c.slug)).toEqual(['acme', 'bolt']);
    expect(cs[0].name).toBe('Acme, Inc.'); // the first job's spelling
    expect(cs[0].jobs.map((j) => j.url)).toEqual(['https://a.example/1', 'https://a.example/2']);
  });

  it("lists a company's documents (on its jobs or naming it) and its notes apart", () => {
    const jobs = [job('https://a.example/1', 'Acme')];
    const docs = [
      doc({ id: 'n1', company: 'ACME Inc' }), // company note
      doc({ id: 'c1', kind: 'cover', jobUrl: 'https://a.example/1' }), // on its job
      doc({ id: 'n2', kind: 'note', jobUrl: 'https://a.example/1/' }), // a job note: a document
      doc({ id: 'o1', kind: 'outreach', company: 'acme' }), // names it, no job
      doc({ id: 'x1', kind: 'cover', company: 'Bolt', base: true }), // another company
      doc({ id: 'x2', kind: 'resume', base: true }), // none
    ];
    const [acme, bolt] = deriveCompanies(jobs, docs);
    expect(acme.notes.map((d) => d.id)).toEqual(['n1']);
    expect(acme.documents.map((d) => d.id).sort()).toEqual(['c1', 'n2', 'o1']);
    // A company with only documents still has a page (nothing it holds is orphaned).
    expect(bolt).toMatchObject({ slug: 'bolt', name: 'Bolt', jobs: [] });
    expect(bolt.documents.map((d) => d.id)).toEqual(['x1']);
  });

  it('a job document follows its job, not a stale company name on the document', () => {
    const jobs = [job('https://a.example/1', 'Zenith')];
    const docs = [doc({ id: 'c1', kind: 'cover', jobUrl: 'https://a.example/1', company: 'Acme' })];
    const cs = deriveCompanies(jobs, docs);
    expect(cs.map((c) => c.slug)).toEqual(['zenith']);
    expect(cs[0].documents.map((d) => d.id)).toEqual(['c1']);
  });
});

describe('companyBySlug', () => {
  const jobs = [
    job('https://a.example/1', 'Acme Widgets, Inc.'),
    job('https://b.example/1', 'Café'),
  ];
  it.each([
    ['acme-widgets', 'Acme Widgets, Inc.'],
    ['cafe', 'Café'],
    ['nope', undefined],
    ['', undefined],
    ['%E0%A4%A', undefined], // a broken escape does not throw
  ])('%j → %j', (slug, name) => {
    expect(companyBySlug(slug, jobs, [])?.name).toBe(name);
  });
});

describe('company notes', () => {
  it('addCompanyNote makes a note document on the company, with no job', () => {
    const id = addCompanyNote('Acme', 'Met their lead at a meetup');
    const d = getAllDocuments().find((x) => x.id === id)!;
    expect(d).toMatchObject({ kind: 'note', company: 'Acme' });
    expect(d.jobUrl).toBeUndefined();
    expect(d.versions.map((v) => v.text)).toEqual(['Met their lead at a meetup']);
  });

  it('relinkCompanyNotes: notes follow a rename when no job keeps the old name', () => {
    addCompanyNote('Acme', 'a');
    const jobs = [job('https://a.example/1', 'Acme Corp')]; // already renamed
    relinkCompanyNotes('Acme', 'Acme Corp', jobs); // same key: nothing to move
    expect(getAllDocuments()[0].company).toBe('Acme');
    relinkCompanyNotes('Acme', 'Zenith', [job('https://a.example/1', 'Zenith')]);
    expect(getAllDocuments()[0].company).toBe('Zenith');
    expect(
      companyBySlug('zenith', [job('https://a.example/1', 'Zenith')], getAllDocuments())?.notes,
    ).toHaveLength(1);
  });

  it('relinkCompanyNotes: notes stay when another job still has the old name', () => {
    addCompanyNote('Acme', 'a');
    const jobs = [job('https://a.example/1', 'Zenith'), job('https://a.example/2', 'ACME inc')];
    relinkCompanyNotes('Acme', 'Zenith', jobs);
    expect(getAllDocuments()[0].company).toBe('Acme');
  });

  it('relinkCompanyNotes: clearing the name leaves notes where they are (still reachable)', () => {
    addCompanyNote('Acme', 'a');
    relinkCompanyNotes('Acme', '  ', [job('https://a.example/1', '')]);
    expect(getAllDocuments()[0].company).toBe('Acme');
    expect(companyBySlug('acme', [], getAllDocuments())?.notes).toHaveLength(1);
  });

  it('relinkCompanyNotes leaves job documents alone (they follow their job)', () => {
    replaceDocuments([
      doc({ id: 'c1', kind: 'cover', jobUrl: 'https://a.example/1', company: 'Acme' }),
    ]);
    relinkCompanyNotes('Acme', 'Zenith', [job('https://a.example/1', 'Zenith')]);
    expect(getAllDocuments()[0].company).toBe('Acme');
  });
});
