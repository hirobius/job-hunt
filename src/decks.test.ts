// Decks per job (#287): the pure helpers, and that decks ride with the job through sync, Back up
// and the CSV export.
import { afterEach, describe, expect, it } from 'vitest';
import { addDeck, decksCell, removeDeck, restoreDeck, sanitizeDecks, updateDeck } from './decks';
import { emptyBlob, mergeBlob, readBlob, writeBlob } from './syncBlob';
import { buildBackup, parseBackup } from './backup';
import { CSV_COLUMNS, toCsv } from './csv';
import { addJob, getAllJobs, removeJob, replaceAll, updateJob } from './store';
import type { Deck, Job } from './types';

const ids = (...list: string[]) => {
  let i = 0;
  return () => list[i++];
};
const deck = (id: string, over: Partial<Deck> = {}): Deck => ({
  id,
  url: `https://slides.example/${id}`,
  ...over,
});

describe('deck helpers', () => {
  it('adds a deck with a trimmed label and a sent day', () => {
    expect(
      addDeck(
        undefined,
        { url: ' https://pitch.com/v/acme ', label: ' Acme pitch ', sentOn: '2026-10-20' },
        ids('d1'),
      ),
    ).toEqual([
      { id: 'd1', url: 'https://pitch.com/v/acme', label: 'Acme pitch', sentOn: '2026-10-20' },
    ]);
  });

  it('leaves out an empty label and sent day', () => {
    expect(addDeck([], { url: 'https://x.example/d', label: ' ', sentOn: '' }, ids('d1'))).toEqual([
      { id: 'd1', url: 'https://x.example/d' },
    ]);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'pitch.com/v/acme',
    'ftp://x.example/d',
    '',
  ])('refuses a link that is not http(s): %j', (url) => {
    expect(addDeck([deck('a')], { url }, ids('d1'))).toBeNull();
    expect(updateDeck([deck('a')], 'a', { url })).toBeNull();
  });

  it('edits a deck in place, keeping its id and place', () => {
    const list = [deck('a'), deck('b', { label: 'Old', sentOn: '2026-10-01' }), deck('c')];
    expect(
      updateDeck(list, 'b', { url: 'https://new.example/b', label: 'New', sentOn: '' }),
    ).toEqual([deck('a'), { id: 'b', url: 'https://new.example/b', label: 'New' }, deck('c')]);
  });

  it('removes a deck, and restore puts it back in its place once', () => {
    const list = [deck('a'), deck('b'), deck('c')];
    const less = removeDeck(list, 'b');
    expect(less.map((d) => d.id)).toEqual(['a', 'c']);
    const back = restoreDeck(less, deck('b'), 1);
    expect(back.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(restoreDeck(back, deck('b'), 1)).toHaveLength(3);
  });

  it('sanitize keeps only well-formed http(s) decks', () => {
    expect(
      sanitizeDecks([
        deck('ok', { label: 'L', sentOn: '2026-10-20' }),
        { id: 'js', url: 'javascript:alert(1)' },
        { id: 'bad-date', url: 'https://x.example/1', sentOn: 'Tuesday', label: 7 },
        { url: 'https://no-id.example' },
        { id: '__proto__', url: 'https://x.example/2' },
        deck('ok'), // a second deck with the same id
        'nope',
      ]),
    ).toEqual([
      deck('ok', { label: 'L', sentOn: '2026-10-20' }),
      { id: 'bad-date', url: 'https://x.example/1' },
    ]);
    expect(sanitizeDecks('nope')).toEqual([]);
  });

  it('writes one CSV cell for all of a job’s decks', () => {
    expect(decksCell([deck('a', { label: 'Portfolio', sentOn: '2026-10-20' }), deck('b')])).toBe(
      'Portfolio https://slides.example/a sent 2026-10-20 | https://slides.example/b',
    );
    expect(decksCell(undefined)).toBe('');
  });
});

describe('decks ride with the job', () => {
  const URL = 'https://acme.example/jobs/1';
  afterEach(() =>
    getAllJobs()
      .slice()
      .forEach((j) => removeJob(j.url)),
  );

  it('the store keeps decks and drops a non-http one read from storage or the cloud', () => {
    replaceAll([
      {
        url: URL,
        label: 'Designer',
        status: 'Saved',
        decks: [deck('a'), { id: 'x', url: 'javascript:alert(1)' }],
      } as Job,
    ]);
    expect(getAllJobs()[0].decks).toEqual([deck('a')]);
  });

  it('sync: decks added on one device reach another through the blob', () => {
    addJob(URL, 'Designer');
    updateJob(URL, { decks: [deck('a', { label: 'Portfolio', sentOn: '2026-10-20' })] });
    const pushed = JSON.parse(JSON.stringify(writeBlob({ ...emptyBlob(), jobs: getAllJobs() })));

    // The other device holds the job without decks; a re-pull takes the cloud's copy.
    const otherDevice = {
      ...emptyBlob(),
      jobs: [{ url: URL, label: 'Designer', status: 'Saved' } as Job],
    };
    const merged = mergeBlob(readBlob(pushed), otherDevice, false);
    replaceAll(merged.jobs);
    expect(getAllJobs()[0].decks).toEqual([
      deck('a', { label: 'Portfolio', sentOn: '2026-10-20' }),
    ]);
  });

  it('sync: an edit and a remove on one device win on the next pull', () => {
    const cloudJob: Job = {
      url: URL,
      label: 'D',
      status: 'Saved',
      decks: [deck('b', { label: 'New' })],
    };
    const local = { ...emptyBlob(), jobs: [{ ...cloudJob, decks: [deck('a'), deck('b')] }] };
    const merged = mergeBlob(
      readBlob(writeBlob({ ...emptyBlob(), jobs: [cloudJob] })),
      local,
      false,
    );
    expect(merged.jobs[0].decks).toEqual([deck('b', { label: 'New' })]);
  });

  it('Back up carries decks and Restore drops a non-http one', () => {
    const jobs: Job[] = [{ url: URL, label: 'D', status: 'Saved', decks: [deck('a')] }];
    const b = buildBackup(
      {
        jobs,
        copydeck: [],
        curation: { categories: [], groups: [], tiles: [] },
        triage: { dismissed: [] },
        targets: {},
        filters: {},
        evidence: '',
        modes: {},
        trash: [],
        dreams: {},
        documents: [],
        kit: { fields: {}, answers: [] },
        sweeps: {},
        mustInclude: {},
      } as unknown as Parameters<typeof buildBackup>[0],
      new Date('2026-10-26T00:00:00Z'),
    );
    const text = JSON.stringify(b).replace(
      '"decks":[',
      '"decks":[{"id":"x","url":"javascript:alert(1)"},',
    );
    const r = parseBackup(text);
    if (!r.ok) throw new Error(r.reason);
    expect(r.backup.jobs[0].decks).toEqual([deck('a')]);
  });

  it('the CSV export has one decks column', () => {
    expect(CSV_COLUMNS.filter((c) => c === 'decks')).toHaveLength(1);
    const [head, row] = toCsv([
      { url: URL, label: 'D', status: 'Saved', decks: [deck('a', { label: 'Portfolio' })] },
    ]).split('\r\n');
    expect(head.split(',').pop()).toBe('"decks"');
    expect(row.split(',').pop()).toBe('"Portfolio https://slides.example/a"');
  });
});
