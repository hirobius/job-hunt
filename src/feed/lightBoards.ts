// Browsers read board lists without descriptions (2026-11-07 on phones, the phone profile on #496;
// every width since the perf pass of 2026-11-14): a Greenhouse board with `?content=true` is 2-10 MB,
// and its JSON.parse plus the HTML-to-text of every job was a long task of ~3 s at 4x CPU throttle
// (1.6 s of blocking time on Review at 1350px). Greenhouse boards are read as their plain list (~14x
// smaller), the postings the title check lets in get their text (lightText.ts), and an opened one
// reads its whole description anyway (postingBody.ts). Off where matchMedia is missing: the server
// sync (Deno), the scripts and jsdom tests read full boards as before.

let forced: boolean | null = null;

/** True when board lists should be read without descriptions (any browser window). */
export function lightBoards(): boolean {
  if (forced !== null) return forced;
  return typeof matchMedia === 'function';
}

/** Tests: force light reads on or off (null: follow the window). */
export function setLightBoards(on: boolean | null): void {
  forced = on;
}
