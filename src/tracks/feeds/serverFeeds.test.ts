import { describe, expect, it } from 'vitest';
import { SERVER_FEEDS, serverFeedOn, serverFeedsOff } from './serverFeeds';

const envOf =
  (vars: Record<string, string>) =>
  (n: string): string | undefined =>
    vars[n];

describe('which server feeds run', () => {
  it('runs the keyless ones always, and never Into Design Systems without its operator', () => {
    const none = envOf({});
    expect(SERVER_FEEDS.filter((f) => serverFeedOn(f, none))).toEqual([
      'arbeitnow',
      'remoteok',
      'wwr',
    ]);
    expect(serverFeedOn('ids', none)).toBe(false);
  });

  it('turns a keyed one on when its key is set, with no code change', () => {
    expect(serverFeedOn('theirstack', envOf({ THEIRSTACK_API_KEY: 'k' }))).toBe(true);
    expect(serverFeedOn('jooble', envOf({ JOOBLE_API_KEY: 'k' }))).toBe(true);
    expect(serverFeedOn('jooble', envOf({ JOOBLE_API_KEY: '  ' }))).toBe(false);
    expect(serverFeedOn('adzuna', envOf({ ADZUNA_APP_ID: 'i', ADZUNA_APP_KEY: 'k' }))).toBe(true);
  });

  it('runs one with half its keys, so its read fails loud naming the one missing', () => {
    expect(serverFeedOn('adzuna', envOf({ ADZUNA_APP_ID: 'i' }))).toBe(true);
  });

  it('says what each switched-off one needs, by env var name', () => {
    expect(serverFeedsOff(envOf({ JOOBLE_API_KEY: 'k' }))).toEqual({
      ids: "its operator's yes",
      theirstack: 'THEIRSTACK_API_KEY',
      adzuna: 'ADZUNA_APP_ID, ADZUNA_APP_KEY',
    });
  });
});
