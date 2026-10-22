import { afterEach, describe, expect, it } from 'vitest';
import {
  challengeFor,
  finishConnect,
  parseCallback,
  PENDING_STORAGE,
  PENDING_TTL_MS,
  readPending,
  safeReturnHash,
  startConnect,
  type FetchLike,
} from './oauth';
import { getKey, KEY_STORAGE } from './connection';

const KEY = 'sk-or-v1-fresh-user-key-0001';
const okExchange =
  (calls: RequestInit[] = []): FetchLike =>
  async (_u, init) => {
    calls.push(init);
    return new Response(JSON.stringify({ key: KEY }), { status: 200 });
  };

async function begin(now = 1_000) {
  const url = await startConnect({
    origin: 'https://app.test',
    path: '/',
    returnHash: '#/queue/abc?section=screening',
    now,
  });
  const p = readPending()!;
  return { url: new URL(url), pending: p };
}

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('OpenRouter PKCE connect', () => {
  it('computes the RFC 7636 S256 challenge: base64url(sha256(verifier)), unpadded', async () => {
    const { createHash } = await import('node:crypto');
    const v = 'dBjftJeZ4CVP-mJ92K1QqtyD4s5i5MPBEhEm3QQJiJyU';
    expect(await challengeFor(v)).toBe(createHash('sha256').update(v).digest('base64url'));
    expect(await challengeFor(v)).not.toMatch(/[+/=]/);
  });

  it('sends only the challenge and a state-bearing callback to openrouter.ai/auth', async () => {
    const { url, pending } = await begin();
    expect(url.origin + url.pathname).toBe('https://openrouter.ai/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(await challengeFor(pending.verifier));
    expect(url.toString()).not.toContain(pending.verifier);
    expect(url.searchParams.get('callback_url')).toBe(`https://app.test/?rf_ai=${pending.state}`);
  });

  it('exchanges the code with the verifier and stores the key locally', async () => {
    const { pending } = await begin();
    const calls: RequestInit[] = [];
    const r = await finishConnect(
      { state: pending.state, code: 'abc123', error: null },
      { fetch: okExchange(calls), now: 2_000 },
    );
    expect(r).toEqual({ ok: true, returnHash: '#/queue/abc?section=screening' });
    expect(JSON.parse(String(calls[0].body))).toEqual({
      code: 'abc123',
      code_verifier: pending.verifier,
      code_challenge_method: 'S256',
    });
    expect(getKey()).toBe(KEY);
    expect(localStorage.getItem(KEY_STORAGE)).toBe(KEY);
    expect(sessionStorage.getItem(PENDING_STORAGE)).toBeNull();
  });

  it('refuses a callback whose state doesn’t match, and forgets the verifier', async () => {
    await begin();
    const calls: RequestInit[] = [];
    const r = await finishConnect(
      { state: 'forged', code: 'abc', error: null },
      { fetch: okExchange(calls) },
    );
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(getKey()).toBeNull();
    expect(readPending()).toBeNull();
  });

  it('refuses a callback with no pending connect (another tab, a replay)', async () => {
    const r = await finishConnect(
      { state: 'x', code: 'abc', error: null },
      { fetch: okExchange() },
    );
    expect(r).toMatchObject({ ok: false, returnHash: '#/queue' });
  });

  it('refuses a stale connect', async () => {
    const { pending } = await begin(0);
    const r = await finishConnect(
      { state: pending.state, code: 'abc', error: null },
      { fetch: okExchange(), now: PENDING_TTL_MS + 1 },
    );
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/too long/) });
  });

  it('a cancel saves nothing and says so', async () => {
    const { pending } = await begin();
    const r = await finishConnect(
      { state: pending.state, code: null, error: 'access_denied' },
      { fetch: okExchange(), now: 2_000 },
    );
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/cancelled/) });
    expect(getKey()).toBeNull();
  });

  it.each([
    ['a refused exchange', (async () => new Response('{}', { status: 400 })) as FetchLike],
    ['no key in the answer', (async () => new Response('{"key":""}')) as FetchLike],
    ['an unreadable answer', (async () => new Response('<html>')) as FetchLike],
    ['a network failure', (() => Promise.reject(new TypeError('x'))) as FetchLike],
  ])('%s stores nothing', async (_n, fetch) => {
    const { pending } = await begin();
    const r = await finishConnect(
      { state: pending.state, code: 'abc', error: null },
      { fetch, now: 2_000 },
    );
    expect(r.ok).toBe(false);
    expect(getKey()).toBeNull();
  });

  it('reads the callback either way a provider appends the code', () => {
    expect(parseCallback('?rf_ai=s1&code=c1')).toEqual({ state: 's1', code: 'c1', error: null });
    expect(parseCallback('?rf_ai=s1?code=c1')).toEqual({ state: 's1', code: 'c1', error: null });
    expect(parseCallback('?add=x')).toBeNull();
  });

  it('only returns to an in-app route', () => {
    expect(safeReturnHash('#/queue/a?section=screening')).toBe('#/queue/a?section=screening');
    expect(safeReturnHash('https://evil.example')).toBe('#/queue');
    expect(safeReturnHash('#/x"><script>')).toBe('#/queue');
  });
});
