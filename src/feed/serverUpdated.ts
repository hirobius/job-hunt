// #448: the server sync runs every 15 minutes, so Today says how fresh its results are: "Updated 4
// min ago". Read once when Today opens and every 5 minutes after, only while signed in. Nothing
// shows before the first run, or when the read fails.
import { useEffect, useState } from 'react';
import { loadServerUpdatedAt } from '../tracks/postings';

export const SERVER_UPDATED_POLL_MS = 5 * 60_000;

/** "Updated just now" / "Updated 4 min ago" / "Updated 2 h ago" / "Updated Nov 3"; null for no time. */
export function serverUpdatedLine(at: string | null, now: number = Date.now()): string | null {
  if (!at) return null;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return null;
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min < 1) return 'Updated just now';
  if (min < 60) return `Updated ${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Updated ${h} h ago`;
  return `Updated ${new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** The server's last run for the signed-in user, re-read every 5 minutes; null while signed out. */
export function useServerUpdated(signedIn: boolean): string | null {
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
  return signedIn ? serverUpdatedLine(at, now) : null;
}
