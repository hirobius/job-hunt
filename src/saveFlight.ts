// Save on Find (#688): the card lifts and flies to the Apply tab (which pulses), then the usual
// collapse closes the gap. Reduced motion or Pause animations: the collapse alone. Its own module so
// the flight's lazy import stays out of the entry's chunks (feedback.ts is in the entry).
import { collapseRow, motionOk, rowOf } from './feedback';
import { motionPaused } from './motionPref';
import { importFresh } from './staleBuild';

const loadBurn = importFresh(() => import('./burn/burn'));

export function saveRow(from: Element | null, then: () => void) {
  const row = rowOf(from);
  if (!(row instanceof HTMLElement) || !motionOk() || motionPaused())
    return collapseRow(from, then);
  void loadBurn()
    .then((b) => b.flyToApply(row))
    .catch(() => undefined)
    .then(() => collapseRow(from, then));
}
