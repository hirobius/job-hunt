import { describe, expect, it } from 'vitest';
import { BRAND } from './brand';
import {
  applyBackup,
  buildBackup,
  MAX_BACKUP_CHARS,
  parseBackup,
  summarizeRestore,
  type AccountState,
} from './backup';
import type { Job } from './types';
import type { Document } from './documents';

const NOW = new Date('2026-10-12T10:00:00.000Z');
const job = (url: string, label = 'A job'): Job => ({ url, label, status: 'Saved' }) as Job;

const state = (over: Partial<AccountState> = {}): AccountState => ({
  jobs: [job('https://example.com/a')],
  copydeck: [{ id: 's1', label: 'Intro', body: 'Hi [Company]' }],
  curation: {
    categories: [
      {
        id: 'c1',
        label: 'Welding',
        titles: ['welder'],
        atsRoles: [],
        seniority: 'entry',
        location: 'Spokane',
        tailorRole: null,
        sortOrder: 0,
        archived: false,
        createdAt: 'x',
        updatedAt: 'y',
      },
    ],
    groups: [
      { id: 'g1', categoryId: 'c1', label: 'Shops', sortOrder: 0, archived: false, createdAt: 'x' },
    ],
    tiles: [
      {
        id: 't1',
        groupId: 'g1',
        name: 'Shop',
        url: 'https://shop.example/',
        meta: '',
        sortOrder: 0,
        createdAt: 'x',
      },
    ],
  },
  triage: { pinned: ['https://shop.example/'], dismissed: [] },
  targets: {},
  filters: {},
  evidence: '',
  modes: {},
  trash: [],
  dreams: {},
  documents: [],
  kit: { fields: {}, answers: [] },
  sweeps: {},
  ...over,
});

const wrap = (over: Record<string, unknown>) =>
  JSON.stringify({ app: 'apply-board', kind: 'backup', v: 1, ...over });

describe('buildBackup / parseBackup', () => {
  it('round-trips with an injected clock', () => {
    const b = buildBackup(state(), NOW);
    expect(b).toMatchObject({
      app: 'apply-board',
      kind: 'backup',
      v: 1,
      exportedAt: NOW.toISOString(),
    });
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.jobs.map((j) => j.url)).toEqual(['https://example.com/a']);
      expect(r.backup.copydeck).toEqual(state().copydeck);
      expect(r.backup.curation).toEqual(state().curation);
      expect(r.backup.triage).toEqual(state().triage);
    }
  });

  const rejections: [string, string, RegExp][] = [
    ['too large', 'x'.repeat(MAX_BACKUP_CHARS + 1), /too large/],
    ['invalid JSON', '{nope', /valid JSON/],
    ['array', '[]', new RegExp(`isn't a backup from ${BRAND.name}`)],
    ['null', 'null', new RegExp(`isn't a backup from ${BRAND.name}`)],
    [
      'wrong app',
      JSON.stringify({ app: 'other', kind: 'backup', v: 1 }),
      new RegExp(`isn't a backup from ${BRAND.name}`),
    ],
    [
      'wrong kind',
      JSON.stringify({ app: 'apply-board', kind: 'csv', v: 1 }),
      new RegExp(`isn't a backup from ${BRAND.name}`),
    ],
    [
      'wrong version',
      JSON.stringify({ app: 'apply-board', kind: 'backup', v: 2 }),
      /Backup version 2 isn't supported/,
    ],
  ];
  it.each(rejections)('rejects %s', (_n, text, re) => {
    const r = parseBackup(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(re);
  });

  it('drops non-http(s) job and tile URLs', () => {
    const r = parseBackup(
      wrap({
        jobs: [
          { url: 'javascript:alert(1)', label: 'x' },
          { url: 'https://ok.example/j', label: 'ok' },
        ],
        curation: {
          categories: [{ id: 'c', label: 'C' }],
          groups: [{ id: 'g', categoryId: 'c' }],
          tiles: [
            { id: 't1', groupId: 'g', url: 'javascript:alert(1)' },
            { id: 't2', groupId: 'g', url: 'https://ok.example/' },
          ],
        },
      }),
    );
    expect(r.ok && r.backup.jobs.map((j) => j.url)).toEqual(['https://ok.example/j']);
    expect(r.ok && r.backup.curation.tiles.map((t) => t.id)).toEqual(['t2']);
  });

  it('keeps only well-formed snippets, curation rows and triage strings', () => {
    const r = parseBackup(
      wrap({
        copydeck: [
          { id: 'a', label: 'l', body: 'b' },
          { id: 'b', label: 1, body: 'b' },
          'str',
          null,
        ],
        curation: {
          categories: [{ id: 'c' }, { id: 'c2', label: 'ok' }],
          groups: [{ id: 'g' }, { id: 'g2', categoryId: 'c2' }],
          tiles: [{ id: 't' }],
        },
        triage: { pinned: ['u', 3, null], dismissed: 'nope' },
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.copydeck.map((s) => s.id)).toEqual(['a']);
      expect(r.backup.curation.categories.map((c) => c.id)).toEqual(['c2']);
      expect(r.backup.curation.groups.map((g) => g.id)).toEqual(['g2']);
      expect(r.backup.curation.tiles).toEqual([]);
      expect(r.backup.triage).toEqual({ pinned: ['u'], dismissed: [] });
    }
  });

  it('tolerates missing sections', () => {
    const r = parseBackup(wrap({}));
    expect(r.ok && r.backup.jobs).toEqual([]);
    expect(r.ok && r.backup.curation).toEqual({ categories: [], groups: [], tiles: [] });
  });

  it('does not let an own __proto__ key pollute prototypes', () => {
    const text =
      '{"app":"apply-board","kind":"backup","v":1,' +
      '"jobs":[{"url":"https://a.example/x","label":"j","__proto__":{"polluted":1}}],' +
      '"copydeck":[{"id":"s","label":"l","body":"b","__proto__":{"polluted":1}}],' +
      '"curation":{"categories":[{"id":"c","label":"l","__proto__":{"polluted":1}}]},' +
      '"triage":{"__proto__":{"polluted":1}}}';
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (r.ok) {
      const objs = [
        r.backup.jobs[0],
        r.backup.copydeck[0],
        r.backup.curation.categories[0],
        r.backup.triage,
      ];
      for (const o of objs) {
        expect(Object.prototype.hasOwnProperty.call(o, '__proto__')).toBe(false);
        expect((o as unknown as Record<string, unknown>).polluted).toBeUndefined();
      }
    }
  });
});

