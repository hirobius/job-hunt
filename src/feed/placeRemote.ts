// A posting card's place line already says remote (Adrian 2026-11-12, reversing #616's "once, also
// when the place says Remote"): then the work-mode line is left out, so "Remote (US)" is not
// followed by "Remote". The one remote rule, classifyRemote, reads the place text.
import { classifyRemote } from './mode';

export function placeSaysRemote(place: string): boolean {
  const c = classifyRemote(place);
  return c.mode === 'remote' || c.offersRemote;
}
