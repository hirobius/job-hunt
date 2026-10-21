// A saved job's own page (#127, #130): `#/queue/<jobId>`, inside the Pipeline tab. A header
// (title, status, one next step, menu) over the job's sections as tabs. The open tab is local
// state, not in the URL, and resets to Overview when the job changes.
import { useEffect, useState } from 'react';
import {
  Box,
  Skeleton,
  Stack,
  Text,
  Sidebar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useAtLeast,
} from '@hirobius/design-system';
import { findJobById, useJobs } from './store';
import { openJob } from './route';
import { useCloudSync } from './account/accountContext';
import JobHeader from './JobHeader';
import JobOverview from './JobOverview';
import JobRail from './JobRail';
import TabsOverflowFade from './hds-gaps/TabsOverflowFade';
import JobScreening from './JobScreening';
import JobInterviews from './JobInterviews';
import { TodosNotes } from './TodosNotes';
import JobDocuments from './JobDocuments';
import JobFinalCopies from './JobFinalCopies';
import { DocumentDownload } from './DocumentDownload';
import { useDocuments } from './documents';
import { documentsForJob } from './jobDocuments';
import type { Job } from './types';

const withCount = (label: string, n: number) => (n > 0 ? `${label} (${n})` : label);

function JobSections({ job }: { job: Job }) {
  const [tab, setTab] = useState('overview');
  const openTodos = (job.todos ?? []).filter((t) => !t.done).length;
  const docCount = documentsForJob(useDocuments(), job.url).length;
  // HDS TabsContent is a padded surface (as for the shell's tabs, see App.tsx BARE_PANEL): make
  // it bare so the section sits on the page, a step under the tab rule.
  const panel = {
    background: 'transparent',
    padding: 0,
    borderRadius: 0,
    marginTop: 'var(--primitive-space-4)',
  } as const;
  return (
    <Tabs value={tab} onValueChange={setTab}>
      {/* Five tabs can outrun a 390px phone: the fade says more sit past the edge. */}
      <TabsOverflowFade value={tab}>
        <TabsList aria-label="Job sections" style={{ marginBottom: 0 }}>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="screening">Screening</TabsTrigger>
          <TabsTrigger value="interviews">
            {withCount('Interviews', job.events?.length ?? 0)}
          </TabsTrigger>
          <TabsTrigger value="todos">{withCount('To-dos', openTodos)}</TabsTrigger>
          <TabsTrigger value="documents">{withCount('Documents', docCount)}</TabsTrigger>
        </TabsList>
      </TabsOverflowFade>
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
      <TabsContent value="documents" style={panel}>
        <JobDocuments
          job={job}
          versionActions={(doc, version) => (
            <DocumentDownload doc={doc} version={version} job={job} />
          )}
          uploadSlot={<JobFinalCopies jobUrl={job.url} />}
        />
      </TabsContent>
    </Tabs>
  );
}

function JobPageSkeleton() {
  return (
    <Box aria-busy="true" sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <Text variant="ui" as="p" role="status" tone="secondary">
        Looking for this job. It may still be syncing to this device.
      </Text>
      <Stack gap="normal" aria-hidden="true">
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="35%" />
        <Skeleton variant="rectangular" height={120} />
      </Stack>
    </Box>
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

  // HDS Sidebar only wraps with CSS, so below lg it would stack the list above the job: choose in
  // JS and show the job alone, with a Back link, instead.
  const wide = useAtLeast('lg');

  // Not found yet: it may be about to sync in, so wait quietly. Once sync has settled the effect
  // above has already sent us back to the Pipeline.
  if (!job) return <JobPageSkeleton />;

  const detail = (
    <Box>
      <JobHeader job={job} showBack={!wide} />
      {/* Keyed by job, so the open tab and every field's draft reset when the job changes. */}
      <JobSections key={job.url} job={job} />
    </Box>
  );
  if (wide)
    return (
      <Sidebar side="start" sideWidth="22rem" contentMin="50%" gap="normal">
        <JobRail openId={jobId} />
        {detail}
      </Sidebar>
    );
  return <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>{detail}</Box>;
}
