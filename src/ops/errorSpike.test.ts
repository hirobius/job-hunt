import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AFTER_MS,
  HOUR_MS,
  alertTitle,
  deploysToCheck,
  readyAtOf,
  spikeVerdict,
} from './errorSpike';

describe('spikeVerdict (#598)', () => {
  it('a jump is at least 5 reports and 3 times the baseline hourly rate', () => {
    // baseline: 168 reports over 7 days = 1 an hour
    expect(spikeVerdict(3, 168).spike).toBe(false); // under the floor of 5
    expect(spikeVerdict(5, 168).spike).toBe(true);
    expect(spikeVerdict(5, 168 * 2).spike).toBe(false); // 2 an hour: 5 < 6
    expect(spikeVerdict(6, 168 * 2).spike).toBe(true);
  });

  it('a quiet baseline still needs the floor', () => {
    expect(spikeVerdict(4, 0).spike).toBe(false);
    expect(spikeVerdict(5, 0).spike).toBe(true);
    expect(spikeVerdict(0, 0).line).toBe(
      'No spike: 0 reports in the hour after the deploy, baseline 0.00 an hour.',
    );
  });
});

describe('deploysToCheck', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const at = (ms: number) => ({ sha: String(ms), readyAt: new Date(now - ms).toISOString() });

  it('takes deploys whose hour after ended within the look back', () => {
    const picked = deploysToCheck(
      [at(AFTER_MS - 1), at(AFTER_MS), at(AFTER_MS + 30 * 60_000), at(AFTER_MS + 2 * HOUR_MS)],
      now,
      70 * 60_000,
    );
    expect(picked.map((d) => d.sha)).toEqual([String(AFTER_MS), String(AFTER_MS + 30 * 60_000)]);
  });

  it('skips a deploy with a bad date', () => {
    expect(deploysToCheck([{ sha: 'x', readyAt: 'soon' }], now, HOUR_MS)).toEqual([]);
  });
});

describe('readyAtOf and alertTitle', () => {
  it('reads the first success status', () => {
    expect(
      readyAtOf([
        { state: 'success', created_at: '2026-11-12T10:05:00Z' },
        { state: 'pending', created_at: '2026-11-12T10:00:00Z' },
        { state: 'success', created_at: '2026-11-12T10:04:00Z' },
      ]),
    ).toBe('2026-11-12T10:04:00Z');
    expect(readyAtOf([{ state: 'failure', created_at: '2026-11-12T10:00:00Z' }])).toBeNull();
  });

  it('names the deploy by its short sha', () => {
    expect(alertTitle('abcdef1234567')).toBe('Client errors jumped after deploy abcdef1');
  });
});

describe('the door into client_errors', () => {
  const sql = fs.readFileSync('supabase/migrations/20261112100000_client_error_alert.sql', 'utf8');

  it('counts only, behind a hashed token, with no table read for anon', () => {
    expect(sql).toMatch(/create or replace function public\.client_error_count\(/);
    expect(sql).toContain('security definer');
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("encode(sha256(convert_to(p_token, 'UTF8')), 'hex')");
    expect(sql).toContain(
      'revoke all on public.ops_alert_tokens from public, anon, authenticated;',
    );
    expect(sql).toMatch(/returns integer/);
    expect(sql).not.toMatch(/grant select on public\.client_errors/);
  });

  it('the workflow runs hourly and needs only the token secret', () => {
    const yml = fs.readFileSync('docs/ci/proposed-error-spike.yml', 'utf8');
    expect(yml).toMatch(/schedule:\s*\n\s*- cron: '\d+ \* \* \* \*'/);
    expect(yml).toContain('secrets.ERROR_ALERT_TOKEN');
    expect(yml).toContain('scripts/error-spike.ts');
  });
});
