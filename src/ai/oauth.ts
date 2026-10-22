// Connect your own AI: OpenRouter's OAuth PKCE flow (https://openrouter.ai/docs, OAuth PKCE).
// The browser makes a random verifier, sends only its SHA-256 challenge to openrouter.ai/auth, and
// trades the code that comes back (with the verifier) for a key at /api/v1/auth/keys. The key is
// the user's own: no server and no key of ours is involved.
//
// OpenRouter's flow has no `state` parameter, so ours rides in the callback URL (`?rf_ai=<state>`)
// and must match the one kept in sessionStorage for this tab: a callback we didn't start, a stale
// one, or one replayed from another tab is refused. The verifier never leaves this tab until the
// exchange, and is deleted on every outcome.
import { saveKey, validKey } from './connection';

export const AUTH_URL = 'https://openrouter.ai/auth';
export const EXCHANGE_URL = 'https://openrouter.ai/api/v1/auth/keys';
export const CALLBACK_PARAM = 'rf_ai';
export const PENDING_STORAGE = 'rjb_ai_pending';
/** How long a started connect stays valid. */
export const PENDING_TTL_MS = 15 * 60 * 1000;

export interface Pending {
  state: string;
  verifier: string;
  /** The page to come back to (`#/queue/<id>?section=screening`). */
  returnHash: string;
  startedAt: number;
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64url(a);
}

/** RFC 7636 S256: base64url(sha256(verifier)). */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/** Only an in-app hash route comes back from the callback; anything else lands on the Pipeline. */
export function safeReturnHash(hash: string): string {
  return /^#\/[\w\-/?=&.%]*$/.test(hash) && hash.length <= 300 ? hash : '#/queue';
}

export function callbackUrl(origin: string, path: string, state: string): string {
  return `${origin}${path}?${CALLBACK_PARAM}=${encodeURIComponent(state)}`;
}

export function authUrl(callback: string, challenge: string): string {
  const q = new URLSearchParams({
    callback_url: callback,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${q}`;
}

function savePending(p: Pending) {
  sessionStorage.setItem(PENDING_STORAGE, JSON.stringify(p));
}

export function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_STORAGE);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Pending>;
    if (
      typeof p.state !== 'string' ||
      typeof p.verifier !== 'string' ||
      typeof p.returnHash !== 'string' ||
      typeof p.startedAt !== 'number'
    )
      return null;
    return p as Pending;
  } catch {
    return null;
  }
}

export function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_STORAGE);
  } catch {
    /* nothing to clear */
  }
}

/** Builds the sign-in URL and remembers the verifier for this tab. The caller navigates to it. */
export async function startConnect(where: {
  origin: string;
  path: string;
  returnHash: string;
  now?: number;
}): Promise<string> {
  const state = randomToken(16);
  const verifier = randomToken(32);
  savePending({
    state,
    verifier,
    returnHash: safeReturnHash(where.returnHash),
    startedAt: where.now ?? Date.now(),
  });
  return authUrl(callbackUrl(where.origin, where.path, state), await challengeFor(verifier));
}

export interface Callback {
  state: string;
  code: string | null;
  error: string | null;
}

/** Reads our callback from `location.search`, or null when this load isn't one. Copes with a
 *  provider that appends `?code=` to a callback URL that already has a query. */
export function parseCallback(search: string): Callback | null {
  const q = new URLSearchParams(search);
  const raw = q.get(CALLBACK_PARAM);
  if (raw === null) return null;
  const [state, tail] = raw.split('?');
  const inner = new URLSearchParams(tail ?? '');
  return {
    state,
    code: q.get('code') ?? inner.get('code'),
    error: q.get('error') ?? inner.get('error'),
  };
}

export type ConnectResult =
  { ok: true; returnHash: string } | { ok: false; reason: string; returnHash: string };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Finishes a connect. Every path clears the pending verifier; only a matching state, a live
 *  verifier and a well-formed key from OpenRouter store anything. */
export async function finishConnect(
  cb: Callback,
  opts: { fetch?: FetchLike; now?: number } = {},
): Promise<ConnectResult> {
  const pending = readPending();
  clearPending();
  const now = opts.now ?? Date.now();
  const back = pending?.returnHash ?? '#/queue';
  if (!pending || !cb.state || cb.state !== pending.state)
    return {
      ok: false,
      reason: 'That AI connection link isn’t from this tab. Connect again.',
      returnHash: back,
    };
  if (now - pending.startedAt > PENDING_TTL_MS)
    return {
      ok: false,
      reason: 'That AI connection took too long. Connect again.',
      returnHash: back,
    };
  if (cb.error || !cb.code)
    return { ok: false, reason: 'AI connection cancelled. Nothing was saved.', returnHash: back };
  if (!/^[\w.\-~]{1,512}$/.test(cb.code))
    return {
      ok: false,
      reason: 'OpenRouter sent back a code we couldn’t read. Connect again.',
      returnHash: back,
    };
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  let res: Response;
  try {
    res = await doFetch(EXCHANGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: cb.code,
        code_verifier: pending.verifier,
        code_challenge_method: 'S256',
      }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    return {
      ok: false,
      reason: 'Couldn’t reach OpenRouter. Check your connection and connect again.',
      returnHash: back,
    };
  }
  if (!res.ok)
    return {
      ok: false,
      reason: 'OpenRouter refused the connection. Connect again.',
      returnHash: back,
    };
  let key: string | null;
  try {
    key = validKey(((await res.json()) as { key?: unknown }).key);
  } catch {
    key = null;
  }
  if (!key || !saveKey(key))
    return {
      ok: false,
      reason: 'OpenRouter didn’t send a usable key. Connect again.',
      returnHash: back,
    };
  return { ok: true, returnHash: back };
}

/** Leaves for OpenRouter's sign-in page (a seam, so tests don't navigate). */
export const leave = { to: (url: string) => window.location.assign(url) };

/** Starts a connect from the page the user is on; they come back to it. */
export async function connectFromHere(): Promise<void> {
  const url = await startConnect({
    origin: window.location.origin,
    path: window.location.pathname,
    returnHash: window.location.hash,
  });
  leave.to(url);
}
