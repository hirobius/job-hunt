// The Apply list's agenda (#236, was Today): "Follow up", due ones first, and the next 7 days of
// interviews and calls. Sections with nothing in them render nothing. There is no To apply panel
// or Start applying any more (#471, Adrian 2026-11-05): the Apply tab is the walk, and a row in its
// list opens the job's Apply view.
import { FollowUpSection, NextDaysSection } from './PipelineAgenda';
import { useAgendaNow } from './useAgendaNow';
import type { Job } from './types';

export default function ApplyQueueSummary({ jobs }: { jobs: Job[] }) {
  // Re-read at midnight and on return to the tab, so the agenda never shows yesterday (#309).
  const now = useAgendaNow(jobs);
  return (
    <>
      <FollowUpSection jobs={jobs} now={now} />
      <NextDaysSection jobs={jobs} now={now} />
    </>
  );
}
