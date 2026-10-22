// Where a sign-in magic link may send the user back to (#44).
//
// The client only ever asks for one of this app's own origins, at the root (the app is a
// hash-routed SPA, so no path, query or hash is needed and none can be smuggled in). Anything
// else falls back to production. This is defence in depth: the server-side control is the
// Supabase dashboard's Redirect URLs allow-list (Auth > URL Configuration), which Adrian owns;
// a redirect Supabase does not allow is replaced by its Site URL whatever the client asks.

export const PRODUCTION_ORIGIN = 'https://roleforge-app.vercel.app';

/** The old production address. Still accepted while Adrian moves over (a link opened there
 *  lands back there); drop it once it redirects to PRODUCTION_ORIGIN. */
export const LEGACY_ORIGIN = 'https://job-hunt-jade.vercel.app';

/** Vercel deployment URLs of this project: `job-hunt-<9-char id>-<team slug>.vercel.app`.
 *  Branch aliases (`job-hunt-git-<branch>-…`) are left out: a hyphenated branch slug makes
 *  the team suffix ambiguous, so they fall back to production. */
const PREVIEW_ORIGIN = /^https:\/\/job-hunt-[a-z0-9]{9}-adrian-6234s-projects\.vercel\.app$/;

/** Local dev (`vite`) and preview (`vite preview`, e2e, gallery) servers. */
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1):([0-9]{1,5})$/;

function isAllowedOrigin(origin: string): boolean {
  if (origin === PRODUCTION_ORIGIN || origin === LEGACY_ORIGIN || PREVIEW_ORIGIN.test(origin))
    return true;
  const local = LOCAL_ORIGIN.exec(origin);
  if (!local) return false;
  const port = Number(local[1]);
  return port > 0 && port <= 65535;
}

/** The `emailRedirectTo` for a magic link sent from `loc`: an allowed origin, always at `/`. */
export function magicLinkRedirect(loc: { origin: string; pathname?: string }): string {
  const origin = isAllowedOrigin(loc.origin) ? loc.origin : PRODUCTION_ORIGIN;
  return `${origin}/`;
}
