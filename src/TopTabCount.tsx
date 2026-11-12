// The count beside a top tab (redesign §5.1, #548): Find shows the new postings Review new last read
// ("N new today"), Apply its To apply count (Remote only counts, the view does not: the same number as
// the To apply chip, so the tab's count keeps one meaning whatever view is open). A lazy chunk: pipelineView is not in the entry, and the entry is
// at its size budget. Nothing while the count is 0 or not known yet (Find before Review new has read).
// Plain text after the label, the way the view chips read ("To apply 21"): a Badge's chrome made the
// row too wide for one line at 390 once both tabs had a count.
import { useScanDetails } from './feed/scanDetails';
import { filterCounts, usePipelineView } from './pipelineView';
import { FIND_TAB } from './route';
import { useJobs } from './store';
import type { TopTab } from './tabMemory';

/** Over 99 reads "99+", so the row keeps its width. */
const countText = (n: number) => (n > 99 ? '99+' : String(n));

export default function TopTabCount({ tab }: { tab: TopTab }) {
  const details = useScanDetails();
  const jobs = useJobs();
  const { remoteOnly } = usePipelineView();
  const n =
    tab === FIND_TAB
      ? (details?.newToday ?? 0)
      : filterCounts(jobs, undefined, !!remoteOnly).toApply;
  // Text beside the label's own text: one run "Apply 12", and so the link's name.
  return n > 0 ? ` ${countText(n)}` : null;
}