describe('applyBackup', () => {
  const current = state();
  const incoming = state({
    jobs: [job('https://example.com/b', 'B')],
    copydeck: [{ id: 's2', label: 'Other', body: 'x' }],
    curation: { categories: [], groups: [], tiles: [] },
    triage: { pinned: [], dismissed: ['https://shop.example/'] },
  });

  it('replace yields exactly the backup data', () => {
    expect(applyBackup(current, incoming, 'replace')).toEqual(incoming);
  });

  it('merge unions both sides and the backup wins on a shared key', () => {
    const withClash = {
      ...incoming,
      jobs: [...incoming.jobs, job('https://example.com/a', 'From backup')],
    };
    const m = applyBackup(current, withClash, 'merge');
    expect(m.jobs.map((j) => j.url).sort()).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
    expect(m.jobs.find((j) => j.url === 'https://example.com/a')?.label).toBe('From backup');
    expect(m.copydeck.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    expect(m.curation.categories.map((c) => c.id)).toEqual(['c1']);
    expect(m.triage).toEqual({ pinned: [], dismissed: ['https://shop.example/'] });
  });
});

describe('summarizeRestore', () => {
  it('counts both sides', () => {
    const next = state({ jobs: [] });
    expect(summarizeRestore(state(), next)).toEqual({
      current: { jobs: 1, snippets: 1, tracks: 1, links: 1 },
      next: { jobs: 0, snippets: 1, tracks: 1, links: 1 },
    });
  });
});

describe('parseBackup — nested job fields + orphans (review)', () => {
  const env = (over: Record<string, unknown>) =>
    JSON.stringify({
      app: 'apply-board',
      kind: 'backup',
      v: 1,
      exportedAt: '',
      jobs: [],
      copydeck: [],
      curation: {},
      triage: {},
      ...over,
    });

  it('drops malformed events/history/todos and non-string scalar fields', () => {
    const r = parseBackup(
      env({
        jobs: [
          {
            url: 'https://a.example/1',
            label: 'A',
            status: 'Applied',
            company: 42,
            events: [
              { id: 'x', kind: 'interview' },
              { id: 'ok', kind: 'call', date: '2026-10-14', time: 'nope' },
            ],
            history: [{ status: 5 }, { status: 'Applied', at: '2026-10-01' }],
            todos: [{ id: 't', text: 'Do it', done: 'yes' }, { text: 7 }],
          },
        ],
      }),
    );
    if (!r.ok) throw new Error(r.reason);
    const j = r.backup.jobs[0];
    expect(j.company).toBeUndefined();
    expect(j.events).toEqual([{ id: 'ok', kind: 'call', date: '2026-10-14' }]);
    expect(j.history).toEqual([{ status: 'Applied', at: '2026-10-01' }]);
    expect(j.todos).toEqual([{ id: 't', text: 'Do it', done: false }]);
  });

  it('drops groups/tiles whose parent is missing (they would fail the cloud FK)', () => {
    const r = parseBackup(
      env({
        curation: {
          categories: [{ id: 'c1', label: 'C' }],
          groups: [
            { id: 'g1', categoryId: 'c1' },
            { id: 'g2', categoryId: 'nope' },
          ],
          tiles: [
            { id: 't1', groupId: 'g1', url: 'https://x.example' },
            { id: 't2', groupId: 'g2', url: 'https://y.example' },
          ],
        },
      }),
    );
    if (!r.ok) throw new Error(r.reason);
    expect(r.backup.curation.groups.map((g) => g.id)).toEqual(['g1']);
    expect(r.backup.curation.tiles.map((t) => t.id)).toEqual(['t1']);
  });
});

describe('sample data (#110)', () => {
  it('leaves demo-tagged jobs out of a backup', () => {
    const real: Job = { url: 'https://a.co/1', label: 'Real role', status: 'Saved' };
    const sample = {
      url: 'https://b.example.com/2',
      label: 'Sample',
      status: 'Saved',
      demo: true,
    } as Job;
    const b = buildBackup(
      {
        jobs: [sample, real],
        copydeck: [],
        curation: { categories: [], groups: [], tiles: [] },
        triage: { pinned: [], dismissed: [] },
        targets: {},
        filters: {},
        evidence: '',
        modes: {},
        trash: [],
        dreams: {},
        documents: [],
        kit: { fields: {}, answers: [] },
        sweeps: {},
      },
      new Date(2026, 9, 13),
    );
    expect(b.jobs).toEqual([real]);
  });
});

describe('backup carries targets, saved searches, evidence and work modes (ADR 0008)', () => {
  const tgt = (login: string) => ({
    login,
    company: login,
    repo: `${login}/ds`,
    repoUrl: `https://github.com/${login}/ds`,
    stars: 1,
    savedAt: '2026-10-01T00:00:00.000Z',
  });
  const srch = (name: string) => ({
    name,
    term: 't',
    where: '',
    mode: 'any' as const,
    exclude: [],
    seniority: 'any' as const,
    salaryOnly: false,
    contractOnly: false,
  });
  const rich = () =>
    state({
      targets: { t1: [tgt('acme')] },
      filters: { t1: [srch('Austin')] },
      evidence: 'Led HDS',
      modes: { t1: 'remote' },
    });

  it('round-trips through build and parse', () => {
    const r = parseBackup(JSON.stringify(buildBackup(rich(), NOW)));
    expect(r.ok && r.backup).toMatchObject({
      targets: { t1: [{ login: 'acme' }] },
      filters: { t1: [{ name: 'Austin' }] },
      evidence: 'Led HDS',
      modes: { t1: 'remote' },
    });
  });

  it('an older backup without them parses with the fields empty', () => {
    const r = parseBackup(wrap({ jobs: [], copydeck: [], curation: {}, triage: {} }));
    expect(r.ok && r.backup).toMatchObject({ targets: {}, filters: {}, evidence: '', modes: {} });
  });

  it('merge unions by key (backup wins); replace takes the backup', () => {
    const current = state({
      targets: { t1: [tgt('mine')] },
      filters: { t1: [srch('Mine')] },
      evidence: 'mine',
      modes: { t2: 'hybrid' },
    });
    const merged = applyBackup(current, rich(), 'merge');
    expect(merged.targets.t1.map((t) => t.login)).toEqual(['mine', 'acme']);
    expect(merged.filters.t1.map((f) => f.name)).toEqual(['Mine', 'Austin']);
    expect(merged.evidence).toBe('Led HDS\n\n--- From this device ---\n\nmine');
    expect(merged.modes).toEqual({ t1: 'remote', t2: 'hybrid' });
    const replaced = applyBackup(current, rich(), 'replace');
    expect(replaced.targets.t1.map((t) => t.login)).toEqual(['acme']);
    expect(replaced.modes).toEqual({ t1: 'remote' });
  });
});

describe('backup carries Recently removed (blob v8)', () => {
  const removed = (url: string, label = 'Gone') => ({
    job: job(url, label),
    removedAt: new Date().toISOString(),
  });

  it('round-trips, drops sample jobs, and an older backup parses with an empty trash', () => {
    const sample = {
      ...removed('https://example.com/s'),
      job: { ...job('https://example.com/s'), demo: true } as Job,
    };
    const b = buildBackup(state({ trash: [removed('https://example.com/r'), sample] }), NOW);
    expect(b.trash.map((r) => r.job.url)).toEqual(['https://example.com/r']);
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok && r.backup.trash.map((x) => x.job.url)).toEqual(['https://example.com/r']);
    const old = parseBackup(wrap({ jobs: [], copydeck: [], curation: {}, triage: {} }));
    expect(old.ok && old.backup.trash).toEqual([]);
  });

  it('a job saved after the restore is not also listed as removed', () => {
    const current = state({ jobs: [], trash: [removed('https://example.com/a')] });
    const merged = applyBackup(current, state(), 'merge');
    expect(merged.trash).toEqual([]);
    const replaced = applyBackup(
      current,
      state({ trash: [removed('https://example.com/b')] }),
      'replace',
    );
    expect(replaced.trash.map((r) => r.job.url)).toEqual(['https://example.com/b']);
  });
});

