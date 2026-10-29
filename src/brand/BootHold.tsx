// The data half of the boot reveal: index.html's splash covers the app's code loading (React
// replaces it on mount); this covers the one wait after that, a signed-in device with nothing on
// it while its cloud copy arrives, so the first-run setup never flashes before the user's jobs.
// A ready app is never held: `waiting` is decided once at boot, the hold ends the moment sync
// settles (or after BOOT_HOLD_MAX_MS), and once the page has shown it never goes back.
import { useEffect, useState, type ReactNode } from 'react';
import { BRAND } from '../brand';
import { Flame } from './Flame';

export const BOOT_HOLD_MAX_MS = 4000;

export function BootHold({
  waiting,
  settled,
  children,
}: {
  /** True only when the boot found a stored session and no local data. */
  waiting: boolean;
  settled: boolean;
  children: ReactNode;
}) {
  const [done, setDone] = useState(!waiting || settled);
  // Settling latches the page on (set during render, so the flame never paints a frame late).
  if (settled && !done) setDone(true);
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setDone(true), BOOT_HOLD_MAX_MS);
    return () => clearTimeout(t);
  }, [done]);
  if (done) return <>{children}</>;
  return (
    <div className="rjb-boot-hold" role="status" aria-label={`Loading ${BRAND.name}`}>
      <Flame reveal />
    </div>
  );
}
