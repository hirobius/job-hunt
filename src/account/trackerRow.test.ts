// The tracker row adapter (#814): one cloud row per user, written only over the version this tab
// last read (optimistic concurrency), against the in-memory supabase-js stand-in.
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeSupabase } from '../test/fakeSupabase';
import { writeBlob, emptyBlob } from '../syncBlob';
import { nextStamp, readTrackerRow, writeTrackerRow } from './trackerRow';

const client = (tables: Record<string, Record<string, unknown>[]> = {}) => {
  const fake = createFakeSupabase({ tables });
  return { fake, supa: fake.client as unknown as SupabaseClient };
};
const blob = () => writeBlob(emptyBlob());

describe('nextStamp', () => {
  it('is now when the clock is ahead of the last stamp, or there is none', () => {
    const now = Date.parse('2026-11-19T10:00:00.000Z');
    expect(nextStamp(null, now)).toBe('2026-11-19T10:00:00.000Z');
    expect(nextStamp('2026-11-19T09:00:00.000Z', now)).toBe('2026-11-19T10:00:00.000Z');
    expect(nextStamp('not a date', now)).toBe('2026-11-19T10:00:00.000Z');
  });
  it('is one millisecond after the last stamp when this clock is behind it', () => {
    const now = Date.parse('2026-11-19T10:00:00.000Z');
    expect(nextStamp('2026-11-19T11:00:00.000Z', now)).toBe('2026-11-19T11:00:00.001Z');
  });
});

describe('readTrackerRow', () => {
  it('says there is no row, with no stamp, for a new account', async () => {
    const { supa } = client();
    expect(await readTrackerRow(supa, 'u1')).toEqual({
      blob: null,
      stamp: { row: false, at: null },
    });
  });
  it('reads the blob and its stamp', async () => {
    const at = '2026-11-19T09:00:00.000Z';
    const { supa } = client({ tracker: [{ user_id: 'u1', data: blob(), updated_at: at }] });
    const r = await readTrackerRow(supa, 'u1');
    expect(r.stamp).toEqual({ row: true, at });
    expect(r.blob?.jobs).toEqual([]);
  });
  it('throws when the read fails, so the caller says it could not load', async () => {
    const { fake, supa } = client();
    fake.failNext('tracker', 'select');
    await expect(readTrackerRow(supa, 'u1')).rejects.toThrow();
  });
});

describe('writeTrackerRow', () => {
  it('fails without a read first: it never writes blind', async () => {
    const { supa } = client();
    expect(await writeTrackerRow(supa, 'u1', blob(), null)).toEqual({
      result: 'fail',
      stamp: null,
    });
  });
  it('inserts the first row and returns its new stamp', async () => {
    const { supa } = client();
    const r = await writeTrackerRow(supa, 'u1', blob(), { row: false, at: null });
    expect(r.result).toBe('ok');
    expect(r.stamp?.row).toBe(true);
    expect((await readTrackerRow(supa, 'u1')).stamp).toEqual(r.stamp);
  });
  it('is a conflict when another device inserted the row first', async () => {
    const at = '2026-11-19T09:00:00.000Z';
    const { supa } = client({ tracker: [{ user_id: 'u1', data: blob(), updated_at: at }] });
    const r = await writeTrackerRow(supa, 'u1', blob(), { row: false, at: null });
    expect(r).toEqual({ result: 'conflict', stamp: null });
  });
  it('updates over the stamp it last saw', async () => {
    const at = '2026-11-19T09:00:00.000Z';
    const { supa } = client({ tracker: [{ user_id: 'u1', data: blob(), updated_at: at }] });
    const r = await writeTrackerRow(supa, 'u1', blob(), { row: true, at });
    expect(r.result).toBe('ok');
    expect(r.stamp?.at && r.stamp.at > at).toBe(true);
  });
  it('is a conflict when the row moved on since this tab read it', async () => {
    const { supa } = client({
      tracker: [{ user_id: 'u1', data: blob(), updated_at: '2026-11-19T09:30:00.000Z' }],
    });
    const r = await writeTrackerRow(supa, 'u1', blob(), {
      row: true,
      at: '2026-11-19T09:00:00.000Z',
    });
    expect(r).toEqual({ result: 'conflict', stamp: null });
  });
  it('fails, and keeps no stamp, when the write is refused', async () => {
    const at = '2026-11-19T09:00:00.000Z';
    const { fake, supa } = client({ tracker: [{ user_id: 'u1', data: blob(), updated_at: at }] });
    fake.failNext('tracker', 'upsert');
    expect(await writeTrackerRow(supa, 'u1', blob(), { row: true, at })).toEqual({
      result: 'fail',
      stamp: null,
    });
  });
});