describe('backup carries Documents (#226)', () => {
  const at = '2026-10-01T00:00:00.000Z';
  const doc = (id: string, jobUrl?: string): Document => ({
    id,
    kind: 'cover',
    title: id,
    createdAt: at,
    versions: [{ id: `${id}v`, text: id, savedAt: at }],
    ...(jobUrl ? { jobUrl } : {}),
  });

  it('round-trips, leaves out a sample job’s documents, and an older backup parses with none', () => {
    const sample = {
      url: 'https://demo.example/1',
      label: 'x',
      status: 'Saved',
      demo: true,
    } as Job;
    const b = buildBackup(
      state({ jobs: [sample], documents: [doc('real'), doc('s', 'https://demo.example/1')] }),
      NOW,
    );
    const parsed = parseBackup(JSON.stringify(b));
    expect(parsed.ok && parsed.backup.documents.map((d) => d.id)).toEqual(['real']);
    const old = parseBackup(wrap({ jobs: [] }));
    expect(old.ok && old.backup.documents).toEqual([]);
  });

  it('merge unions by id; replace takes the backup', () => {
    const cur = state({ documents: [doc('mine')] });
    const bak = state({ documents: [doc('theirs')] });
    expect(
      applyBackup(cur, bak, 'merge')
        .documents.map((d) => d.id)
        .sort(),
    ).toEqual(['mine', 'theirs']);
    expect(applyBackup(cur, bak, 'replace').documents.map((d) => d.id)).toEqual(['theirs']);
  });
});

