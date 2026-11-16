// Scans run on the server only (#756, ADR 0012). Phase 1: one switch for every browser read of a
// job source. On (the default) the app is as before. Off: the scan on open does not mount, Review
// reads only the server's rows (no browser read when there are none), a company or title added
// since the last read is not read in the browser, and there is no Scan now. Its own module, with
// no imports, so App and the feed read it without pulling the scan in. Phase 5 turns it off; phase
// 6 deletes it with the browser scan code.
let on = true;

export const browserScans = (): boolean => on;

/** Tests, and the phase 5 flip. */
export function setBrowserScans(value: boolean): void {
  on = value;
}
