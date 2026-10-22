// Session tokens in the URL (the magic link's implicit flow lands on `#access_token=…`). They are
// read once, when this module first loads, and stripped from the address bar at once, so nothing
// later can see them: not the router, not analytics, not a crash report, not the next page.
// main.tsx imports this module first, before the router reads the hash.
//
// The tokens are only held here. Whether they may sign this browser in is the account seam's call
// (account/authLink.ts): a link nobody asked for in this browser needs a confirm first.

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

/** The params a Supabase auth callback can carry in the fragment. */
const TOKEN_PARAMS = ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token'];

/** The session tokens in a URL fragment, or null. */
export function readAuthTokens(hash: string): AuthTokens | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}

/** Whether a fragment carries any token at all (a half link is stripped too). */
export const hasTokenParams = (hash: string): boolean => {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  return TOKEN_PARAMS.some((k) => p.has(k));
};

/** Drop the fragment when it carries tokens (in place: no history entry holds them). */
export function stripAuthFragment(
  loc: Pick<Location, 'hash' | 'pathname' | 'search'> = window.location,
  hist: Pick<History, 'replaceState' | 'state'> = window.history,
): void {
  if (!hasTokenParams(loc.hash)) return;
  try {
    hist.replaceState(hist.state, '', loc.pathname + loc.search);
  } catch {
    /* a sandboxed frame: the tokens are still never used without the checks */
  }
}

let captured: AuthTokens | null = null;
/** This tab opened from a sign-in link (read at load, before the fragment is stripped). */
export let openedFromAuthLink = false;
if (typeof window !== 'undefined') {
  captured = readAuthTokens(window.location.hash);
  openedFromAuthLink = captured !== null;
  stripAuthFragment();
}

/** The tokens this page load arrived with, still unclaimed (peek). */
export const bootAuthTokens = (): AuthTokens | null => captured;

/** Claim the tokens this page load arrived with (once: a second call gets null). */
export function takeBootAuthTokens(): AuthTokens | null {
  const t = captured;
  captured = null;
  return t;
}
