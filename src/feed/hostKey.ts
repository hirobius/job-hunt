// The registrable domain a request goes to (the last two labels), so every `*.recruitee.com` board
// shares one politeness budget and all of Greenhouse is one host. Its own module, with no storage
// or app imports, so the probe (probe.ts), the bulk discovery script and the server's scan
// rotation (src/tracks/rotation.ts, loaded by Deno) share the one rule.

/** The registrable domain of a URL (the URL itself when it does not parse). */
export function hostKey(url: string): string {
  try {
    return new URL(url).hostname.split('.').slice(-2).join('.');
  } catch {
    return url;
  }
}
