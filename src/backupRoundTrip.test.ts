// Backup → restore fidelity (data tools audit): for a seeded spread of well-formed accounts, a
// downloaded backup parses back to exactly what was backed up, store by store, and a Replace
// restore yields that same state. A field a store keeps but parseBackup drops fails here.
import { describe, expect, it } from 'vitest';
import { applyBackup, buildBackup, parseBackup, type AccountState } from './backup';
import type { Job, Status } from './types';
import type { Snippet } from './copyDeckStore';
import type { Document } from './documents';

const NOW = new Date('2026-10-27T12:00:00.000Z');

/** mulberry32: small, seeded, reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gen(seed: number): AccountState {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const maybe = () => r() < 0.5;
  const n = (max: number) => Math.floor(r() * (max + 1));
  // Text with the characters a hand-typed note carries: quotes, commas, newlines, unicode.
  const text = () => pick(['Hi, "there"', 'line one\nline two', 'Café — 50%', '=SUM(A1)', 'plain']);
  const day = (d: number) => `2026-11-${String(10 + d).padStart(2, '0')}`;
  const statuses: Status[] = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];

  const job = (i: number): Job => {
    const j: Job = {
      url: `https://jobs.example.org/${seed}/${i}`,
      label: `Role ${i}`,
      status: pick(statuses),
    };
    if (maybe()) j.company = `Co ${i}`;
    if (maybe()) j.location = 'Spokane, WA';
    if (maybe()) j.applied = day(n(5));
    if (maybe()) j.followUp = day(n(5));
    if (maybe()) j.snoozeUntil = day(n(5));
    if (maybe()) j.deadline = day(n(5));
    if (maybe()) j.postedAt = '2026-10-01T08:00:00Z';
    if (maybe()) j.discoveredAt = NOW.toISOString();
    if (maybe()) j.savedAt = NOW.toISOString();
    if (maybe()) j.closedAt = NOW.toISOString();
    if (maybe()) j.notes = text();
    if (maybe()) j.note = text();
    if (maybe()) j.contact = 'Sam';
    if (maybe()) j.salary = '$100k';
    if (maybe()) j.seniority = 'Senior';
    if (maybe()) j.resume = 'v2';
    if (maybe()) j.priority = true;
    if (maybe()) j.archived = true;
    if (maybe()) j.verdict = pick(['match', 'stretch', 'reach'] as const);
    if (maybe()) j.mode = pick(['remote', 'hybrid', 'onsite'] as const);
    if (maybe()) j.blockers = ['clearance'];
    if (maybe()) j.angle = text();
    if (maybe()) j.screenedAt = NOW.toISOString();
    if (maybe()) j.todos = [{ id: `t${i}`, text: text(), done: maybe() }];
    if (maybe()) j.history = [{ status: 'Applied', at: day(1) }];
    if (maybe())
      j.events = [
        { id: `e${i}`, kind: 'interview', date: day(2), time: '09:30', durationMin: 45, note: 'x' },
      ];
    if (maybe())
      j.decks = [
        { id: `d${i}`, url: 'https://pitch.example.org/deck', label: 'Deck', sentOn: day(1) },
      ];
    return j;
  };
  const jobs = Array.from({ length: 1 + n(4) }, (_, i) => job(i));

  const snippet = (i: number): Snippet => {
    const s: Snippet = { id: `s${i}`, label: `Snippet ${i}`, body: 'Hi [Company], [Your name]' };
    if (maybe()) s.pinned = true;
    if (maybe()) s.open = true;
    if (maybe()) s.migrated = true;
    if (maybe()) s.pillars = ['p1'];
    if (maybe()) s.values = { company: 'Acme', 'your name': 'Adrian' };
    return s;
  };

  const doc = (i: number): Document => {
    const d: Document = {
      id: `doc${i}`,
      kind: 'outreach',
      title: `Doc ${i}`,
      createdAt: '2026-10-01T00:00:00.000Z',
      versions: [{ id: `v${i}`, text: text(), savedAt: '2026-10-01T00:00:00.000Z' }],
    };
    if (maybe()) d.pinned = true;
    if (maybe()) d.values = { company: 'Acme' };
    if (maybe()) d.base = true;
    return d;
  };

  const removed = {
    job: { ...job(99), url: `https://jobs.example.org/${seed}/removed` },
    removedAt: '2026-10-26T00:00:00.000Z',
  };

  return {
    jobs,
    copydeck: Array.from({ length: n(3) }, (_, i) => snippet(i)),
    curation: {
      categories: [
        {
          id: 'c1',
          label: 'Design Systems',
          titles: ['design systems'],
          atsRoles: ['design technologist'],
          seniority: pick(['entry', 'experienced', 'any'] as const),
          location: maybe() ? 'Remote' : '',
          tailorRole: maybe() ? 'Designer' : null,
          sortOrder: n(3),
          archived: maybe(),
          createdAt: 'x',
          updatedAt: 'y',
        },
      ],
      groups: [
        {
          id: 'g1',
          categoryId: 'c1',
          label: 'Watched',
          sortOrder: 0,
          archived: false,
          createdAt: 'x',
        },
      ],
      tiles: [
        {
          id: 't1',
          groupId: 'g1',
          name: 'Acme',
          url: 'https://boards.greenhouse.io/acme',
          meta: 'Remote',
          sortOrder: 0,
          createdAt: 'x',
        },
      ],
    },
    triage: { dismissed: maybe() ? ['https://set.aside.example.org/'] : [] },
    targets: maybe()
      ? {
          c1: [
            {
              login: 'acme',
              company: 'Acme',
              repo: 'acme/ds',
              repoUrl: 'https://github.com/acme/ds',
              stars: 12,
              savedAt: '2026-10-01T00:00:00.000Z',
            },
          ],
        }
      : {},
    filters: maybe()
      ? {
          c1: [
            {
              name: 'Remote DS',
              term: 'design system',
              where: '',
              mode: 'remote',
              exclude: ['intern'],
              seniority: 'any',
              salaryFloor: 120000,
              salaryOnly: false,
              contractOnly: maybe(),
            },
          ],
        }
      : {},
    evidence: maybe() ? text() : '',
    modes: maybe() ? { c1: 'hybrid' } : {},
    trash: maybe() ? [removed] : [],
    dreams: maybe()
      ? {
          c1: [
            {
              key: 'acme',
              company: 'Acme',
              website: 'https://acme.example.org/',
              board: { kind: 'greenhouse', slug: 'acme' },
              seen: ['1', '2'],
              checkedAt: '2026-10-20T00:00:00.000Z',
              starredAt: '2026-10-01T00:00:00.000Z',
            },
          ],
        }
      : {},
    documents: Array.from({ length: n(3) }, (_, i) => doc(i)),
    kit: maybe()
      ? {
          fields: { name: 'Adrian', email: 'a@example.org' },
          answers: [{ id: 'a1', q: 'Why?', a: text() }],
          whyTemplate: 's0',
        }
      : { fields: {}, answers: [] },
    sweeps: maybe()
      ? { c1: { titles: ['Design Systems', 'Design Technologist'], off: ['Design Technologist'] } }
      : {},
    mustInclude: maybe()
      ? {
          c1: {
            terms: ['design system'],
            atsOff: ['ui engineer'],
            inTitle: false,
            inText: true,
            phrase: true,
            related: false,
            relatedOff: ['Design Technologist'],
          },
        }
      : {},
    profiles: maybe()
      ? [
          {
            id: 'main',
            label: 'Design Systems',
            titles: ['Design Systems', 'Design Technologist'],
            titlesOff: maybe() ? ['Design Technologist'] : [],
            atsRoles: ['design technologist'],
            atsOff: [],
            include: { terms: ['design system'], ...(maybe() && { inText: true }) },
            leaveOut: maybe() ? ['intern'] : [],
            ...(maybe() && { payFloor: 120000 }),
            level: pick(['entry', 'experienced', 'any'] as const),
            location: maybe() ? 'Remote' : '',
            mode: pick(['any', 'remote', 'hybrid', 'onsite'] as const),
            ...(maybe() && { scorer: 'design-systems' as const }),
            createdAt: '2026-10-28T00:00:00.000Z',
          },
        ]
      : [],
    sources: maybe()
      ? [
          {
            kind: 'greenhouse',
            ref: 'acme',
            label: 'Acme',
            ...(maybe() && { star: true as const }),
          },
          { kind: 'lever', ref: 'globex', label: 'Globex', eu: true, muted: true },
          {
            kind: 'company',
            ref: 'initech',
            label: 'Initech',
            website: 'https://initech.example.org/',
          },
          { kind: 'github', ref: 'acme', label: 'Acme', repo: 'acme/ds' },
          { kind: 'feed', ref: 'hn', label: 'Hacker News' },
        ]
      : [],
    decided: maybe()
      ? [{ fingerprint: 'acme|design systems', verdict: 'skipped', at: '2026-10-27T00:00:00.000Z' }]
      : [],
  };
}

/** JSON drops `undefined` keys; compare what a file can carry. */
const viaJson = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);

