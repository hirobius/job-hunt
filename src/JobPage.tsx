// A saved job's own page (#127, #130): `#/queue/<jobId>`, inside the Pipeline tab. A header
// (title, status, one next step, menu) over the job's sections as tabs. The open tab is local
// state, not in the URL, and resets to Overview when the job changes.
import { useEffect } from 'react';
import { Box, Tabs, TabsContent, TabsList, TabsTrigger } from '@hirobius/design-system';
import { findJobById, useJobs } from './store';
import { openJob } from './route';
import { useCloudSync } from './account/accountContext';
import EmptyState from './EmptyState';
import JobHeader from './JobHeader';
import JobOverview from './JobOverview';
import JobScreening from './JobScreening';
import JobInterviews from './JobInterviews';
import { TodosNotes } from './TodosNotes';
import type { Job } from './types';

const withCount = (label: string, n: number) => (n > 0 ? `${label} (${n})` : label);

function JobSections({ job }: { job: Job }) {
  const openTodos = (job.todos ?? []).filter((t) => !t.done).length;
  // Panels sit flush under the list; the tab list keeps its own bottom rule.
  const panel = { marginTop: 'var(--primitive-space-4)' } as const;
  return (
    <Tabs defaultValue="overview">
      <TabsList aria-label="Job sections">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="screening">Screening</TabsTrigger>
        <TabsTrigger value="interviews">
          {withCount('Interviews', job.events?.length ?? 0)}
        </TabsTrigger>
        <TabsTrigger value="todos">{withCount('To-dos', openTodos)}</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" style={panel}>
        <JobOverview job={job} />
      </TabsContent>
      <TabsContent value="screening" style={panel}>
        <JobScreening job={job} />
      </TabsContent>
      <TabsContent value="interviews" style={panel}>
        <JobInterviews job={job} />
      </TabsContent>
      <TabsContent value="todos" style={panel}>
        <TodosNotes key={job.url} job={job} />
      </TabsContent>
    </Tabs>
  );
}

export default function JobPage({ jobId }: { jobId: string }) {
  const job = findJobById(jobId, useJobs());
  // An unknown id may just not have synced onto this device yet: wait until sync has settled,
  // then fall back to the Pipeline without a new history entry.
  const { settled } = useCloudSync();

  useEffect(() => {
    if (!job && settled) openJob(null, true);
  }, [job, settled]);

  // Opening a job from far down the list should start at its top, not at the list's scroll offset.
  useEffect(() => {
    window.scrollTo?.({ top: 0 });
  }, [jobId]);

  if (!job)
    return <EmptyState title="Job not found" message="It may still be syncing to this device." />;

  return (
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <JobHeader job={job} />
      {/* Keyed by job, so the open tab and every field's draft reset when the job changes. */}
      <JobSections key={job.url} job={job} />
    </Box>
  );
}
