// The one rule for a link that came from outside (a third-party feed, the cloud blob, a backup):
// only http(s) becomes an href. `javascript:`, `data:` and the rest are dropped or shown as text.

/** The value when it is an absolute http(s) URL, else undefined. */
export const httpUrl = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? v : undefined;
  } catch {
    return undefined;
  }
};

/** Schemes that run code or carry a page of their own when opened. */
const SCRIPT_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'blob:', 'file:'];

/** A stored job link may be kept: anything but a scheme that runs code. The store keeps web links,
 *  bare addresses (`acme.com/jobs/1`) and placeholders with no link (`notes:designer`), and every
 *  view puts the link in an href, so `javascript:` / `data:` are refused here, read the way a
 *  browser reads them (it drops tabs and newlines, so `java\tscript:` is still `javascript:`). */
export const safeJobUrl = (v: string): boolean => {
  try {
    return !SCRIPT_SCHEMES.includes(new URL(v, 'https://relative.invalid/').protocol);
  } catch {
    return true; // not a URL at all: shown as text, never a working link
  }
};
