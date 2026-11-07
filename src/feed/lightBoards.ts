// Phones read board lists without descriptions (2026-11-07, the phone profile on #496): a Greenhouse
// board with `?content=true` is 2-3 MB, and its JSON.parse alone was a long task of ~3 s at 4x CPU
// throttle. Below lg, Greenhouse boards are read as their plain list (~14x smaller); a posting's
// text is fetched when it is opened (postingText.ts). Off where matchMedia is missing: the server
// sync (Deno), the scripts and jsdom tests read full boards as before.
const PHONE = '(max-width: 1023.98px)';

let forced: boolean | null = null;

/** True when board lists should be read without descriptions (a phone-sized window). */
export function lightBoards(): boolean {
  if (forced !== null) return forced;
  return typeof matchMedia === 'function' && matchMedia(PHONE).matches;
}

/** Tests: force light reads on or off (null: follow the window). */
export function setLightBoards(on: boolean | null): void {
  forced = on;
}
