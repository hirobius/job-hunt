import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addJob, getAllJobs, removeJob, updateJob } from './store';
import {
  getLastRemoved,
  getTrash,
  mergeTrash,
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
    expect(getLastRemoved()).toBe(A);
    expect(JSON.parse(localStorage.getItem(TRASH_KEY) || '[]')).toHaveLength(1);
  });

  it('restoreJob puts it back and empties its trash entry', () => {
    addJob(A, 'Design Engineer');
    trashJob(A);
    restoreJob(A);
    expect(getAllJobs().map((j) => j.label)).toEqual(['Design Engineer']);
    expect(getTrash()).toHaveLength(0);
    expect(getLastRemoved()).toBeNull();
  });

  it('restoring a job that was saved again keeps the saved one', () => {
    addJob(A, 'Old title');
    trashJob(A);
    addJob(A, 'New title');
    restoreJob(A);
    expect(getAllJobs().map((j) => j.label)).toEqual(['New title']);
    expect(getTrash()).toHaveLength(0);
  });

  it('purgeJob deletes it for good', () => {
    addJob(A);
    trashJob(A);
    purgeJob(A);
    expect(getTrash()).toHaveLength(0);
    expect(getAllJobs()).toHaveLength(0);
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
