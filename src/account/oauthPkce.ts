// "Continue with Google" (#482) and "Continue with LinkedIn" (Supabase's linkedin_oidc), bound to this browser with PKCE. The start makes a random code
// verifier, keeps it here, and sends only its SHA-256 challenge to Supabase's /authorize. Google's
// round trip comes back to the app's root with `?code=…`, and the code is worth a session only
// together with the verifier this browser kept (Supabase's token endpoint checks the pair). So a
// link carrying someone else's code, or someone else's tokens, can never sign in here on its own:
// tokens in the URL still go through the magic link's guard (authLink.ts), which asks first.
//
// The shared client stays on the implicit flow (a magic link must work on another device), so the
// exchange is a plain call to the token endpoint, then `setSession` with the tokens it answers.
import type { AuthTokens } from '../authFragment';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

import { tokenEmail } from './authLink';
export const OAUTH_KEY = 'rjb_oauth_request';
export const OAUTH_MAX_AGE_MS = 10 * 60 * 1000;

/** The OAuth providers the sign-in screen offers (Supabase provider ids). */
export type OAuthProvider = 'google' | 'linkedin_oidc';

/** The kept verifier while fresh, else null. */
export function readVerifier(now: number): string | null {
  try {
    const o = JSON.parse(localStorage.getItem(OAUTH_KEY) || 'null') as {
      v?: unknown;
      at?: unknown;
    } | null;
    if (!o || typeof o.v !== 'string' || typeof o.at !== 'number') return null;
    const age = now - o.at;
    return age >= 0 && age <= OAUTH_MAX_AGE_MS ? o.v : null;
  } catch {
    return null;
  }
}

/** Whether this browser started a Google sign-in that is still fresh (tests and the start's error path). */
export const readOAuthRequest = (now = Date.now()): boolean => readVerifier(now) !== null;

export function clearOAuthRequest(): void {
  try {
    localStorage.removeItem(OAUTH_KEY);
  } catch {
    /* ignore */
  }
}

/** Keep the verifier of the OAuth sign-in this browser is starting, and which provider it is for
 *  (`p`: only words the return's messages; the verifier is the binding). */
export function rememberOAuthRequest(
  verifier: string,
  now = Date.now(),
  provider: OAuthProvider = 'google',
): void {
  try {
    localStorage.setItem(OAUTH_KEY, JSON.stringify({ v: verifier, at: now, p: provider }));
  } catch {
    /* storage blocked: the return cannot be exchanged, and says so */
  }
}

/** The kept verifier, once (it is cleared), while fresh; else null. */
export function takeOAuthVerifier(now = Date.now()): string | null {
  const v = readVerifier(now);
  clearOAuthRequest();
  return v;
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** A fresh PKCE code verifier: 32 random bytes, base64url (43 characters). */
export function newVerifier(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** The S256 challenge of a verifier (RFC 7636). */
export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;

/** Swap an authorization code and this browser's verifier for session tokens, or null. */
export async function exchangeCode(
  code: string,
  verifier: string,
  fetchFn: FetchLike = (u, i) => fetch(u, i),
): Promise<AuthTokens | null> {
  try {
    const r = await fetchFn(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    if (!r.ok) return null;
    const o = (await r.json()) as { access_token?: unknown; refresh_token?: unknown };
    return typeof o.access_token === 'string' && typeof o.refresh_token === 'string'
      ? { access_token: o.access_token, refresh_token: o.refresh_token }
      : null;
  } catch {
    return null;
  }
}

/** The bit of the Supabase client the start needs. */
interface OAuthClient {
  auth: {
    signInWithOAuth(o: {
      provider: OAuthProvider;
      options: { redirectTo: string; queryParams: Record<string, string> };
    }): Promise<{ error: { message: string; status?: number } | null }>;
  };
}

/** Start "Continue with <provider>": keep a verifier, send its challenge (the page then leaves).
 *  Resolves to Supabase's error, or null; any failure drops the verifier. */
export async function startOAuth(
  supa: OAuthClient,
  provider: OAuthProvider,
  redirectTo: string,
): Promise<{ message: string; status?: number } | null> {
  try {
    const verifier = newVerifier();
    rememberOAuthRequest(verifier, Date.now(), provider);
    const r = await supa.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: {
          code_challenge: await challengeOf(verifier),
          code_challenge_method: 's256',
        },
      },
    });
    if (r.error) clearOAuthRequest();
    return r.error;
  } catch {
    clearOAuthRequest();
    return { message: 'Failed to fetch' };
  }
}

/** Start "Continue with Google". */
export const startGoogle = (supa: OAuthClient, redirectTo: string) =>
  startOAuth(supa, 'google', redirectTo);

/** An OAuth return's code (Google or LinkedIn) → the session tokens and the email they name, using (once) the
 *  verifier this browser kept; null when there is none, or the exchange is refused. */
export async function oauthSession(
  code: string,
  fetchFn?: FetchLike,
): Promise<{ tokens: AuthTokens; email: string } | null> {
  const verifier = takeOAuthVerifier();
  if (!verifier) return null; // never send a code this browser did not ask for
  const tokens = await exchangeCode(code, verifier, fetchFn);
  const email = tokens ? tokenEmail(tokens.access_token) : null;
  return tokens && email ? { tokens, email } : null;
}

/** The Google name of the same exchange (#482). */
export const googleSession = oauthSession;
