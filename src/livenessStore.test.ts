import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from './types';
import { FetchError, type FetchJson } from './feed/sources/http';
import { dedupKey } from './store';
import {
  liveness,
  runLivenessCheck,
  resetLivenessSession,
  autoLivenessCheck,
} from './livenessStore';

const A = 'https://jobs.ashbyhq.com/ramp/aaaa';
const B = 'https://jobs.ashbyhq.com/ramp/bbbb';
const job = (url: string): Job => ({ url, label: url, status: 'Saved' });
const NOW = Date.parse('2026-10-15T12:00:00Z');
const board = (...ids: string[]) => ({
  jobs: ids.map((id) => ({ id, jobUrl: `https://jobs.ashbyhq.com/ramp/${id}` })),
});

beforeEach(() => {
  localStorage.clear();
  liveness.set({});
  resetLivenessSession();
});

describe('runLivenessCheck', () => {
  it('stores results under the dedup key and persists them', async () => {
    const out = await runLivenessCheck([job(A), job(B)], {
      fetchJson: async () => board('aaaa'),
      now: NOW,
    });
    expect(out).toEqual({ checked: 2, couldNot: 0 });
    expect(liveness.get()[dedupKey(A)].state).toBe('open');
    expect(liveness.get()[dedupKey(B)].state).toBe('closed');
    expect(JSON.parse(localStorage.getItem('rjb_liveness')!)[dedupKey(B)].state).toBe('closed');
  });

  it('an offline check changes nothing and reports it could not check', async () => {
    await runLivenessCheck([job(A)], { fetchJson: async () => board('aaaa'), now: NOW });
    const before = liveness.get();
    const fetchJson: FetchJson = async () => Promise.reject(new FetchError(0, 'u'));
    const out = await runLivenessCheck([job(A)], { fetchJson, now: NOW + 1e6, force: true });
    expect(out).toEqual({ checked: 0, couldNot: 1 });
    expect(liveness.get()).toEqual(before);
  });

  it('records unknown for a job never checked before', async () => {
    await runLivenessCheck([job(A)], {
      fetchJson: async () => Promise.reject(new FetchError(500, 'u')),
      now: NOW,
    });
    expect(liveness.get()[dedupKey(A)].state).toBe('unknown');
  });
});

describe('autoLivenessCheck', () => {
  it('runs once per session, and only for due jobs', async () => {
    const fetchJson = vi.fn(async () => board('aaaa'));
    await autoLivenessCheck([job(A)], { fetchJson, now: NOW });
    await autoLivenessCheck([job(A)], { fetchJson, now: NOW });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('does nothing when every job was checked in the last 6 hours', async () => {
    await runLivenessCheck([job(A)], { fetchJson: async () => board('aaaa'), now: NOW });
    const fetchJson = vi.fn();
    await autoLivenessCheck([job(A)], { fetchJson, now: NOW + 3600e3 });
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
