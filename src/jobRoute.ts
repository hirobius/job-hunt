// A job's own page lives at #/queue/<encoded job url>. The job URL is the job's identity in the
// store, so it doubles as the route key; encoding keeps its slashes and query out of the hash path.
export const jobHref = (url: string) => `#/queue/${encodeURIComponent(url)}`;

/** The job url a Tracker sub-route points at, or null when the sub-route isn't a job page. */
export function jobUrlFromSub(sub: string | null): string | null {
  if (!sub) return null;
  try {
    const url = decodeURIComponent(sub);
    return /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}