describe('backup round-trip (property, 150 seeds)', () => {
  it.each(SEEDS)('seed %i: every store parses back exactly as backed up', (seed) => {
    const state = gen(seed);
    const file = JSON.stringify(buildBackup(state, NOW));
    const parsed = parseBackup(file);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { app: _a, kind: _k, v: _v, exportedAt, ...back } = parsed.backup;
    expect(exportedAt).toBe(NOW.toISOString());
    for (const key of Object.keys(state) as (keyof AccountState)[])
      expect(viaJson(back[key]), key).toEqual(viaJson(state[key]));
  });

  it.each(SEEDS.slice(0, 30))('seed %i: Replace restores the backed-up state', (seed) => {
    const state = gen(seed);
    const parsed = parseBackup(JSON.stringify(buildBackup(state, NOW)));
    if (!parsed.ok) throw new Error(parsed.reason);
    const restored = applyBackup(gen(seed + 1000), parsed.backup, 'replace');
    expect(viaJson(restored)).toEqual(viaJson(state));
  });
});

describe('snippet variable values (#221) in a backup', () => {
  it('keeps own string values and drops anything else', () => {
    const file = JSON.stringify({
      app: 'apply-board',
      kind: 'backup',
      v: 1,
      copydeck: [
        {
          id: 's1',
          label: 'Intro',
          body: 'Hi [Company]',
          values: JSON.parse('{"company":"Acme","n":3,"__proto__":"x","o":{"a":1}}'),
        },
        { id: 's2', label: 'Bare', body: 'Hi', values: ['not', 'a', 'record'] },
      ],
    });
    const parsed = parseBackup(file);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.backup.copydeck[0].values).toEqual({ company: 'Acme' });
    expect(Object.getPrototypeOf(parsed.backup.copydeck[0].values)).toBe(Object.prototype);
    expect(parsed.backup.copydeck[1]).not.toHaveProperty('values');
  });
});