// "Download all my data" (#47): the backup carries every synced store, the Application kit (its
// profile fields are personal data) and the wide-sweep titles included.
describe('backup covers the Application kit and sweep titles (#47)', () => {
  const kit = {
    fields: { name: 'Sam Doe', email: 'sam@example.test' },
    answers: [{ id: 'a1', q: 'Why us?', a: 'Because.' }],
  };
  const sweeps = { c1: { titles: ['Welder', 'Fitter'], off: ['Fitter'] } };

  it('round-trips both', () => {
    const r = parseBackup(JSON.stringify(buildBackup(state({ kit, sweeps }), NOW)));
    expect(r.ok && r.backup.kit).toEqual(kit);
    expect(r.ok && r.backup.sweeps).toEqual(sweeps);
  });

  it('reads an older backup without them as empty', () => {
    const r = parseBackup(wrap({}));
    expect(r.ok && r.backup.kit).toEqual({ fields: {}, answers: [] });
    expect(r.ok && r.backup.sweeps).toEqual({});
  });

  it('sanitizes them', () => {
    const r = parseBackup(
      wrap({
        kit: { fields: { name: 'ok', nope: 'x' }, answers: [{ q: 'no id' }] },
        sweeps: { __proto__: { titles: ['x'] }, c2: { titles: 'nope' } },
      }),
    );
    expect(r.ok && r.backup.kit).toEqual({ fields: { name: 'ok' }, answers: [] });
    expect(r.ok && r.backup.sweeps).toEqual({});
  });

  it('replace takes the backup’s; merge lets the backup win on shared keys', () => {
    const current = state({
      kit: { fields: { name: 'Old', phone: '555' }, answers: [] },
      sweeps: { c9: { titles: ['Local'], off: [] } },
    });
    const backup = state({ kit, sweeps });
    const replaced = applyBackup(current, backup, 'replace');
    expect(replaced.kit).toEqual(kit);
    expect(replaced.sweeps).toEqual(sweeps);
    const merged = applyBackup(current, backup, 'merge');
    expect(merged.kit.fields).toEqual({ name: 'Sam Doe', email: 'sam@example.test', phone: '555' });
    expect(Object.keys(merged.sweeps).sort()).toEqual(['c1', 'c9']);
  });
});
