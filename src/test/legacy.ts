// One test of the old Companies screens in a file of live ones (legacyScreens.ts): their routes
// and tab are reachable for this test only, until #389 deletes them.
import { onTestFinished } from 'vitest';
import { setLegacyScreens } from '../legacyScreens';

export function legacyScreensForThisTest(): void {
  setLegacyScreens(true);
  onTestFinished(() => setLegacyScreens(false));
}
