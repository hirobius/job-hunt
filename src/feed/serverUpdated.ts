// #448: the server sync runs every 15 minutes, so Today says how fresh its results are: "Updated 4
// min ago". Read once when Today opens and every 5 minutes after, only while signed in. Nothing
// shows before the first run, or when the read fails.
import { useEffect, useState } from 'react';
import { loadServerUpdatedAt } from '../tracks/postings';

export const SERVER_UPDATED_POLL_MS = 5 * 60_000;

/** How long ago, in the app's words: "just now" / "4 min ago" / "2 h ago" / "Nov 3"; null for no time. */
export function agoPhrase(
  at: string | number | null | undefined,
  now: number = Date.now(),
): string | null {
  if (at === null || at === undefined || at === '') return null;
  const t = typeof at === 'number' ? at : Date.parse(at);
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "Updated just now" / "Updated 4 min ago" / "Updated 2 h ago" / "Updated Nov 3"; null for no time. */
export function serverUpdatedLine(at: string | null, now: number = Date.now()): string | null {
  const ago = agoPhrase(at, now);
  return ago && `Updated ${ago}`;
}

/** The server's last run for the signed-in user, re-read every 5 minutes; null while signed out. */
export function useServerUpdated(signedIn: boolean): string | null {
  const { at, now } = useServerUpdatedAt(signedIn);
  return serverUpdatedLine(at, now);
}

/** The server's last run time (ISO) and a clock that moves each minute; `at` is null while
 *  signed out, before the first run, or when the read fails. */
export function useServerUpdatedAt(signedIn: boolean): { at: string | null; now: number } {
  const [at, setAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    const read = () => {
      loadServerUpdatedAt()
        .then((v) => {
          if (live) {
            setAt(v);
            setNow(Date.now());
          }
        })
        .catch(() => {});
    };
    read();
    const t = setInterval(read, SERVER_UPDATED_POLL_MS);
    // The minutes move on between reads.
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      live = false;
      clearInterval(t);
      clearInterval(tick);
    };
  }, [signedIn]);
  // Signed out shows nothing, even if a read from before the sign-out is still held.
  return { at: signedIn ? at : null, now };
}
