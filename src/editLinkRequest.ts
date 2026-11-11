// The dock's Add link (#540) asks the job page's Details panel to open its fields with focus on
// Link. A one-shot request by job URL: the panel that shows that job takes it, once.
let pending: string | null = null;
const listeners = new Set<() => void>();

/** Ask the Details panel of the job at `url` to open on its Link field. */
export function requestEditLink(url: string): void {
  pending = url;
  listeners.forEach((l) => l());
}

/** True (once) when a request for `url` is waiting; it is then cleared. */
export function takeEditLink(url: string): boolean {
  if (pending !== url) return false;
  pending = null;
  return true;
}

export function subscribeEditLink(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
