import { describe, expect, it } from 'vitest';
import { csvCell, toCsv, CSV_COLUMNS } from './csv';
import type { Job } from './types';

describe('csvCell — quoting + formula neutralization', () => {
  it.each([
    ['plain', '"plain"'],
    ['say "hi"', '"say ""hi"""'],
    ['=SUM(A1)', `"'=SUM(A1)"`],
    ['+1 555', `"'+1 555"`],
    ['-2', `"'-2"`],
    ['@cmd', `"'@cmd"`],
    ['\tTab', `"'\tTab"`],
    ['\rCR', `"'\rCR"`],
    ['a=b', '"a=b"'],
    ['', '""'],
  ])('%j → %s', (input, out) => {
    expect(csvCell(input)).toBe(out);
  });
});

describe('toCsv', () => {
  const job: Job = {
    url: 'https://x.co/1',
    label: '=HYPERLINK("evil")',
    status: 'Applied',
    applied: '2026-10-01',
    followUp: '2026-10-08',
    notes: 'long notes',
    note: 'short',
    screenedAt: '2026-09-30T10:00:00Z',
    todos: [
      { id: '1', text: 'Research', done: true },
      { id: '2', text: 'Tailor', done: false },
    ],
    history: [
      { status: 'Saved', at: '2026-09-29' },
      { status: 'Applied', at: '2026-10-01' },
    ],
    events: [{ id: 'e', kind: 'interview', date: '2026-10-15', time: '14:00' }],
  };

  it('header row lists every column', () => {
    const [head] = toCsv([]).split('\r\n');
    expect(head.split(',').length).toBe(CSV_COLUMNS.length);
    for (const c of ['notes', 'todos', 'follow_up', 'screened_at', 'history', 'events'])
      expect(head).toContain(`"${c}"`);
  });

  it('includes notes, todos, follow-up, screenedAt, history, events and neutralizes formulas', () => {
    const [, row] = toCsv([job]).split('\r\n');
    expect(row).toContain(`"'=HYPERLINK(""evil"")"`);
    expect(row).toContain('"long notes"');
    expect(row).toContain('"[x] Research | [ ] Tailor"');
    expect(row).toContain('"2026-10-08"');
    expect(row).toContain('"2026-09-30T10:00:00Z"');
    expect(row).toContain('"Saved 2026-09-29 > Applied 2026-10-01"');
    expect(row).toContain('"interview 2026-10-15 14:00"');
  });

  it('carries a contract deadline and a snoozed follow-up, appended so older columns keep their place', () => {
    const contract: Job = { ...job, deadline: '2026-11-20', snoozeUntil: '2026-11-03' };
    const [head, row] = toCsv([contract]).split('\r\n');
    const cols = head.split(',');
    expect(cols.slice(-7, -5)).toEqual(['"deadline"', '"snooze_until"']);
    expect(cols.indexOf('"decks"')).toBe(cols.length - 8);
    const cells = row.split(',');
    expect(cells.slice(-7, -5)).toEqual(['"2026-11-20"', '"2026-11-03"']);
    expect(toCsv([job]).split('\r\n')[1].endsWith(',"","","","","","",""')).toBe(true);
  });

  it('one row per job, CRLF separated', () => {
    expect(toCsv([job, { ...job, url: 'https://x.co/2' }]).split('\r\n')).toHaveLength(3);
  });
});

describe('sample data (#110)', () => {
  it('leaves demo-tagged jobs out of the export', () => {
    const real: Job = { url: 'https://a.co/1', label: 'Real role', status: 'Saved' };
    const sample = {
      url: 'https://b.example.com/2',
      label: 'Sample role',
      status: 'Saved',
      demo: true,
    } as Job;
    const csv = toCsv([sample, real]);
    expect(csv).toContain('Real role');
    expect(csv).not.toContain('Sample role');
  });
});

describe('job dates (#419)', () => {
  it('appends posted, discovered, saved and closed dates after the older columns', () => {
    const dated: Job = {
      url: 'https://acme.example/jobs/1',
      label: 'Designer',
      status: 'Saved',
      postedAt: '2026-10-25',
      discoveredAt: '2026-10-27T09:00:00.000Z',
      savedAt: '2026-10-27T10:00:00.000Z',
      closedAt: '2026-10-28T12:00:00.000Z',
    };
    const [head, row] = toCsv([dated]).split('\r\n');
    expect(head.split(',').slice(-5, -1)).toEqual([
      '"posted_at"',
      '"discovered_at"',
      '"saved_at"',
      '"closed_at"',
    ]);
    expect(row.split(',').slice(-5, -1)).toEqual([
      '"2026-10-25"',
      '"2026-10-27T09:00:00.000Z"',
      '"2026-10-27T10:00:00.000Z"',
      '"2026-10-28T12:00:00.000Z"',
    ]);
  });
});

describe('document links (#416)', () => {
  it('appends a doc_links column, after the dates, so older columns keep their place', () => {
    const linked: Job = {
      url: 'https://acme.example/jobs/1',
      label: 'Designer',
      status: 'Saved',
      docLinks: [{ id: 'a', url: 'https://docs.example/cv', label: 'Résumé' }],
    };
    const [head, row] = toCsv([linked]).split('\r\n');
    expect(head.split(',').slice(-1)[0]).toBe('"doc_links"');
    expect(row.split(',').slice(-1)[0]).toBe('"Résumé https://docs.example/cv"');
  });
});
