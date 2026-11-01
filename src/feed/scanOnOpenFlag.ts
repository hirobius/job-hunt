// Whether the auto-scan runs on app open (#415). Off until main.tsx turns it on: unit tests render
// App without main.tsx, so they never read the network on open (and never load the scan's code);
// the suites that test it turn it on. Its own module, with no imports, so main.tsx and App can
// read it without pulling the scan into the first chunk.
let enabled = false;

export function setScanOnOpen(on: boolean): void {
  enabled = on;
}

export const scanOnOpenEnabled = (): boolean => enabled;
