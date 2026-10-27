import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addJob, getAllJobs, removeJob, updateJob } from './store';
import { createDocument, getAllDocuments, replaceDocuments } from './documents';
import {
  getTrash,
  mergeTrash,
  deleteForever,
  purgeJob,
  replaceTrash,
  restoreJob,
  sanitizeTrash,
  trashJob,
  TRASH_KEY,
} from './trash';

const A = 'https://acme.example/jobs/1';
const B = 'https://zenith.example/jobs/2';
const DAY = 86_400_000;
const NOW = new Date('2026-10-17T12:00:00Z');

beforeEach(() => {
  localStorage.clear();
  replaceTrash([]);
});
afterEach(() => {
  getAllJobs()
    .slice()
    .forEach((j) => removeJob(j.url));
});

describe('trash (Recently removed)', () => {
  it('trashJob moves the job out of the list into the trash, with what it held', () => {
    addJob(A, 'Design Engineer');
    updateJob(A, { notes: 'call Sam' });
    trashJob(A);
    expect(getAllJobs()).toHaveLength(0);
    expect(getTrash()).toHaveLength(1);
    expect(getTrash()[0].job.notes).toBe('call Sam');
    expect(JSON.parse(localStorage.getItem(TRASH_KEY) || '[]')).toHaveLength(1);
  });

  it('restoreJob puts it back and empties its trash entry', () => {
    addJob(A, 'Design Engineer');
    trashJob(A);
    restoreJob(A);
    expect(getAllJobs().map((j) => j.label)).toEqual(['Design Engineer']);
    expect(getTrash()).toHaveLength(0);
  });

  it('restoreJob says whether it restored the job or found nothing to restore', () => {
    addJob(A, 'Design Engineer');
    trashJob(A);
    expect(restoreJob(A)).toBe('restored');
    expect(restoreJob(A)).toBe('missing');
  });

  it('restoring a job that was saved again merges its notes, to-dos and interviews into the saved one', () => {
    addJob(A, 'Old title');
    updateJob(A, {
      notes: 'call Sam',
      todos: [{ id: 't1', text: 'Tailor résumé', done: true }],
      events: [{ id: 'e1', kind: 'interview', date: '2026-10-20' }],
    });
    trashJob(A);
    addJob(A, 'New title');
    updateJob(A, {
      notes: 'saw it on LinkedIn',
      todos: [{ id: 't2', text: 'Find the hiring manager', done: false }],
    });
    expect(restoreJob(A)).toBe('merged');
    const [job] = getAllJobs();
    expect(getAllJobs()).toHaveLength(1);
    expect(job.label).toBe('New title'); // the saved copy's own fields stay
    expect(job.notes).toContain('saw it on LinkedIn');
    expect(job.notes).toContain('call Sam');
    expect(job.todos?.map((t) => t.id)).toEqual(['t2', 't1']);
    expect(job.events?.map((e) => e.id)).toEqual(['e1']);
    expect(getTrash()).toHaveLength(0); // nothing lost, so the entry can go
  });

  it('restoring into a copy saved again keeps what only the removed copy knew (status, dates, contact, screening)', () => {
    addJob(A, 'Design Engineer');
    updateJob(A, {
      status: 'Applied',
      applied: '2026-10-01',
      followUp: '2026-10-08',
      history: [{ status: 'Applied', at: '2026-10-01' }],
      contact: 'sam@acme.example',
      salary: '$150k',
      verdict: 'match',
      angle: 'Led the component library',
      blockers: ['clearance'],
    });
    trashJob(A);
    // Seen again on Live postings and saved: a bare Saved copy with a newer title.
    addJob(A, 'Senior Design Engineer');
    updateJob(A, { location: 'Remote' });
    expect(restoreJob(A)).toBe('merged');
    const [job] = getAllJobs();
    expect(job.label).toBe('Senior Design Engineer'); // the saved copy's own fields win
    expect(job.location).toBe('Remote');
    expect(job.status).toBe('Applied'); // further along than the bare Saved copy
    expect(job.applied).toBe('2026-10-01');
    expect(job.followUp).toBe('2026-10-08');
    expect(job.history?.map((h) => h.status)).toContain('Applied');
    expect(job.contact).toBe('sam@acme.example');
    expect(job.salary).toBe('$150k');
    expect(job.verdict).toBe('match');
    expect(job.angle).toBe('Led the component library');
    expect(job.blockers).toEqual(['clearance']);
  });

  it('removing a posting again keeps what its earlier removed copy held', () => {
    addJob(A, 'Design Engineer');
    updateJob(A, {
      status: 'Applied',
      applied: '2026-10-01',
      notes: 'call Sam',
      todos: [{ id: 't1', text: 'Tailor résumé', done: true }],
    });
    trashJob(A);
    addJob(A, 'Design Engineer');
    updateJob(A, { notes: 'saw it again' });
    trashJob(A);
    expect(getTrash()).toHaveLength(1);
    const { job } = getTrash()[0];
    expect(job.notes).toContain('call Sam');
    expect(job.notes).toContain('saw it again');
    expect(job.todos?.map((t) => t.id)).toEqual(['t1']);
    expect(job.status).toBe('Applied');
  });

  it('a saved copy that moved on keeps its own status', () => {
    addJob(A);
    updateJob(A, { status: 'Applied', applied: '2026-10-01' });
    trashJob(A);
    addJob(A);
    updateJob(A, { status: 'Interviewing', applied: '2026-10-05' });
    restoreJob(A);
    const [job] = getAllJobs();
    expect(job.status).toBe('Interviewing');
    expect(job.applied).toBe('2026-10-05');
  });

  it('merging never doubles what both copies already share', () => {
    addJob(A, 'Design Engineer');
    updateJob(A, { notes: 'same', todos: [{ id: 't1', text: 'x', done: false }] });
    trashJob(A);
    addJob(A, 'Design Engineer');
    updateJob(A, { notes: 'same', todos: [{ id: 't1', text: 'x', done: true }] });
    restoreJob(A);
    const [job] = getAllJobs();
    expect(job.notes).toBe('same');
    expect(job.todos).toEqual([{ id: 't1', text: 'x', done: true }]);
  });

  it('merges the older single note field too', () => {
    addJob(A);
    updateJob(A, { note: 'old note' });
    trashJob(A);
    addJob(A);
    restoreJob(A);
    expect(getAllJobs()[0].notes).toBe('old note');
  });

  it('purgeJob deletes it for good', () => {
    addJob(A);
    trashJob(A);
    purgeJob(A);
    expect(getTrash()).toHaveLength(0);
    expect(getAllJobs()).toHaveLength(0);
  });

  it('Delete forever takes the job’s documents with it; Restore keeps them (#226)', () => {
    replaceDocuments([]);
    addJob(A);
    addJob(B);
    createDocument({ kind: 'cover', title: 'For A', jobUrl: A, text: 'x' });
    createDocument({ kind: 'cover', title: 'For B', jobUrl: B, text: 'y' });
    trashJob(B);
    restoreJob(B);
    trashJob(A);
    deleteForever(A);
    expect(getTrash()).toHaveLength(0);
    expect(getAllDocuments().map((d) => d.title)).toEqual(['For B']);
  });

  it('Delete forever keeps the documents of the same posting saved again since (#226)', () => {
    replaceDocuments([]);
    addJob(A);
    trashJob(A);
    addJob(A);
    createDocument({ kind: 'cover', title: 'Cover', jobUrl: A, text: 'hi' });
    deleteForever(A);
    expect(getTrash()).toHaveLength(0);
    expect(getAllJobs()).toHaveLength(1);
    expect(getAllDocuments().map((d) => d.title)).toEqual(['Cover']);
  });

  it('Delete forever can be undone: the entry and its documents come back in place', () => {
    replaceDocuments([]);
    addJob(A);
    addJob(B);
    updateJob(A, { notes: 'call Sam' });
    createDocument({ kind: 'cover', title: 'For B', jobUrl: B, text: 'y' });
    createDocument({ kind: 'cover', title: 'For A', jobUrl: A, text: 'x' });
    trashJob(B);
    trashJob(A);
    const undo = deleteForever(A);
    expect(getTrash().map((r) => r.job.url)).toEqual([B]);
    expect(getAllDocuments().map((d) => d.title)).toEqual(['For B']);
    undo();
    expect(
      getTrash()
        .map((r) => r.job.url)
        .sort(),
    ).toEqual([A, B]);
    expect(getTrash().find((r) => r.job.url === A)?.job.notes).toBe('call Sam');
    expect(getAllDocuments().map((d) => d.title)).toEqual(['For B', 'For A']);
  });

  it('newest first, one entry per job', () => {
    addJob(A);
    addJob(B);
    trashJob(A);
    trashJob(B);
    expect(getTrash().map((r) => r.job.url)).toEqual([B, A]);
  });

  it('sanitize drops malformed entries and anything older than 30 days', () => {
    const at = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
    const out = sanitizeTrash(
      [
        { job: { url: A, label: 'A', status: 'Saved' }, removedAt: at(29) },
        { job: { url: B, label: 'B', status: 'Saved' }, removedAt: at(31) },
        { job: { label: 'no url' }, removedAt: at(1) },
        { job: { url: 'https://c.example/1' }, removedAt: 'not a date' },
        null,
        'junk',
      ],
      NOW,
    );
    expect(out.map((r) => r.job.url)).toEqual([A]);
    expect(sanitizeTrash({ not: 'a list' }, NOW)).toEqual([]);
  });

  it('merge keeps both sides, cloud wins a shared job', () => {
    const r = (url: string, label: string) => ({
      job: { url, label, status: 'Saved' as const },
      removedAt: NOW.toISOString(),
    });
    const merged = mergeTrash([r(A, 'cloud')], [r(A, 'local'), r(B, 'local')]);
    expect(merged.map((x) => [x.job.url, x.job.label])).toEqual([
      [A, 'cloud'],
      [B, 'local'],
    ]);
  });
});
