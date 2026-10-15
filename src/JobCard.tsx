import { Stack, Textarea } from '@hirobius/design-system';
import { updateJob } from './store';
import { ScreeningEditor } from './ScreeningEditor';
import InterviewLog from './InterviewLog';
import { TodosNotes } from './TodosNotes';
import type { Job } from './types';

// Interim (#130 slice 1): what the job page has not yet moved under its tabs. Deleted in slice 3.
export default function JobCard({ job }: { job: Job }) {
  return (
    <Stack gap="normal">
      <TodosNotes job={job} />
      <ScreeningEditor job={job} />
      <InterviewLog job={job} />
      <Textarea
        label="Notes"
        rows={2}
        value={job.note || ''}
        onChange={(e) => updateJob(job.url, { note: e.target.value })}
        style={{ width: '100%' }}
      />
    </Stack>
  );
}
